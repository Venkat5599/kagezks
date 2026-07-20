#![cfg(test)]
// Compile-time smoke test. Full __check_auth behaviour is exercised on testnet
// with a real agent session key (ed25519 host fns + auth tree aren't in the
// local test env).

use crate::{Error, SessionAccount, SessionAccountClient};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, BytesN, Env};

fn setup(env: &Env) -> SessionAccountClient<'static> {
    env.mock_all_auths();
    let id = env.register(SessionAccount, ());
    let client = SessionAccountClient::new(env, &id);
    let owner = Address::generate(env);
    let pool = Address::generate(env);
    let token = Address::generate(env);
    let agent = BytesN::from_array(env, &[9u8; 32]);
    client.init(&owner, &agent, &pool, &token, &5_000_000i128, &9_999_999_999u64);
    client
}

#[test]
fn init_and_policy() {
    let env = Env::default();
    let client = setup(&env);
    let p = client.policy();
    assert_eq!(p.cap, 5_000_000i128);
    assert_eq!(p.spent, 0i128);
    assert_eq!(client.remaining(), 5_000_000i128);
}

#[test]
fn init_is_idempotent() {
    let env = Env::default();
    let client = setup(&env);
    let owner = Address::generate(&env);
    let pool = Address::generate(&env);
    let token = Address::generate(&env);
    let agent = BytesN::from_array(&env, &[1u8; 32]);
    let res = client.try_init(&owner, &agent, &pool, &token, &1i128, &1u64);
    assert_eq!(res, Err(Ok(Error::AlreadyInitialized)));
}

// Revoking the session zeros the expiry, so __check_auth's liveness guard fails
// for any future timestamp.
#[test]
fn revoke_zeros_expiry() {
    let env = Env::default();
    let client = setup(&env);
    client.revoke();
    assert_eq!(client.policy().expiry, 0u64);
}

// Owner can top up the budget (cap + expiry) for an ongoing session.
#[test]
fn extend_updates_cap_and_expiry() {
    let env = Env::default();
    let client = setup(&env);
    client.extend(&9_000_000i128, &12_345u64);
    let p = client.policy();
    assert_eq!(p.cap, 9_000_000i128);
    assert_eq!(p.expiry, 12_345u64);
    assert_eq!(client.remaining(), 9_000_000i128); // spent still 0
}

// ── Invariants ───────────────────────────────────────────────────

#[test]
fn invariant_remaining_equals_cap_minus_spent() {
    let env = Env::default();
    let client = setup(&env);
    let p = client.policy();
    assert_eq!(client.remaining(), p.cap - p.spent);
    client.extend(&10_000_000i128, &99_999u64);
    assert_eq!(client.remaining(), 10_000_000i128);
}

#[test]
fn invariant_initial_spent_is_zero() {
    let env = Env::default();
    let client = setup(&env);
    assert_eq!(client.policy().spent, 0i128);
}

#[test]
fn invariant_cap_is_positive() {
    let env = Env::default();
    let client = setup(&env);
    assert!(client.policy().cap > 0i128);
}

#[test]
fn invariant_revoked_expiry_is_zero() {
    let env = Env::default();
    let client = setup(&env);
    client.revoke();
    assert_eq!(client.policy().expiry, 0u64);
}

#[test]
fn invariant_extend_preserves_spent() {
    let env = Env::default();
    let client = setup(&env);
    let before = client.policy().spent;
    client.extend(&8_000_000i128, &50_000u64);
    let after = client.policy().spent;
    assert_eq!(after, before, "spent should not be reset by extend");
}

#[test]
fn invariant_owner_is_set() {
    let env = Env::default();
    let client = setup(&env);
    let p = client.policy();
    assert!(p.owner.to_string().len() > 0);
}
