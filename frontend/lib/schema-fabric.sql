-- Kage fabric tables (Neon Postgres): published APIs, workflows, MCP servers, request logs.
-- Run once against DATABASE_URL:  psql "$DATABASE_URL" -f frontend/lib/schema-fabric.sql
-- Column set mirrors the row types in frontend/lib/db.ts and the INSERTs in app/api/*.

CREATE TABLE IF NOT EXISTS apis (
  id               BIGSERIAL PRIMARY KEY,
  name             TEXT        NOT NULL,
  slug             TEXT        UNIQUE,
  description      TEXT,
  category         TEXT,
  tags             JSONB       NOT NULL DEFAULT '[]'::jsonb,
  payment_address  TEXT,
  target_url       TEXT        NOT NULL,
  http_method      TEXT        NOT NULL DEFAULT 'GET',
  content_type     TEXT        NOT NULL DEFAULT 'application/json',
  query_params     TEXT,
  variables        JSONB       NOT NULL DEFAULT '[]'::jsonb,
  example_response TEXT,
  price            NUMERIC     NOT NULL DEFAULT 0.01,
  auth_headers     JSONB       NOT NULL DEFAULT '[]'::jsonb,
  is_public        BOOLEAN     NOT NULL DEFAULT false,
  owner_address    TEXT,
  request_count    INTEGER     NOT NULL DEFAULT 0,
  success_count    INTEGER     NOT NULL DEFAULT 0,
  earnings         NUMERIC     NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS apis_owner_idx ON apis (owner_address);

CREATE TABLE IF NOT EXISTS workflows (
  id                BIGSERIAL PRIMARY KEY,
  name              TEXT        NOT NULL,
  slug              TEXT        UNIQUE,
  description       TEXT,
  is_public         BOOLEAN     NOT NULL DEFAULT false,
  input_variables   JSONB       NOT NULL DEFAULT '[]'::jsonb,
  steps             JSONB       NOT NULL DEFAULT '[]'::jsonb,
  output_mapping    JSONB       NOT NULL DEFAULT '[]'::jsonb,
  allowed_contracts JSONB       NOT NULL DEFAULT '[]'::jsonb,
  tags              JSONB       NOT NULL DEFAULT '[]'::jsonb,
  owner_address     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workflows_owner_idx ON workflows (owner_address);

CREATE TABLE IF NOT EXISTS mcp_servers (
  id            BIGSERIAL PRIMARY KEY,
  slug          TEXT        UNIQUE,
  display_name  TEXT        NOT NULL,
  description   TEXT,
  is_public     BOOLEAN     NOT NULL DEFAULT false,
  tools         JSONB       NOT NULL DEFAULT '[]'::jsonb,
  workflows     JSONB       NOT NULL DEFAULT '[]'::jsonb,
  owner_address TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mcp_servers_owner_idx ON mcp_servers (owner_address);

CREATE TABLE IF NOT EXISTS request_logs (
  id         BIGSERIAL PRIMARY KEY,
  api_slug   TEXT,
  api_name   TEXT,
  kind       TEXT        NOT NULL DEFAULT 'api',
  status     INTEGER,
  ok         BOOLEAN     NOT NULL DEFAULT false,
  paid       BOOLEAN     NOT NULL DEFAULT false,
  price      NUMERIC     NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS request_logs_created_idx ON request_logs (created_at DESC);
