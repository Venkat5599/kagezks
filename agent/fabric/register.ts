// Assemble the MCP tool surface from the live catalog + built-ins.
//
//   built-ins            kage_pool_status, kage_budget, fabric_reload
//   per published API     api__<slug>      (x402-metered proxy tool)
//   per published flow    wf__<slug>       (runs the workflow engine → ZK settle)
//
// Called at server build and re-callable to hot-reload after an owner publishes a
// new API/workflow (fabric_reload rebuilds the process's tool list from the catalog).
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadCatalog, type WorkflowRow } from "./catalog.ts";
import { registerApiTool } from "./proxy-tool.ts";
import { runWorkflow } from "./engine.ts";
import { poolStatus, runStep } from "./steps.ts";
import { remainingBudget } from "../../sdk/kage-onchain.ts";
import { currentScope } from "./auth.ts";

const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });

function registerBuiltins(server: McpServer) {
  server.registerTool(
    "kage_pool_status",
    { title: "Kage pool status", description: "Live shielded-pool state: contract, root, leaf count, USDC pooled.", inputSchema: {} },
    async () => json(await poolStatus()),
  );

  server.registerTool(
    "kage_budget",
    {
      title: "Agent budget",
      description: "Remaining scoped spend cap on the calling agent's SessionAccount (cap - spent).",
      inputSchema: { sessionId: z.string().optional() },
    },
    async ({ sessionId }) => {
      const sid = sessionId ?? currentScope().sessionId;
      const remaining = await remainingBudget(sid);
      return json({ remaining: remaining.toString(), unit: "stroops of XLM (1 XLM = 10,000,000)", remainingXlm: Number(remaining) / 1e7, session: sid ?? "(default)" });
    },
  );

  // Pay privately into the Kage pool from the caller's agent account. The token picks
  // the account; the chain enforces its limit, expiry and pool-only payouts.
  server.registerTool(
    "kage_pay",
    {
      title: "Pay privately through Kage",
      description:
        "Send XLM privately into the Kage pool from your agent account (needs your agent account token). The payment can't exceed the account's spending limit or happen after its expiry; the chain enforces both.",
      inputSchema: {
        amount: z.union([z.string(), z.number()]).transform(String).describe("How much XLM to pay, e.g. 0.5"),
        recipientScanKey: z.string().optional().describe("The payee's 64-character scan key. Leave out to pay the demo payee."),
      },
    },
    async ({ amount, recipientScanKey }) => {
      const scope = currentScope();
      if (!scope.sessionId) {
        return { ...json({ error: "No agent account: connect with your agent account token (Authorization: Bearer <token>, or ?token=<token> on the server URL). Create one at https://kageai.me/dashboard." }), isError: true };
      }
      const a = String(amount).trim();
      if (!/^\d+(\.\d{1,7})?$/.test(a) || !(Number(a) > 0)) {
        return { ...json({ error: "amount must be XLM above 0 with at most 7 decimals, like 0.5" }), isError: true };
      }
      const [whole, frac = ""] = a.split(".");
      const stroops = (BigInt(whole!) * 10_000_000n + BigInt(frac.padEnd(7, "0"))).toString();
      const r = await runStep(
        { id: "pay", kind: "onchain", action: "kage_pay", recipientScanKey: recipientScanKey ?? "", amount: stroops },
        { allowed_contracts: [] } as unknown as WorkflowRow,
      );
      const ok = r.status === "ok";
      return { ...json({ paid: ok, amountXlm: Number(a), agentAccount: scope.sessionId, result: r }), ...(ok ? {} : { isError: true }) };
    },
  );
}

// input schema for a workflow tool, from its declared input_variables.
function wfSchema(wf: WorkflowRow): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const v of wf.input_variables ?? []) {
    const base = z.string().describe(v.description ?? v.name);
    shape[v.name] = v.required ? base : base.optional();
  }
  return shape;
}

function registerWorkflowTool(server: McpServer, wf: WorkflowRow) {
  server.registerTool(
    `wf__${wf.slug ?? wf.id}`,
    {
      title: wf.name,
      description: `${wf.description ?? wf.name} · runs the fabric engine (ends in a ZK-private settlement).`,
      inputSchema: wfSchema(wf),
    },
    async (input: Record<string, unknown>) => json(await runWorkflow(wf, input)),
  );
}

// Register everything currently in the catalog. Returns the names registered.
export async function registerCatalog(server: McpServer, force = true): Promise<{ apis: string[]; workflows: string[] }> {
  const { apis, workflows } = await loadCatalog(force);
  const apiNames: string[] = [];
  for (const a of apis) {
    try {
      apiNames.push(registerApiTool(server, a));
    } catch (e) {
      console.error(`skip API '${a.slug}': ${(e as Error).message}`);
    }
  }
  const wfNames: string[] = [];
  for (const w of workflows) {
    try {
      registerWorkflowTool(server, w);
      wfNames.push(`wf__${w.slug ?? w.id}`);
    } catch (e) {
      console.error(`skip workflow '${w.slug}': ${(e as Error).message}`);
    }
  }
  return { apis: apiNames, workflows: wfNames };
}

// `force` refetches the catalog; per-request builds reuse the briefly cached one.
export async function buildFabricServer(McpServerCtor: typeof McpServer, force = true): Promise<{ server: McpServer; registered: { apis: string[]; workflows: string[] } }> {
  const server = new McpServerCtor({ name: "kage-fabric", version: "0.2.0" });
  registerBuiltins(server);
  const registered = await registerCatalog(server, force);
  return { server, registered };
}
