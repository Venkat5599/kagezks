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
import { poolStatus } from "./steps.ts";
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
      return json({ remaining: remaining.toString(), unit: "USDC (7 decimals)", session: sid ?? "(default)" });
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
export async function registerCatalog(server: McpServer): Promise<{ apis: string[]; workflows: string[] }> {
  const { apis, workflows } = await loadCatalog(true);
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

export async function buildFabricServer(McpServerCtor: typeof McpServer): Promise<{ server: McpServer; registered: { apis: string[]; workflows: string[] } }> {
  const server = new McpServerCtor({ name: "kage-fabric", version: "0.2.0" });
  registerBuiltins(server);
  const registered = await registerCatalog(server);
  return { server, registered };
}
