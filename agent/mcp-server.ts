// Veil MCP server — the tools an LLM agent calls to pay privately on Stellar.
//
//   bun run agent/mcp-server.ts        # http://localhost:8402/mcp (Streamable HTTP)
//
// Exposes Veil as Model Context Protocol tools so any MCP-capable agent (the demo
// agent in agent/demo-agent.ts drives Claude) can discover and use them:
//
//   veil_pool_status  — live pool root, leaf count, USDC pooled           (read)
//   veil_budget       — remaining scoped cap on the agent's SessionAccount (read)
//   veil_quote        — x402 price for a veil_pay call + pool readiness    (read)
//   veil_pay          — ZK-private payment through the SessionAccount      (x402-metered)
//   workflow_list     — available workflows                               (read)
//   workflow_run      — run a workflow (flagship: pay-if-budget)           (x402 inside)
//
// The server enforces NOTHING about spend itself — the chain
// (SessionAccount.__check_auth) is the trust anchor. MCP + x402 + workflows are
// discovery / economic / composition layers on top. x402 is applied at the tool
// boundary: veil_pay without a `payment` returns a 402-style quote; with a valid
// payment proof it proceeds (see agent/x402.ts; settlement verify is a documented stub).
import express from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { poolStatus, remainingBudget, config } from "../sdk/veil-onchain.ts";
import { runWorkflow, listWorkflows } from "./workflow.ts";
import { quoteFor, verifyPayment } from "./x402.ts";

const PORT = Number(process.env.VEIL_MCP_PORT ?? 8402);
// The G-account that pays the tx fee and submits (owner/relayer). Never the agent key.
const FEE_SECRET = process.env.VEIL_FEE_SECRET ?? "";
// Where x402 per-call fees are paid (operator). Falls back to a placeholder for the demo.
const OPERATOR = process.env.VEIL_OPERATOR ?? "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF5";
const CALL_PRICE = process.env.VEIL_CALL_PRICE ?? "100000"; // 0.01 USDC per veil_pay

const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });

function buildServer(): McpServer {
  const server = new McpServer({ name: "veil", version: "0.1.0" });

  server.registerTool(
    "veil_pool_status",
    {
      title: "Veil pool status",
      description: "Live shielded-pool state: contract id, current Merkle root, leaf count, USDC pooled.",
      inputSchema: {},
    },
    async () => json(await poolStatus()),
  );

  server.registerTool(
    "veil_budget",
    {
      title: "Agent budget",
      description: "Remaining scoped spend cap on the agent's SessionAccount (cap - spent).",
      inputSchema: { sessionId: z.string().optional() },
    },
    async ({ sessionId }) => {
      const remaining = await remainingBudget(sessionId);
      return json({ remaining: remaining.toString(), unit: "USDC (7 decimals)" });
    },
  );

  server.registerTool(
    "veil_quote",
    {
      title: "Quote a private payment",
      description: "Returns the x402 price to call veil_pay plus whether the pool + budget can cover `amount`.",
      inputSchema: { amount: z.string().describe("USDC amount, 7 decimals, as a string") },
    },
    async ({ amount }) => {
      const [status, remaining] = await Promise.all([poolStatus(), remainingBudget().catch(() => 0n)]);
      const quote = quoteFor(CALL_PRICE, OPERATOR);
      return json({
        callPrice: { amount: CALL_PRICE, payTo: OPERATOR, scheme: quote.scheme, nonce: quote.nonce, expiresAt: quote.expiresAt },
        payAmount: amount,
        poolReady: status.leafCount >= 0,
        budgetCovers: BigInt(remaining) >= BigInt(amount || "0"),
        note: "call veil_pay with { payment: { nonce, txHash } } echoing this nonce",
      });
    },
  );

  server.registerTool(
    "veil_pay",
    {
      title: "Pay privately through the agent's scoped key",
      description:
        "Make a ZK-private USDC payment to a payee's scan key, deposited through the SessionAccount (scoped, can't drain). x402-metered: call without `payment` to get a quote, then retry with the payment proof.",
      inputSchema: {
        recipientScanKey: z.string().describe("hex x25519 scan pubkey of the payee"),
        amount: z.string().describe("USDC amount, 7 decimals"),
        payment: z
          .object({ nonce: z.string(), txHash: z.string().optional(), payer: z.string().optional() })
          .optional()
          .describe("x402 payment proof echoing a veil_quote nonce"),
      },
    },
    async ({ recipientScanKey, amount, payment }) => {
      // x402 gate at the tool boundary.
      if (!payment) {
        const quote = quoteFor(CALL_PRICE, OPERATOR);
        return json({ status: "402 payment required", quote, hint: "retry veil_pay with { payment: { nonce, txHash } }" });
      }
      const v = await verifyPayment(payment);
      if (!v.ok) return json({ status: "402 payment invalid", reason: v.reason });

      if (!FEE_SECRET) return json({ status: "error", reason: "VEIL_FEE_SECRET not set (fee/submit source)" });
      const run = await runWorkflow("pay-if-budget", { recipientScanKey, amount, feeSourceSecret: FEE_SECRET });
      return json(run);
    },
  );

  server.registerTool(
    "workflow_list",
    { title: "List workflows", description: "Reusable agent workflows Veil ships.", inputSchema: {} },
    async () => json(listWorkflows()),
  );

  server.registerTool(
    "workflow_run",
    {
      title: "Run a workflow",
      description: "Run a named workflow. Flagship: pay-if-budget (budget-gate -> ZK deposit -> confirm).",
      inputSchema: {
        name: z.string(),
        recipientScanKey: z.string(),
        amount: z.string(),
      },
    },
    async ({ name, recipientScanKey, amount }) => {
      if (!FEE_SECRET) return json({ status: "error", reason: "VEIL_FEE_SECRET not set" });
      return json(await runWorkflow(name, { recipientScanKey, amount, feeSourceSecret: FEE_SECRET }));
    },
  );

  return server;
}

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  let cfg: ReturnType<typeof config> | null = null;
  try {
    cfg = config();
  } catch {}
  res.json({ ok: true, contract: cfg?.VEIL ?? null, session: cfg?.session ?? null });
});

// Stateless Streamable HTTP: a fresh server + transport per request.
app.post("/mcp", async (req, res) => {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
  res.on("close", () => {
    transport.close();
    server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(PORT, () => {
  console.log(`Veil MCP server on http://localhost:${PORT}/mcp  (health: /health)`);
  try {
    const c = config();
    console.log(`  pool ${c.VEIL}  session ${c.session ?? "(none — run bun run agent:fabric)"}`);
  } catch {
    console.log("  no deployment yet — run scripts/veil-deploy.ts + agent:fabric");
  }
});
