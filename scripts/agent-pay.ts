// Live agent payment — the agent-signed deposit through the scoped SessionAccount
// (what the MCP veil_pay tool calls). Prints each step live so slow hops are visible.
//
//   VEIL_FEE_SECRET=$(stellar keys secret issuer) bun run scripts/agent-pay.ts <scanKeyHex> <amount7dp>
import { payThroughSession, poolStatus, remainingBudget } from "../sdk/kage-onchain.ts";

const [scanKey, amount] = process.argv.slice(2);
if (!scanKey || !amount) throw new Error("usage: bun run scripts/agent-pay.ts <scanKeyHex> <amount7dp>");
const feeSourceSecret = process.env.VEIL_FEE_SECRET;
if (!feeSourceSecret) throw new Error("set VEIL_FEE_SECRET (`stellar keys secret issuer`)");

const t = (s: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`);

t("reading budget + pool");
const budget = await remainingBudget();
const before = await poolStatus();
t(`budget ${budget} · pool leafCount ${before.leafCount}`);
if (budget < BigInt(amount)) throw new Error(`budget ${budget} < amount ${amount}`);

t(`agent paying ${(Number(amount) / 1e7).toFixed(2)} USDC → ${scanKey.slice(0, 12)}…`);
const res = await payThroughSession({
  recipientScanKey: scanKey,
  amount: BigInt(amount),
  feeSourceSecret,
  onStep: (s) => t("  · " + s),
});

const after = await poolStatus();
t(`DONE. tx ${res.hash}`);
console.log(JSON.stringify({ tx: res.hash, commitment: res.commitment, leafIndex: res.leafIndex, leafCountAfter: after.leafCount }, null, 2));
