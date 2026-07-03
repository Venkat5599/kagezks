// Kage demo agent — an MCP client that drives an autonomous private payment.
//
//   bun run agent/demo-agent.ts "pay <scanKeyHex> 5 USDC privately"
//   bun run agent/demo-agent.ts --scripted "<scanKeyHex>" 5000000
//
// Connects to the Kage MCP server (agent/mcp-server.ts), discovers the tools, and
// completes the task autonomously. Two modes:
//
//   • LLM mode (default, needs ANTHROPIC_API_KEY): Claude reads the natural-language
//     instruction, picks tools, and runs the x402 → pay-if-budget flow itself.
//   • --scripted (no key, offline): deterministically walks kage_quote → kage_pay,
//     so the demo runs without an API key or token spend.
//
// Prints: discovered tools, the steps taken, and the resulting commitment + testnet tx.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const MODEL = process.env.VEIL_AGENT_MODEL ?? "claude-sonnet-4-6";

type TextContent = { type: string; text?: string };
const textOf = (r: { content?: TextContent[] }) =>
  (r.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");

// Connect over stdio: spawn the MCP server as a subprocess and talk MCP over its
// stdin/stdout. Most reliable transport; passes our env (VEIL_FEE_SECRET etc) through.
async function connect(): Promise<Client> {
  const client = new Client({ name: "veil-demo-agent", version: "0.1.0" });
  const transport = new StdioClientTransport({
    command: "bun",
    args: ["run", `${import.meta.dir}/mcp-server.ts`, "--stdio"],
    env: process.env as Record<string, string>,
  });
  await client.connect(transport);
  return client;
}

// --- Scripted mode: deterministic x402 -> pay, no LLM ------------------------
async function scripted(scanKey: string, amount: string) {
  const client = await connect();
  const tools = await client.listTools();
  console.log("discovered tools:", tools.tools.map((t) => t.name).join(", "));

  console.log("\n1. kage_pool_status");
  console.log(textOf(await client.callTool({ name: "kage_pool_status", arguments: {} })));

  console.log("\n2. kage_quote (get x402 price + nonce)");
  const quoteRes = textOf(await client.callTool({ name: "kage_quote", arguments: { amount } }));
  console.log(quoteRes);
  const cp = JSON.parse(quoteRes)?.callPrice as { nonce: string; payTo: string; amount: string } | undefined;

  console.log("\n3. pay the x402 fee on-chain (real Stellar payment to the operator)");
  const feeSecret = process.env.VEIL_FEE_SECRET;
  if (!cp || !feeSecret) throw new Error("no quote nonce or VEIL_FEE_SECRET to settle x402");
  const { payX402 } = await import("./x402.ts");
  const x402Tx = await payX402(feeSecret, cp);
  console.log(`   x402 settled: ${x402Tx}`);

  console.log("\n4. kage_pay (retry with verified x402 payment proof)");
  // The on-chain ZK deposit takes ~90s (proof + submit + poll); raise the MCP
  // request timeout above the default 60s so the client waits for the result.
  const pay = await client.callTool(
    { name: "kage_pay", arguments: { recipientScanKey: scanKey, amount, payment: { nonce: cp.nonce, txHash: x402Tx } } },
    undefined,
    { timeout: 240_000 },
  );
  console.log(textOf(pay));

  await client.close();
}

// --- LLM mode: Claude drives the tools --------------------------------------
async function llmDriven(instruction: string) {
  const AnthropicMod = await import("@anthropic-ai/sdk").catch(() => null);
  if (!AnthropicMod || !process.env.ANTHROPIC_API_KEY) {
    console.log("(no ANTHROPIC_API_KEY / SDK) — falling back to --scripted parsing of the instruction");
    const m = instruction.match(/([a-f0-9]{40,})\D+(\d[\d_]*)/i);
    if (!m) throw new Error("could not parse scan key + amount from instruction; use --scripted");
    return scripted(m[1]!, m[2]!.replace(/_/g, ""));
  }
  const Anthropic = AnthropicMod.default;
  const anthropic = new Anthropic();
  const client = await connect();
  const list = await client.listTools();
  console.log("discovered tools:", list.tools.map((t) => t.name).join(", "));

  const tools = list.tools.map((t) => ({
    name: t.name,
    description: t.description ?? "",
    input_schema: t.inputSchema as Record<string, unknown>,
  }));

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content:
        `${instruction}\n\nYou pay through Kage. Steps: call kage_quote to get an x402 nonce, ` +
        `then call kage_pay with that nonce in { payment: { nonce, txHash: "demo-x402-settlement" } }. ` +
        `Report the resulting commitment and tx hash.`,
    },
  ];

  for (let turn = 0; turn < 8; turn++) {
    const resp = await anthropic.messages.create({ model: MODEL, max_tokens: 1024, tools, messages });
    messages.push({ role: "assistant", content: resp.content });

    const toolUses = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (toolUses.length === 0) {
      const t = resp.content.find((b) => b.type === "text");
      console.log("\nagent:", t && "text" in t ? t.text : "(done)");
      break;
    }
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      console.log(`\n→ ${tu.name}(${JSON.stringify(tu.input)})`);
      const out = await client.callTool(
        { name: tu.name, arguments: tu.input as Record<string, unknown> },
        undefined,
        { timeout: 240_000 },
      );
      const text = textOf(out as { content?: TextContent[] });
      console.log(text);
      results.push({ type: "tool_result", tool_use_id: tu.id, content: text });
    }
    messages.push({ role: "user", content: results });
  }
  await client.close();
}

// --- entry ------------------------------------------------------------------
const argv = process.argv.slice(2);
if (argv[0] === "--scripted") {
  const scanKey = argv[1];
  const amount = argv[2];
  if (!scanKey || !amount) throw new Error('usage: --scripted "<scanKeyHex>" <amount7dp>');
  await scripted(scanKey, amount);
} else {
  const instruction = argv.join(" ") || "pay the payee 5 USDC privately";
  await llmDriven(instruction);
}
