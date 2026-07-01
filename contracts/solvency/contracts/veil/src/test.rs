#![cfg(test)]
// Compile-time smoke test. Full end-to-end verification with real proof bytes is
// exercised off-chain via the SDK + testnet deploy (BN254 host fns aren't in the
// local test env).

use crate::{Error, ProofBytes, Veil, VeilClient};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, BytesN, Env};

fn setup(env: &Env) -> (VeilClient<'static>, Address, Address, BytesN<32>) {
    env.mock_all_auths();
    let id = env.register(Veil, ());
    let client = VeilClient::new(env, &id);
    let admin = Address::generate(env);
    let usdc = Address::generate(env);
    let empty_root = BytesN::from_array(env, &[7u8; 32]);
    client.init(&admin, &usdc, &empty_root);
    (client, admin, usdc, empty_root)
}

fn dummy_proof(env: &Env) -> ProofBytes {
    ProofBytes {
        a: BytesN::from_array(env, &[0u8; 64]),
        b: BytesN::from_array(env, &[0u8; 128]),
        c: BytesN::from_array(env, &[0u8; 64]),
    }
}

#[test]
fn init_and_empty_state() {
    let env = Env::default();
    let (client, _admin, _usdc, empty_root) = setup(&env);
    assert_eq!(client.leaf_count(), 0);
    assert_eq!(client.current_root(), Some(empty_root.clone()));
    assert!(!client.is_spent(&BytesN::from_array(&env, &[1u8; 32])));
}

#[test]
fn init_is_idempotent() {
    let env = Env::default();
    let (client, admin, usdc, empty_root) = setup(&env);
    let res = client.try_init(&admin, &usdc, &empty_root);
    assert_eq!(res, Err(Ok(Error::AlreadyInitialized)));
}

// A deposit at the wrong next leaf index is rejected BEFORE any proof work.
#[test]
fn deposit_rejects_bad_leaf_index() {
    let env = Env::default();
    let (client, _admin, _usdc, _root) = setup(&env);
    let from = Address::generate(&env);
    let res = client.try_deposit(
        &from,
        &BytesN::from_array(&env, &[1u8; 32]), // commitment
        &BytesN::from_array(&env, &[2u8; 32]), // ephemeral_pubkey
        &1_000i128,                            // amount
        &BytesN::from_array(&env, &[3u8; 32]), // new_root
        &5u32,                                 // leaf_index (should be 0)
        &dummy_proof(&env),
    );
    assert_eq!(res, Err(Ok(Error::BadLeafIndex)));
}

// With a correct leaf index but no verification key installed, deposit stops at
// the missing-VK guard (still before the pairing check).
#[test]
fn deposit_without_vk_fails() {
    let env = Env::default();
    let (client, _admin, _usdc, _root) = setup(&env);
    let from = Address::generate(&env);
    let res = client.try_deposit(
        &from,
        &BytesN::from_array(&env, &[1u8; 32]),
        &BytesN::from_array(&env, &[2u8; 32]),
        &1_000i128,
        &BytesN::from_array(&env, &[3u8; 32]),
        &0u32,
        &dummy_proof(&env),
    );
    assert_eq!(res, Err(Ok(Error::NoVerificationKey)));
}

// A withdrawal against a root the pool never produced is rejected up front.
#[test]
fn withdraw_rejects_unknown_root() {
    let env = Env::default();
    let (client, _admin, _usdc, _root) = setup(&env);
    let to = Address::generate(&env);
    let res = client.try_withdraw(
        &dummy_proof(&env),
        &BytesN::from_array(&env, &[42u8; 32]), // unknown root
        &BytesN::from_array(&env, &[9u8; 32]),  // nullifier_hash
        &to,
        &1_000i128,
    );
    assert_eq!(res, Err(Ok(Error::UnknownRoot)));
}
