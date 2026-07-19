-- Kage user onboarding + feedback tables (Neon Postgres).
-- Run once against DATABASE_URL:  psql "$DATABASE_URL" -f frontend/lib/schema-users.sql
--
-- These back the onboarding proof: every wallet that connects to kageai.me is
-- recorded here, and every rating submitted in-app lands in `feedback`.
-- /api/metrics aggregates both, so the public /metrics page shows a live count
-- of real wallets rather than a number typed into a README.

CREATE TABLE IF NOT EXISTS users (
  address       TEXT PRIMARY KEY,          -- Stellar public key (G...)
  wallet_kind   TEXT NOT NULL,             -- 'freighter' | 'generated'
  first_seen    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen     TIMESTAMPTZ NOT NULL DEFAULT now(),
  visits        INTEGER     NOT NULL DEFAULT 1,
  tx_count      INTEGER     NOT NULL DEFAULT 0,  -- on-chain actions taken in-app
  referrer      TEXT                             -- where the user came from
);

CREATE INDEX IF NOT EXISTS users_first_seen_idx ON users (first_seen DESC);

-- One row per on-chain action a user takes through the app. This is the
-- "proof of wallet interactions" the belt asks for: each row carries a real
-- testnet transaction hash that resolves on stellar.expert.
CREATE TABLE IF NOT EXISTS user_txs (
  id         BIGSERIAL PRIMARY KEY,
  address    TEXT NOT NULL REFERENCES users (address) ON DELETE CASCADE,
  action     TEXT NOT NULL,              -- 'deposit' | 'withdraw' | 'provision' | 'agent_run'
  tx_hash    TEXT,                       -- testnet hash, verifiable on stellar.expert
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_txs_address_idx ON user_txs (address);
CREATE INDEX IF NOT EXISTS user_txs_created_idx ON user_txs (created_at DESC);

-- In-app feedback. Mirrors the Google Form fields so the two data sets merge
-- cleanly into one spreadsheet for the submission.
CREATE TABLE IF NOT EXISTS feedback (
  id           BIGSERIAL PRIMARY KEY,
  address      TEXT,                       -- nullable: feedback without connecting
  rating       SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  most_useful  TEXT,                       -- which part they'd actually use
  friction     TEXT,                       -- what confused or blocked them
  wanted       TEXT,                       -- the feature they asked for
  email        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feedback_created_idx ON feedback (created_at DESC);
