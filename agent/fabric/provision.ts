// Provision a per-user scoped SessionAccount — the real "generate a session account"
// action. Deploys a fresh SessionAccount contract instance for the connected wallet,
// initialises it under a strict policy (only Kage.deposit into the pool, USDC only, up
// to a cap, before expiry), funds it, and registers a personal bearer token so that
// user's agent settles through THEIR session (not the shared demo one).
//
// Pure @stellar/stellar-sdk (the VPS has no stellar CLI). The relayer (VEIL_FEE_SECRET)
// pays deploy/tx fees; the owner (the generated wallet's secret, testnet-only) signs the
// init + funding auth. Returns { sessionId, token } — the token goes in the agent's
// Authorization header to route settlement through this session.
import {
  rpc, Contract, Operation, TransactionBuilder, Networks, BASE_FEE, Address, Keypair,
  StrKey, xdr, nativeToScVal, authorizeEntry, hash,
} from "@stellar/stellar-sdk";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const RPC_URL = process.env.VEIL_RPC_URL ?? "https://soroban-testnet.stellar.org";
const PASS = Networks.TESTNET;
const SESSION_WASM = join(ROOT, "contracts", "solvency", "target", "wasm32v1-none", "release", "session_account.wasm");
const KEYFILE = join(ROOT, "sdk", "build", "agent_keys.json");

const server = () => new rpc.Server(RPC_URL);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Poll for a tx result, tolerating the js-xdr result-meta parse hiccup that throws under
// Bun even when the tx succeeded. Returns UNKNOWN if it never parsed a definitive status.
async function waitTx(s: rpc.Server, txHash: string): Promise<"SUCCESS" | "FAILED" | "UNKNOWN"> {
  let parseHiccups = 0;
  for (let i = 0; i < 20; i++) {
    await sleep(1500);
    try {
      const g = await s.getTransaction(txHash);
      if (g.status === "SUCCESS") return "SUCCESS";
      if (g.status === "FAILED") return "FAILED";
    } catch {
      // js-xdr result-meta parse bug (Bun/Windows): the tx almost certainly landed but the
      // meta can't be read. After a couple of these + a settle window, proceed as UNKNOWN.
      if (++parseHiccups >= 3) return "UNKNOWN";
    }
  }
  return "UNKNOWN";
}

// Deterministic contract id for a createCustomContract(deployer, salt) — no need to parse
// the deploy tx's return value (which the Bun xdr bug can't read).
function deriveContractId(deployerPub: string, salt: Buffer): string {
  const preimage = xdr.HashIdPreimage.envelopeTypeContractId(
    new xdr.HashIdPreimageContractId({
      networkId: hash(Buffer.from(PASS)),
      contractIdPreimage: xdr.ContractIdPreimage.contractIdPreimageFromAddress(
        new xdr.ContractIdPreimageFromAddress({ address: Address.fromString(deployerPub).toScAddress(), salt }),
      ),
    }),
  );
  return StrKey.encodeContract(hash(preimage.toXDR()));
}

function deployment() {
  const dep = JSON.parse(readFileSync(join(ROOT, "sdk", "build", "veil_deployment.json"), "utf8")) as { contract_id: string; usdc_sac: string };
  return { POOL: dep.contract_id, USDC: dep.usdc_sac };
}

// Submit a prepared op, letting the relayer pay + sign the tx envelope. `authEntries`
// (already owner-signed) are attached for host-function invocations that need owner auth.
async function submit(op: xdr.Operation, relayer: Keypair): Promise<string> {
  const s = server();
  const src = await s.getAccount(relayer.publicKey());
  const tx = new TransactionBuilder(src, { fee: "2000000", networkPassphrase: PASS }).addOperation(op).setTimeout(120).build();
  const prepared = await s.prepareTransaction(tx);
  prepared.sign(relayer);
  const sent = await s.sendTransaction(prepared);
  if (sent.status === "ERROR") throw new Error(`submit failed: ${JSON.stringify(sent.errorResult)}`);
  if ((await waitTx(s, sent.hash)) === "FAILED") throw new Error(`tx FAILED: ${sent.hash}`);
  return sent.hash;
}

// Invoke a contract method whose auth requires the owner (a G-account) to sign. Simulate,
// sign the owner auth entries with authorizeEntry, then submit with relayer paying fees.
async function invokeOwnerAuthed(contractId: string, method: string, args: xdr.ScVal[], owner: Keypair, relayer: Keypair): Promise<string> {
  const s = server();
  const op = new Contract(contractId).call(method, ...args);
  const src = await s.getAccount(relayer.publicKey());
  const tx = new TransactionBuilder(src, { fee: "2000000", networkPassphrase: PASS }).addOperation(op).setTimeout(120).build();
  const sim = await s.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim)) throw new Error(`sim ${method}: ${JSON.stringify((sim as { error?: unknown }).error ?? sim)}`);
  const latest = await s.getLatestLedger();
  const validUntil = latest.sequence + 1000;
  const rawAuth = sim.result?.auth ?? [];
  const signed = await Promise.all(rawAuth.map(async (e) => {
    if (e.credentials().switch().name !== "sorobanCredentialsAddress") return e;
    return authorizeEntry(e, owner, validUntil, PASS);
  }));
  const hostFn = op.body().invokeHostFunctionOp().hostFunction();
  const authedOp = Operation.invokeHostFunction({ func: hostFn, auth: signed });
  // Re-simulate with signed auth so the footprint is complete, then submit.
  const src2 = await s.getAccount(relayer.publicKey());
  const tx2 = new TransactionBuilder(src2, { fee: "2000000", networkPassphrase: PASS }).addOperation(authedOp).setTimeout(120).build();
  const sim2 = await s.simulateTransaction(tx2);
  if (!rpc.Api.isSimulationSuccess(sim2)) throw new Error(`sim2 ${method}: ${JSON.stringify((sim2 as { error?: unknown }).error ?? sim2)}`);
  const assembled = rpc.assembleTransaction(tx2, sim2).build();
  assembled.sign(relayer);
  const sent = await s.sendTransaction(assembled);
  if (sent.status === "ERROR") throw new Error(`submit ${method}: ${JSON.stringify(sent.errorResult)}`);
  if ((await waitTx(s, sent.hash)) === "FAILED") throw new Error(`tx ${method} FAILED: ${sent.hash}`);
  return sent.hash;
}

export type ProvisionResult = { sessionId: string; token: string; agent: string; cap: string; expiry: number; fundTx: string };

export async function provisionSession(ownerAddress: string, ownerSecret: string, amountRaw?: string): Promise<ProvisionResult> {
  if (!process.env.VEIL_FEE_SECRET) throw new Error("relayer (VEIL_FEE_SECRET) not configured");
  if (!existsSync(SESSION_WASM)) throw new Error("session_account.wasm not found on host");
  const relayer = Keypair.fromSecret(process.env.VEIL_FEE_SECRET);
  const owner = Keypair.fromSecret(ownerSecret);
  if (owner.publicKey() !== ownerAddress) throw new Error("ownerSecret does not match ownerAddress");
  const { POOL, USDC } = deployment();
  const agent = Keypair.random();
  const agentHex = Buffer.from(StrKey.decodeEd25519PublicKey(agent.publicKey())).toString("hex");
  const CAP = 50_000_000n; // 5 USDC
  const EXPIRY = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
  const fund = BigInt(amountRaw ?? "10000000"); // 1 USDC default

  const s = server();
  const wasm = readFileSync(SESSION_WASM);

  // 1. Upload wasm (idempotent — returns the same hash if already uploaded).
  const uploadOp = Operation.uploadContractWasm({ wasm });
  await submit(uploadOp, relayer).catch(() => {}); // ignore "already uploaded"
  const wasmHash = hash(wasm);

  // 2. Deploy a fresh instance (deployer = relayer, source-auth only).
  const salt = randomBytes(32);
  const deployOp = Operation.createCustomContract({ address: Address.fromString(relayer.publicKey()), wasmHash, salt });
  const src = await s.getAccount(relayer.publicKey());
  const dtx = new TransactionBuilder(src, { fee: "2000000", networkPassphrase: PASS }).addOperation(deployOp).setTimeout(120).build();
  const dsim = await s.simulateTransaction(dtx);
  if (!rpc.Api.isSimulationSuccess(dsim)) throw new Error(`deploy sim: ${JSON.stringify((dsim as { error?: unknown }).error ?? dsim)}`);
  const dprep = rpc.assembleTransaction(dtx, dsim).build();
  dprep.sign(relayer);
  const dsent = await s.sendTransaction(dprep);
  if (dsent.status === "ERROR") throw new Error(`deploy submit: ${JSON.stringify(dsent.errorResult)}`);
  if ((await waitTx(s, dsent.hash)) === "FAILED") throw new Error(`deploy FAILED: ${dsent.hash}`);
  // Derive the deployed contract id from deployer + salt (no tx-return parsing needed).
  const sessionId = deriveContractId(relayer.publicKey(), salt);

  // 3. init(owner, agent, pool, token, cap, expiry) — owner signs.
  await invokeOwnerAuthed(sessionId, "init", [
    new Address(owner.publicKey()).toScVal(),
    xdr.ScVal.scvBytes(Buffer.from(agentHex, "hex")),
    new Address(POOL).toScVal(),
    new Address(USDC).toScVal(),
    nativeToScVal(CAP, { type: "i128" }),
    nativeToScVal(EXPIRY, { type: "u64" }),
  ], owner, relayer);

  // 4. Fund the session with USDC (native SAC): owner transfers into it.
  const fundTx = await invokeOwnerAuthed(USDC, "transfer", [
    new Address(owner.publicKey()).toScVal(),
    new Address(sessionId).toScVal(),
    nativeToScVal(fund, { type: "i128" }),
  ], owner, relayer);

  // 5. Register a personal bearer token → this session (fee source backfills from env).
  const token = `kage_sk_${randomBytes(12).toString("hex")}`;
  const dir = dirname(KEYFILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const map = existsSync(KEYFILE) ? JSON.parse(readFileSync(KEYFILE, "utf8")) : {};
  map[token] = { label: `user-${ownerAddress.slice(0, 6)}`, sessionId, agentSecret: agent.secret() };
  writeFileSync(KEYFILE, JSON.stringify(map, null, 2));

  return { sessionId, token, agent: agent.publicKey(), cap: CAP.toString(), expiry: EXPIRY, fundTx };
}
