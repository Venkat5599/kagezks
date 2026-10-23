#![cfg(test)]
// Policy storage tests, then __check_auth itself: each test signs a payload with a
// real ed25519 agent key and asks the host to run the account's auth check against a
// list of calls, exactly as it does when the agent's transaction is submitted.

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

// ---- __check_auth ------------------------------------------------------------------

use crate::Policy;
use ed25519_dalek::{Signer, SigningKey};
use soroban_sdk::auth::{Context, ContractContext};
use soroban_sdk::testutils::Ledger as _;
use soroban_sdk::{symbol_short, vec, IntoVal, Symbol, Val, Vec};

const CAP: i128 = 5_000_000;
const EXPIRY: u64 = 1_000;

struct Rig {
    env: Env,
    client: SessionAccountClient<'static>,
    agent: SigningKey,
    pool: Address,
    token: Address,
}

fn rig() -> Rig {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(500);
    let id = env.register(SessionAccount, ());
    let client = SessionAccountClient::new(&env, &id);
    let agent = SigningKey::from_bytes(&[7u8; 32]);
    let pool = Address::generate(&env);
    let token = Address::generate(&env);
    let agent_pub = BytesN::from_array(&env, &agent.verifying_key().to_bytes());
    client.init(&Address::generate(&env), &agent_pub, &pool, &token, &CAP, &EXPIRY);
    Rig { env, client, agent, pool, token }
}

impl Rig {
    fn deposit(&self) -> Context {
        Context::Contract(ContractContext { contract: self.pool.clone(), fn_name: symbol_short!("deposit"), args: vec![&self.env] })
    }
    fn transfer_to(&self, to: &Address, amount: i128) -> Context {
        let args: Vec<Val> = vec![&self.env, self.client.address.into_val(&self.env), to.into_val(&self.env), amount.into_val(&self.env)];
        Context::Contract(ContractContext { contract: self.token.clone(), fn_name: Symbol::new(&self.env, "transfer"), args })
    }
    fn pay(&self, amount: i128) -> Vec<Context> {
        vec![&self.env, self.deposit(), self.transfer_to(&self.pool.clone(), amount)]
    }
    /// Run the account's auth check for `ctx`, signed by `key` over a fixed payload.
    fn check_with(&self, key: &SigningKey, ctx: Vec<Context>) -> Result<(), Result<Error, soroban_sdk::InvokeError>> {
        let payload = [42u8; 32];
        let sig = BytesN::from_array(&self.env, &key.sign(&payload).to_bytes());
        self.env.try_invoke_contract_check_auth::<Error>(&self.client.address, &BytesN::from_array(&self.env, &payload), sig.into_val(&self.env), &ctx)
    }
    fn check(&self, ctx: Vec<Context>) -> Result<(), Result<Error, soroban_sdk::InvokeError>> {
        self.check_with(&self.agent.clone(), ctx)
    }
    fn spent(&self) -> i128 {
        let p: Policy = self.client.policy();
        p.spent
    }
}

#[test]
fn agent_can_pay_into_the_pool_within_cap() {
    let r = rig();
    assert_eq!(r.check(r.pay(2_000_000)), Ok(()));
    assert_eq!(r.spent(), 2_000_000);
    assert_eq!(r.client.remaining(), 3_000_000);
}

#[test]
fn agent_can_spend_exactly_the_cap() {
    let r = rig();
    assert_eq!(r.check(r.pay(CAP)), Ok(()));
    assert_eq!(r.client.remaining(), 0);
}

#[test]
fn payout_anywhere_but_the_pool_is_bad_payout() {
    let r = rig();
    let thief = Address::generate(&r.env);
    let ctx = vec![&r.env, r.deposit(), r.transfer_to(&thief, 1)];
    assert_eq!(r.check(ctx), Err(Ok(Error::BadPayout)));
    assert_eq!(r.spent(), 0);
}

#[test]
fn one_payment_over_the_cap_is_refused() {
    let r = rig();
    assert_eq!(r.check(r.pay(CAP + 1)), Err(Ok(Error::CapExceeded)));
    assert_eq!(r.spent(), 0);
}

#[test]
fn spending_adds_up_across_payments_until_the_cap() {
    let r = rig();
    assert_eq!(r.check(r.pay(3_000_000)), Ok(()));
    assert_eq!(r.check(r.pay(2_000_001)), Err(Ok(Error::CapExceeded)));
    assert_eq!(r.check(r.pay(2_000_000)), Ok(()));
    assert_eq!(r.spent(), CAP);
}

#[test]
fn several_transfers_in_one_call_count_together() {
    let r = rig();
    let pool = r.pool.clone();
    let ctx = vec![&r.env, r.deposit(), r.transfer_to(&pool, 3_000_000), r.transfer_to(&pool, 3_000_000)];
    assert_eq!(r.check(ctx), Err(Ok(Error::CapExceeded)));
    assert_eq!(r.spent(), 0);
}

#[test]
fn session_works_up_to_and_including_expiry() {
    let r = rig();
    r.env.ledger().set_timestamp(EXPIRY);
    assert_eq!(r.check(r.pay(1)), Ok(()));
}

#[test]
fn session_after_expiry_is_refused() {
    let r = rig();
    r.env.ledger().set_timestamp(EXPIRY + 1);
    assert_eq!(r.check(r.pay(1)), Err(Ok(Error::Expired)));
}

#[test]
fn revoked_session_cannot_pay() {
    let r = rig();
    r.client.revoke();
    assert_eq!(r.check(r.pay(1)), Err(Ok(Error::Expired)));
}

#[test]
fn owner_can_restore_a_revoked_session_with_extend() {
    let r = rig();
    r.client.revoke();
    r.client.extend(&CAP, &EXPIRY);
    assert_eq!(r.check(r.pay(1)), Ok(()));
}

#[test]
fn extend_raises_the_cap_for_the_next_payment() {
    let r = rig();
    assert_eq!(r.check(r.pay(CAP)), Ok(()));
    assert_eq!(r.check(r.pay(1)), Err(Ok(Error::CapExceeded)));
    r.client.extend(&(CAP + 1), &EXPIRY);
    assert_eq!(r.check(r.pay(1)), Ok(()));
}

#[test]
fn calling_any_other_contract_is_refused() {
    let r = rig();
    let other = Context::Contract(ContractContext { contract: Address::generate(&r.env), fn_name: symbol_short!("deposit"), args: vec![&r.env] });
    assert_eq!(r.check(vec![&r.env, other]), Err(Ok(Error::ContextNotAllowed)));
}

#[test]
fn calling_withdraw_on_the_pool_is_refused() {
    let r = rig();
    let w = Context::Contract(ContractContext { contract: r.pool.clone(), fn_name: symbol_short!("withdraw"), args: vec![&r.env] });
    assert_eq!(r.check(vec![&r.env, w]), Err(Ok(Error::ContextNotAllowed)));
}

#[test]
fn token_methods_other_than_transfer_are_refused() {
    let r = rig();
    for m in ["approve", "burn", "transfer_from", "set_admin"] {
        let c = Context::Contract(ContractContext { contract: r.token.clone(), fn_name: Symbol::new(&r.env, m), args: vec![&r.env] });
        assert_eq!(r.check(vec![&r.env, c]), Err(Ok(Error::ContextNotAllowed)), "{m}");
    }
}

#[test]
fn a_transfer_with_missing_arguments_is_refused() {
    let r = rig();
    let args: Vec<Val> = vec![&r.env, r.client.address.into_val(&r.env)];
    let c = Context::Contract(ContractContext { contract: r.token.clone(), fn_name: Symbol::new(&r.env, "transfer"), args });
    assert_eq!(r.check(vec![&r.env, c]), Err(Ok(Error::ContextNotAllowed)));
}

#[test]
fn one_bad_call_rejects_the_whole_batch() {
    let r = rig();
    let thief = Address::generate(&r.env);
    let pool = r.pool.clone();
    let ctx = vec![&r.env, r.deposit(), r.transfer_to(&pool, 1_000), r.transfer_to(&thief, 1)];
    assert_eq!(r.check(ctx), Err(Ok(Error::BadPayout)));
    assert_eq!(r.spent(), 0);
}

#[test]
fn a_different_key_cannot_sign_for_the_agent() {
    let r = rig();
    let stranger = SigningKey::from_bytes(&[8u8; 32]);
    assert!(r.check_with(&stranger, r.pay(1)).is_err());
    assert_eq!(r.spent(), 0);
}

#[test]
fn a_signature_over_another_payload_is_refused() {
    let r = rig();
    let sig = BytesN::from_array(&r.env, &r.agent.sign(&[1u8; 32]).to_bytes());
    let res = r.env.try_invoke_contract_check_auth::<Error>(&r.client.address, &BytesN::from_array(&r.env, &[42u8; 32]), sig.into_val(&r.env), &r.pay(1));
    assert!(res.is_err());
}

#[test]
fn an_account_without_a_policy_refuses_everything() {
    let env = Env::default();
    let id = env.register(SessionAccount, ());
    let key = SigningKey::from_bytes(&[7u8; 32]);
    let sig = BytesN::from_array(&env, &key.sign(&[42u8; 32]).to_bytes());
    let res = env.try_invoke_contract_check_auth::<Error>(&id, &BytesN::from_array(&env, &[42u8; 32]), sig.into_val(&env), &vec![&env]);
    assert_eq!(res, Err(Ok(Error::NotInitialized)));
}
