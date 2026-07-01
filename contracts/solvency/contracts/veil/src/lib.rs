#![no_std]
//! Veil — private payments shielded pool on Stellar.
//!
//! A deposit inserts a Poseidon commitment into an incremental Merkle tree and
//! pulls USDC. A withdrawal proves, in zero knowledge, the right to spend ONE
//! note in the tree (membership + a fresh nullifier) WITHOUT revealing which —
//! breaking the deposit↔withdrawal link — and pays out to a recipient bound
//! into the proof.
//!
//! The tree is maintained trustlessly WITHOUT on-chain Poseidon: each deposit
//! carries a Groth16 "insert" proof that `new_root` correctly appends
//! `commitment` to the tree at the contract's current root. All hashing stays
//! in circomlib-Poseidon land (the host's Poseidon2 constants differ); the
//! contract only runs the BN254 pairing check.
//!
//! Public input layouts (must match circuits/):
//!   insert  : [old_root, new_root, commitment, leaf_index]
//!   withdraw: [root, nullifier_hash, recipient, amount]

use soroban_sdk::crypto::bn254::{Bn254Fr, Bn254G1Affine, Bn254G2Affine};
use soroban_sdk::xdr::ToXdr;
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, vec, Address,
    Bytes, BytesN, Env, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    NotAdmin = 3,
    NoVerificationKey = 4,
    InvalidProof = 5,
    StaleRoot = 6,        // deposit's old_root != current root
    BadLeafIndex = 7,     // deposit's leaf_index != current leaf count
    UnknownRoot = 8,      // withdraw root not in history
    NullifierUsed = 9,    // double-spend
    RecipientMismatch = 10, // payout address not bound to the proof
}

/// Groth16 verification key, components as raw BN254 bytes.
#[contracttype]
#[derive(Clone)]
pub struct VkBytes {
    pub alpha: BytesN<64>,
    pub beta: BytesN<128>,
    pub gamma: BytesN<128>,
    pub delta: BytesN<128>,
    pub ic: Vec<BytesN<64>>, // length = num_public_inputs + 1
}

/// Groth16 proof, components as raw BN254 bytes.
#[contracttype]
#[derive(Clone)]
pub struct ProofBytes {
    pub a: BytesN<64>,
    pub b: BytesN<128>,
    pub c: BytesN<64>,
}

#[contracttype]
pub enum DataKey {
    Admin,
    Usdc,
    InsertVk,
    WithdrawVk,
    CurrentRoot,
    LeafCount,
    Root(BytesN<32>),      // seen-root set (persistent)
    Nullifier(BytesN<32>), // spent-nullifier set (persistent)
}

#[contract]
pub struct Veil;

#[contractimpl]
impl Veil {
    /// One-time setup. `empty_root` is the depth-10 empty-tree root (computed
    /// off-chain with the same circomlib Poseidon as the circuits).
    pub fn init(
        env: Env,
        admin: Address,
        usdc: Address,
        empty_root: BytesN<32>,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Usdc, &usdc);
        env.storage().instance().set(&DataKey::CurrentRoot, &empty_root);
        env.storage().instance().set(&DataKey::LeafCount, &0u32);
        // The empty root is itself a valid (historical) root.
        env.storage().persistent().set(&DataKey::Root(empty_root), &true);
        Ok(())
    }

    /// Install the insert + withdraw verification keys (admin only).
    pub fn set_vks(env: Env, insert_vk: VkBytes, withdraw_vk: VkBytes) -> Result<(), Error> {
        Self::require_admin(&env)?;
        env.storage().instance().set(&DataKey::InsertVk, &insert_vk);
        env.storage().instance().set(&DataKey::WithdrawVk, &withdraw_vk);
        Ok(())
    }

    /// Deposit `amount` USDC and append `commitment` to the tree. The caller
    /// proves the append is correct (`old_root` → `new_root`); the contract
    /// trusts no root it didn't verify.
    pub fn deposit(
        env: Env,
        from: Address,
        commitment: BytesN<32>,
        ephemeral_pubkey: BytesN<32>,
        amount: i128,
        new_root: BytesN<32>,
        leaf_index: u32,
        proof: ProofBytes,
    ) -> Result<(), Error> {
        from.require_auth();

        let current: BytesN<32> = env
            .storage()
            .instance()
            .get(&DataKey::CurrentRoot)
            .ok_or(Error::NotInitialized)?;
        let count: u32 = env.storage().instance().get(&DataKey::LeafCount).unwrap();
        if leaf_index != count {
            return Err(Error::BadLeafIndex);
        }

        let vk: VkBytes = env
            .storage()
            .instance()
            .get(&DataKey::InsertVk)
            .ok_or(Error::NoVerificationKey)?;

        // Public inputs: [old_root, new_root, commitment, leaf_index, amount].
        // `amount` binds the pulled USDC to the note's committed value — the insert
        // circuit proves commitment == Poseidon(amount, secret, nullifier), so a
        // depositor cannot commit a large note while under-funding the pool.
        let pub_inputs = vec![
            &env,
            Bn254Fr::from_bytes(current.clone()),
            Bn254Fr::from_bytes(new_root.clone()),
            Bn254Fr::from_bytes(commitment.clone()),
            Bn254Fr::from_bytes(u32_to_fr_bytes(&env, leaf_index)),
            Bn254Fr::from_bytes(i128_to_fr_bytes(&env, amount)),
        ];
        if !Self::groth16_verify(&env, &vk, &proof, &pub_inputs) {
            return Err(Error::InvalidProof);
        }

        // Advance the tree BEFORE the token move (Checks-Effects-Interactions).
        env.storage().instance().set(&DataKey::CurrentRoot, &new_root);
        env.storage().instance().set(&DataKey::LeafCount, &(count + 1));
        env.storage().persistent().set(&DataKey::Root(new_root.clone()), &true);

        // Pull USDC into the pool.
        let usdc: Address = env.storage().instance().get(&DataKey::Usdc).unwrap();
        token::Client::new(&env, &usdc).transfer(
            &from,
            &env.current_contract_address(),
            &amount,
        );

        env.events().publish(
            (symbol_short!("veil"), symbol_short!("deposit")),
            (commitment, ephemeral_pubkey, amount, leaf_index),
        );
        Ok(())
    }

    /// Withdraw `amount` USDC to `to`, proving ownership of an unspent note in
    /// the tree at `root` without revealing which one. `to` is bound to the
    /// proof via keccak256(ScAddress) so a relayer can't redirect the payout.
    pub fn withdraw(
        env: Env,
        proof: ProofBytes,
        root: BytesN<32>,
        nullifier_hash: BytesN<32>,
        to: Address,
        amount: i128,
    ) -> Result<(), Error> {
        // 1. Root must be one the contract actually produced.
        if !env.storage().persistent().has(&DataKey::Root(root.clone())) {
            return Err(Error::UnknownRoot);
        }
        // 2. Nullifier must be fresh.
        if env.storage().persistent().has(&DataKey::Nullifier(nullifier_hash.clone())) {
            return Err(Error::NullifierUsed);
        }

        // 3. Bind the payout address into the public input `recipient`.
        let recipient = Self::address_field(&env, &to);

        let vk: VkBytes = env
            .storage()
            .instance()
            .get(&DataKey::WithdrawVk)
            .ok_or(Error::NoVerificationKey)?;

        // Public inputs: [root, nullifier_hash, recipient, amount].
        let pub_inputs = vec![
            &env,
            Bn254Fr::from_bytes(root.clone()),
            Bn254Fr::from_bytes(nullifier_hash.clone()),
            Bn254Fr::from_bytes(recipient),
            Bn254Fr::from_bytes(i128_to_fr_bytes(&env, amount)),
        ];
        if !Self::groth16_verify(&env, &vk, &proof, &pub_inputs) {
            return Err(Error::InvalidProof);
        }

        // 4. Spend: mark nullifier and pay out.
        env.storage().persistent().set(&DataKey::Nullifier(nullifier_hash.clone()), &true);
        let usdc: Address = env.storage().instance().get(&DataKey::Usdc).unwrap();
        token::Client::new(&env, &usdc).transfer(
            &env.current_contract_address(),
            &to,
            &amount,
        );

        env.events().publish(
            (symbol_short!("veil"), symbol_short!("withdraw")),
            (nullifier_hash, amount),
        );
        Ok(())
    }

    pub fn current_root(env: Env) -> Option<BytesN<32>> {
        env.storage().instance().get(&DataKey::CurrentRoot)
    }
    pub fn leaf_count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::LeafCount).unwrap_or(0)
    }
    pub fn is_spent(env: Env, nullifier_hash: BytesN<32>) -> bool {
        env.storage().persistent().has(&DataKey::Nullifier(nullifier_hash))
    }

    // ---- internal ----

    fn require_admin(env: &Env) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();
        Ok(())
    }

    /// recipient field = keccak256(ScVal::Address XDR) with the top byte zeroed
    /// so the 248-bit result is always a canonical BN254 field element. The SDK
    /// computes the identical value when generating the withdraw proof, binding
    /// the payout address into the proof.
    fn address_field(env: &Env, to: &Address) -> BytesN<32> {
        let xdr: Bytes = to.clone().to_xdr(env);
        let mut arr = env.crypto().keccak256(&xdr).to_bytes().to_array();
        arr[0] = 0; // ensure < BN254 prime
        BytesN::from_array(env, &arr)
    }

    /// Standard Groth16 check:
    ///   e(-A, B) * e(alpha, beta) * e(vk_x, gamma) * e(C, delta) == 1
    /// where vk_x = ic[0] + Σ pub[i]·ic[i+1].
    fn groth16_verify(
        env: &Env,
        vk: &VkBytes,
        proof: &ProofBytes,
        pub_inputs: &Vec<Bn254Fr>,
    ) -> bool {
        let bn = env.crypto().bn254();

        let ic0 = Bn254G1Affine::from_bytes(vk.ic.get(0).unwrap());
        let mut ic_rest: Vec<Bn254G1Affine> = vec![env];
        for i in 0..pub_inputs.len() {
            ic_rest.push_back(Bn254G1Affine::from_bytes(vk.ic.get(i + 1).unwrap()));
        }
        let msm = bn.g1_msm(ic_rest, pub_inputs.clone());
        let vk_x = bn.g1_add(&ic0, &msm);

        let a = Bn254G1Affine::from_bytes(proof.a.clone());
        let b = Bn254G2Affine::from_bytes(proof.b.clone());
        let c = Bn254G1Affine::from_bytes(proof.c.clone());
        let neg_a = -a;

        let alpha = Bn254G1Affine::from_bytes(vk.alpha.clone());
        let beta = Bn254G2Affine::from_bytes(vk.beta.clone());
        let gamma = Bn254G2Affine::from_bytes(vk.gamma.clone());
        let delta = Bn254G2Affine::from_bytes(vk.delta.clone());

        let g1_points = vec![env, neg_a, alpha, vk_x, c];
        let g2_points = vec![env, b, beta, gamma, delta];
        bn.pairing_check(g1_points, g2_points)
    }
}

/// Encode a non-negative i128 as a 32-byte big-endian field element.
fn i128_to_fr_bytes(env: &Env, v: i128) -> BytesN<32> {
    let mut out = [0u8; 32];
    out[16..32].copy_from_slice(&(v as u128).to_be_bytes());
    BytesN::from_array(env, &out)
}

/// Encode a u32 as a 32-byte big-endian field element.
fn u32_to_fr_bytes(env: &Env, v: u32) -> BytesN<32> {
    let mut out = [0u8; 32];
    out[28..32].copy_from_slice(&v.to_be_bytes());
    BytesN::from_array(env, &out)
}

mod test;
