// Proxy-tool factory — turns a published API row into a live, x402-metered MCP tool.
//
// This is the marketplace value: an owner registers any HTTP API with a price, and
// every MCP agent can discover + call it, paying per call. The x402 gate is applied
// at the tool boundary — a call without a `payment` proof returns a 402 quote; with
// a verified proof (a real on-chain settlement to the API's payment_address) the
// request is proxied to the upstream and the body returned.
//
// `proxyCall` is the raw upstream call, reused by the workflow engine's `http` step:
// inside a workflow the agent has already paid to run the flow, so internal hops call
// upstream directly rather than re-metering each one.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiRow, ApiVar } from "./catalog.ts";
import { quoteFor, verifyPayment } from "../x402.ts";

const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });

// decimal price ("0.01") → 7-decimal integer string the x402 layer settles in.
export function priceUnits(api: ApiRow): string {
  return String(Math.round(Number(api.price || "0") * 1e7));
}

function headerName(h: { name?: string; key?: string }): string {
  return h.name ?? h.key ?? "";
}

// "env:OPENAI_KEY" → process.env.OPENAI_KEY; anything else is literal.
function headerValue(raw: string): string {
  if (raw.startsWith("env:")) return process.env[raw.slice(4)] ?? "";
  return raw;
}

function substitute(tpl: string, args: Record<string, unknown>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => (args[k] != null ? encodeURIComponent(String(args[k])) : ""));
}

// Build + send the upstream request. Path/query variables substitute `{name}`.
export async function proxyCall(api: ApiRow, args: Record<string, unknown>): Promise<{ status: number; body: unknown }> {
  let url = substitute(api.target_url, args);
  if (api.query_params) {
    const qs = substitute(api.query_params, args).replace(/^\?/, "");
    if (qs) url += (url.includes("?") ? "&" : "?") + qs;
  }

  const headers: Record<string, string> = { accept: "application/json" };
  for (const h of api.auth_headers ?? []) {
    const n = headerName(h);
    if (n) headers[n] = headerValue(h.value);
  }

  const method = (api.http_method || "GET").toUpperCase();
  const init: RequestInit = { method, headers };
  if (method !== "GET" && method !== "HEAD") {
    const bodyVars = (api.variables ?? []).filter((v) => v.in === "body").map((v) => v.name);
    const bodyObj = bodyVars.length ? Object.fromEntries(bodyVars.map((k) => [k, args[k]])) : args;
    headers["content-type"] = api.content_type || "application/json";
    init.body = JSON.stringify(bodyObj);
  }

  const r = await fetch(url, init);
  const text = await r.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* keep as text */
  }
  return { status: r.status, body };
}

function inputSchema(api: ApiRow): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const v of (api.variables ?? []) as ApiVar[]) {
    const base = z.string().describe(v.description ?? `${v.in ?? "query"} parameter`);
    shape[v.name] = v.required ? base : base.optional();
  }
  // Always allow an x402 payment proof so the tool can be metered.
  shape.payment = z
    .object({ nonce: z.string(), txHash: z.string().optional(), payer: z.string().optional() })
    .optional()
    .describe("x402 payment proof echoing a quote nonce");
  return shape;
}

// Register the API as an MCP tool named `api__<slug>`.
export function registerApiTool(server: McpServer, api: ApiRow): string {
  const name = `api__${api.slug ?? api.id}`;
  const price = priceUnits(api);
  const payTo = api.payment_address ?? "";

  server.registerTool(
    name,
    {
      title: api.name,
      description: `${api.description ?? api.name}${Number(price) > 0 ? ` · x402 ${api.price} per call` : " · free"}`,
      inputSchema: inputSchema(api),
    },
    async (args: Record<string, unknown>) => {
      const payment = args.payment as { nonce: string; txHash?: string } | undefined;

      if (Number(price) > 0) {
        if (!payTo) return json({ status: "error", reason: "API has a price but no payment_address" });
        if (!payment) {
          const quote = quoteFor(price, payTo);
          return json({ status: "402 payment required", quote, hint: `retry ${name} with { payment: { nonce, txHash } }` });
        }
        const v = await verifyPayment(payment);
        if (!v.ok) return json({ status: "402 payment invalid", reason: v.reason });
      }

      const { payment: _drop, ...callArgs } = args;
      const res = await proxyCall(api, callArgs);
      return json({ status: res.status, body: res.body });
    },
  );
  return name;
}
