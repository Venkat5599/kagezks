#![cfg(test)]
// Full end-to-end verification (real proof bytes) is exercised off-chain via
// the SDK + testnet deploy. This keeps a compile-time smoke test in place.

use crate::{Solvency, SolvencyClient};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{vec, Address, Env};

#[test]
fn init_and_status_empty() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(Solvency, ());
    let client = SolvencyClient::new(&env, &id);

    let admin = Address::generate(&env);
    let token = Address::generate(&env);
    let accounts = vec![&env, Address::generate(&env)];

    client.init(&admin, &token, &accounts);
    assert!(client.status().is_none());
}
