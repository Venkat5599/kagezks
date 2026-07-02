// Neon Postgres access for the Veil Agent-Fabric app (APIs / MCP servers / workflows).
// One serverless client, reused across API routes. DATABASE_URL lives in .env.local.
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  // Surfaced at request time in the route, not at import, so the build doesn't fail.
  console.warn("DATABASE_URL is not set — the Agent-Fabric app can't reach Neon.");
}

export const sql = neon(process.env.DATABASE_URL ?? "");

// ---- row shapes -------------------------------------------------------------
export type ApiRow = {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  category: string | null;
  tags: string[];
  payment_address: string | null;
  target_url: string;
  http_method: string;
  content_type: string;
  query_params: string | null;
  variables: unknown[];
  example_response: string | null;
  price: string;
  auth_headers: unknown[];
  is_public: boolean;
  request_count: number;
  success_count: number;
  earnings: string;
  created_at: string;
};

export type McpServerRow = {
  id: string;
  slug: string | null;
  display_name: string;
  description: string | null;
  is_public: boolean;
  tools: unknown[];
  workflows: unknown[];
  owner_address: string | null;
  created_at: string;
};

export type WorkflowRow = {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  is_public: boolean;
  input_variables: unknown[];
  steps: unknown[];
  output_mapping: unknown[];
  allowed_contracts: unknown[];
  tags: string[];
  created_at: string;
};
