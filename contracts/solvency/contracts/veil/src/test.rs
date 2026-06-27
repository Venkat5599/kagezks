#![cfg(test)]
// Compile-time smoke test. Full end-to-end verification with real proof bytes is
// exercised off-chain via the SDK + testnet deploy (BN254 host fns aren't in the
// local test env).

use crate::{Veil, VeilClient};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, BytesN, Env};

#[test]
fn init_and_empty_state() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(Veil, ());
    let client = VeilClient::new(&env, &id);

    let admin = Address::generate(&env);
    let usdc = Address::generate(&env);
    let empty_root = BytesN::from_array(&env, &[7u8; 32]);

    client.init(&admin, &usdc, &empty_root);
    assert_eq!(client.leaf_count(), 0);
    assert_eq!(client.current_root(), Some(empty_root.clone()));
    assert!(!client.is_spent(&BytesN::from_array(&env, &[1u8; 32])));
}
