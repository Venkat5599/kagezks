#![no_std]
//! Veil Agent Fabric — scoped session account.
//!
//! The Stellar/Soroban answer to agent_fabric's "autonomy without custody". An
//! owner funds this custom-account contract and delegates a single **agent
//! session key** to it under a strict policy. The agent can act on-chain WITHOUT
//! ever holding the owner's key, and can only do exactly what the policy allows:
//!
//!   - call `Veil.deposit` on the configured pool (a ZK-private payment), and
//!   - move USDC into that pool via the token's `transfer`,
//!   - up to a total `cap`, and
//!   - before `expiry`.
//!
//! Anything else — a different contract, a different method, an over-cap amount,
//! a payout to somewhere other than the pool, or a request after expiry — fails
//! in `__check_auth`. Settlement is private because the only allowed action
//! routes through Veil's shielded pool.

use soroban_sdk::auth::{Context, ContractContext, CustomAccountInterface};
use soroban_sdk::crypto::Hash;
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Bytes, BytesN, Env,
    IntoVal, Symbol, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    BadSignature = 3,
    Expired = 4,
    ContextNotAllowed = 5, // wrong contract or method
    CapExceeded = 6,       // amount would exceed the remaining spend cap
    BadPayout = 7,         // token transfer not destined for the pool
}

#[contracttype]
#[derive(Clone)]
pub struct Policy {
    pub owner: Address,        // funds the account, sets/revokes the policy
    pub agent: BytesN<32>,     // the delegated ed25519 session public key
    pub pool: Address,         // the Veil pool contract (only allowed target)
    pub token: Address,        // the USDC SAC (only allowed value movement)
    pub cap: i128,             // total spend ceiling for this session
    pub spent: i128,           // value moved so far
    pub expiry: u64,           // session invalid after this ledger timestamp
}

#[contracttype]
pub enum DataKey {
    Policy,
}

#[contract]
pub struct SessionAccount;

#[contractimpl]
impl SessionAccount {
    /// Owner delegates a scoped session to `agent`. One-time.
    pub fn init(
        env: Env,
        owner: Address,
        agent: BytesN<32>,
        pool: Address,
        token: Address,
        cap: i128,
        expiry: u64,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Policy) {
            return Err(Error::AlreadyInitialized);
        }
        owner.require_auth();
        env.storage().instance().set(
            &DataKey::Policy,
            &Policy { owner, agent, pool, token, cap, spent: 0, expiry },
        );
        Ok(())
    }

    /// Owner kills the session immediately (sets expiry to 0).
    pub fn revoke(env: Env) -> Result<(), Error> {
        let mut p = Self::policy(env.clone())?;
        p.owner.require_auth();
        p.expiry = 0;
        env.storage().instance().set(&DataKey::Policy, &p);
        Ok(())
    }

    /// Owner refreshes the cap / expiry (top-up the session budget).
    pub fn extend(env: Env, cap: i128, expiry: u64) -> Result<(), Error> {
        let mut p = Self::policy(env.clone())?;
        p.owner.require_auth();
        p.cap = cap;
        p.expiry = expiry;
        env.storage().instance().set(&DataKey::Policy, &p);
        Ok(())
    }

    pub fn policy(env: Env) -> Result<Policy, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Policy)
            .ok_or(Error::NotInitialized)
    }

    pub fn remaining(env: Env) -> i128 {
        match Self::policy(env) {
            Ok(p) => p.cap - p.spent,
            Err(_) => 0,
        }
    }
}

#[contractimpl]
impl CustomAccountInterface for SessionAccount {
    type Signature = BytesN<64>;
    type Error = Error;

    /// Authorize a tree of sub-invocations iff the agent signed AND every call
    /// fits the policy. This is where "autonomy without custody" is enforced.
    fn __check_auth(
        env: Env,
        signature_payload: Hash<32>,
        signature: BytesN<64>,
        auth_contexts: Vec<Context>,
    ) -> Result<(), Error> {
        let mut p = Self::policy(env.clone())?;

        // 1. The agent session key must have signed this exact payload.
        let msg = Bytes::from_array(&env, &signature_payload.to_array());
        // ed25519_verify halts the transaction on mismatch (see Error::BadSignature).
        env.crypto().ed25519_verify(&p.agent, &msg, &signature);

        // 2. Session must be live.
        if env.ledger().timestamp() > p.expiry {
            return Err(Error::Expired);
        }

        let deposit = symbol_short!("deposit");
        let transfer = Symbol::new(&env, "transfer");

        // 3. Every authorized context must match the policy.
        for ctx in auth_contexts.iter() {
            let Context::Contract(ContractContext { contract, fn_name, args }) = ctx else {
                return Err(Error::ContextNotAllowed);
            };

            if contract == p.pool && fn_name == deposit {
                // ZK-private payment into the pool — allowed. The value cap is
                // enforced on the token transfer context below.
                continue;
            }

            if contract == p.token && fn_name == transfer {
                // transfer(from, to, amount): only into the pool, within cap.
                let to: Address = args.get(1).ok_or(Error::ContextNotAllowed)?.into_val(&env);
                let amount: i128 = args.get(2).ok_or(Error::ContextNotAllowed)?.into_val(&env);
                if to != p.pool {
                    return Err(Error::BadPayout);
                }
                p.spent += amount;
                if p.spent > p.cap {
                    return Err(Error::CapExceeded);
                }
                continue;
            }

            return Err(Error::ContextNotAllowed);
        }

        // 4. Persist the updated spend.
        env.storage().instance().set(&DataKey::Policy, &p);
        Ok(())
    }
}

mod test;
