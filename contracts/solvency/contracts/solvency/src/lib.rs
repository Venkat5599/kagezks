#![no_std]
//! Ledgerproof solvency contract.
//!
//! Verifies a Groth16 proof (BN254) that an issuer's hidden customer
//! liabilities are fully backed, AND binds the proof's `total_reserves`
//! public input to the REAL reserve balance the contract reads itself
//! on-chain. On success it records a public `SOLVENT` attestation that
//! exposes no individual balance.
//!
//! Public input layout (must match circuits/solvency.circom):
//!   [0] liabilities_root   (BN254 field element, 32 bytes big-endian)
//!   [1] total_reserves     (bound on-chain to summed reserve balances)
//!
//! Points are passed in as raw bytes (G1=64, G2=128, Fr=32, big-endian) and
//! reconstructed here; the off-chain SDK converts snarkjs JSON to this layout.

use soroban_sdk::crypto::bn254::{Bn254Fr, Bn254G1Affine, Bn254G2Affine};
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, vec, Address,
    BytesN, Env, Vec,
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

/// Public, balance-free record of a solvency check.
#[contracttype]
#[derive(Clone)]
pub struct Attestation {
    pub liabilities_root: BytesN<32>,
    pub reserves: i128,
    pub ledger_seq: u32,
    pub solvent: bool,
    pub ts: u64,
}

#[contracttype]
pub enum DataKey {
    Admin,
    Vk,
    ReserveToken,
    ReserveAccounts,
    Latest,
}

#[contract]
pub struct Solvency;

#[contractimpl]
impl Solvency {
    /// One-time setup. `reserve_token` is the SAC asset whose balances count
    /// as reserves; `reserve_accounts` are the accounts holding them.
    pub fn init(
        env: Env,
        admin: Address,
        reserve_token: Address,
        reserve_accounts: Vec<Address>,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::ReserveToken, &reserve_token);
        env.storage().instance().set(&DataKey::ReserveAccounts, &reserve_accounts);
        Ok(())
    }

    /// Install / replace the Groth16 verification key (admin only).
    pub fn set_vk(env: Env, vk: VkBytes) -> Result<(), Error> {
        Self::require_admin(&env)?;
        env.storage().instance().set(&DataKey::Vk, &vk);
        Ok(())
    }

    /// Sum the real reserve balances on-chain. The issuer cannot lie about
    /// this — the contract reads it directly from the SAC.
    pub fn reserves(env: Env) -> i128 {
        let token_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::ReserveToken)
            .unwrap();
        let accounts: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::ReserveAccounts)
            .unwrap();
        let client = token::Client::new(&env, &token_addr);
        let mut total: i128 = 0;
        for acct in accounts.iter() {
            total += client.balance(&acct);
        }
        total
    }

    /// Verify a solvency proof against the LIVE on-chain reserves and, on
    /// success, publish a SOLVENT attestation. Reverts if the proof is invalid
    /// or does not match real reserves.
    pub fn attest(
        env: Env,
        proof: ProofBytes,
        liabilities_root: BytesN<32>,
        ledger_seq: u32,
    ) -> Result<Attestation, Error> {
        Self::require_admin(&env)?;

        let vk: VkBytes = env
            .storage()
            .instance()
            .get(&DataKey::Vk)
            .ok_or(Error::NoVerificationKey)?;

        // 1. Read REAL reserves on-chain.
        let reserves = Self::reserves(env.clone());

        // 2. Build public inputs: [liabilities_root, total_reserves].
        let reserves_fr = Bn254Fr::from_bytes(i128_to_be_bytes32(&env, reserves));
        let root_fr = Bn254Fr::from_bytes(liabilities_root.clone());
        let pub_inputs = vec![&env, root_fr, reserves_fr];

        // 3. Groth16 verify (BN254).
        if !Self::groth16_verify(&env, &vk, &proof, &pub_inputs) {
            return Err(Error::InvalidProof);
        }

        // 4. Record the attestation.
        let att = Attestation {
            liabilities_root,
            reserves,
            ledger_seq,
            solvent: true,
            ts: env.ledger().timestamp(),
        };
        env.storage().instance().set(&DataKey::Latest, &att);
        env.events().publish(
            (symbol_short!("solvency"), symbol_short!("SOLVENT")),
            att.clone(),
        );
        Ok(att)
    }

    /// Latest attestation, if any.
    pub fn status(env: Env) -> Option<Attestation> {
        env.storage().instance().get(&DataKey::Latest)
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

        // vk_x = ic[0] + msm(ic[1..], pub_inputs)
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
fn i128_to_be_bytes32(env: &Env, v: i128) -> BytesN<32> {
    let mut out = [0u8; 32];
    let be = (v as u128).to_be_bytes(); // 16 bytes
    out[16..32].copy_from_slice(&be);
    BytesN::from_array(env, &out)
}

mod test;
