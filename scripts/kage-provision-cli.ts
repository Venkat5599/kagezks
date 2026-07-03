// Veil Kage Fabric — scoped, ZK-private agent payment (testnet).
//
//   bun run scripts/kage-provision-cli.ts
//
// The "autonomy without custody" idea, on Stellar and made private with Veil's ZK pool:
//
//   1. The OWNER deploys a SessionAccount custom-account contract and delegates a
//      single AGENT session key under a strict policy (only Veil.deposit, only
//      USDC into the pool, up to `cap`, before `expiry`).
//   2. The OWNER funds the SessionAccount with USDC + a little XLM.
//   3. The AGENT — holding ONLY the session key, never the owner's key — derives
//      a Veil stealth note + insert proof and calls Veil.deposit with `from` set
//      to the SessionAccount. The deposit's auth is signed by the agent key and
//      gated by the contract's __check_auth: anything outside the policy reverts.
//
// Result: the agent acts on-chain autonomously, can never drain or redirect
// funds, and the payment is ZK-private (who/how much hidden in the pool).
//
// This wires the proven Veil ZK e2e (see scripts/veil-deploy.ts) through the
// SessionAccount. Run veil-e2e-gen + the snarkjs prove step first so the insert
// proof bytes exist in sdk/build/.
import { $ } from "bun";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SDKB = join(ROOT, "sdk", "build");
const SESSION_WASM = join(ROOT, "contracts/solvency/target/wasm32v1-none/release/session_account.wasm");
const NET = "testnet";
const OWNER = "issuer"; // a funded testnet identity (the owner)

const m = JSON.parse(readFileSync(join(SDKB, "veil_manifest.json"), "utf8"));
const deployment = JSON.parse(readFileSync(join(SDKB, "veil_deployment.json"), "utf8"));
const VEIL = deployment.contract_id as string;
const USDC = deployment.usdc_sac as string;

// The agent's session key — generated fresh; the owner only ever delegates its
// PUBLIC key. The agent never sees the owner's secret.
const agent = Keypair.random();
const agentPubRaw = StrKey.decodeEd25519PublicKey(agent.publicKey()); // 32 raw bytes
const agentHex = Buffer.from(agentPubRaw).toString("hex");

const owner = (await $`stellar keys address ${OWNER}`.text()).trim();
console.log(`owner        = ${owner}`);
console.log(`agent (pub)  = ${agent.publicKey()}`);
console.log(`veil pool    = ${VEIL}`);

// 1. Deploy the SessionAccount.
const session = (
  await $`stellar contract deploy --wasm ${SESSION_WASM} --source ${OWNER} --network ${NET}`.text()
).trim();
console.log(`session acct = ${session}`);

// 2. Owner delegates the scoped policy: only this pool, only USDC, cap 5 USDC, ~1h.
const CAP = 50_000_000; // 5.0 USDC (7 decimals)
const EXPIRY = Math.floor(Date.now() / 1000) + 30 * 24 * 3600; // 30 days (was 1h)
const initRes = await $`stellar contract invoke --id ${session} --source ${OWNER} --network ${NET} -- init \
  --owner ${owner} --agent ${agentHex} --pool ${VEIL} --token ${USDC} --cap ${CAP} --expiry ${EXPIRY}`.nothrow();
if (initRes.exitCode !== 0) throw new Error(`session init failed:\n${initRes.stderr}`);
console.log("policy set (only Veil.deposit, USDC -> pool, cap 5 USDC) OK");

// 3. Owner funds the session account with USDC so the agent has a budget to move.
await $`stellar contract invoke --id ${USDC} --source ${OWNER} --network ${NET} -- transfer \
  --from ${owner} --to ${session} --amount ${m.amount}`.nothrow();
console.log(`funded session account with ${Number(m.amount) / 1e7} USDC`);

writeFileSync(
  join(SDKB, "agent_fabric.json"),
  JSON.stringify({ session, agent: agent.publicKey(), agentSecret: agent.secret(), pool: VEIL, cap: CAP, expiry: EXPIRY }, null, 2),
);

console.log(`\nScoped session ready: ${session}`);
console.log("The agent can now sign a Veil.deposit (from = session account); __check_auth");
console.log("permits ONLY that, only into the pool, only within the cap. Everything else reverts.");
console.log("Next: agent signs the deposit auth entry with the session key and submits");
console.log("(reuses the proven insert proof in sdk/build/e2e_insert_proof.json).");
