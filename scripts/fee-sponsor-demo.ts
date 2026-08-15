// Kage — Fee Sponsorship demo (Black Belt advanced feature).
// "Gasless transactions using fee bump": a user signs a payment with base fee 0,
// and the admin (sponsor) wraps it in a fee-bump that pays the network fee.
// Native Stellar fee-bump, no contract required.
//
//   VEIL_ADMIN_SECRET=S... bun run scripts/fee-sponsor-demo.ts
import {
  Keypair,
  Horizon,
  TransactionBuilder,
  Operation,
  FeeBumpTransaction,
  Networks,
  BASE_FEE,
  Asset,
} from "@stellar/stellar-sdk";
import { appendFileSync } from "node:fs";
import { join } from "node:path";

const HORIZON_URL = "https://horizon.stellar.org";
const NET = Networks.PUBLIC;
const EXPLORER = "https://stellar.expert/explorer/public/tx/";

const ADMIN_SECRET = process.env.VEIL_ADMIN_SECRET;
if (!ADMIN_SECRET) { console.error("set VEIL_ADMIN_SECRET"); process.exit(1); }

const ROOT = join(import.meta.dir, "..");
const admin = Keypair.fromSecret(ADMIN_SECRET);
const hz = new Horizon.Server(HORIZON_URL);

async function main() {
  const user = Keypair.random();
  appendFileSync(join(ROOT, "scripts", "fee-sponsor-wallets.txt"), `${user.publicKey()} | ${user.secret()}\n`);

  // 1. Sponsored user — min balance only (cannot pay fees itself).
  const asrc = await hz.loadAccount(admin.publicKey());
  const createTx = new TransactionBuilder(asrc, { fee: BASE_FEE, networkPassphrase: NET })
    .addOperation(Operation.createAccount({ destination: user.publicKey(), startingBalance: "1.5" }))
    .setTimeout(30).build();
  createTx.sign(admin);
  await hz.submitTransaction(createTx);
  console.log(`sponsored user: ${user.publicKey()} (1.5 XLM)`);

  // 2. The user signs a payment with base fee 0 (gasless).
  const usrc = await hz.loadAccount(user.publicKey());
  const inner = new TransactionBuilder(usrc, { fee: "0", networkPassphrase: NET })
    .addOperation(Operation.payment({ destination: admin.publicKey(), asset: Asset.native(), amount: "0.1" }))
    .setTimeout(120).build();
  inner.sign(user);

  // 3. Admin wraps it in a fee-bump (pays the network fee).
  const fb = TransactionBuilder.buildFeeBumpTransaction(admin, "100000", inner, NET);
  fb.sign(admin);
  const res = await hz.submitTransaction(fb);
  console.log(`FEE-SPONSORED PAYMENT (gasless): ${res.hash}`);
  console.log(`  ${EXPLORER}${res.hash}`);
  appendFileSync(join(ROOT, "scripts", "fee-sponsor-proof.txt"),
    `Fee-sponsored payment (gasless via fee bump):\n  user: ${user.publicKey()}\n  tx: ${EXPLORER}${res.hash}\n\n`);

  // 4. Recycle: merge the sponsored user back to admin.
  const msrc = await hz.loadAccount(user.publicKey());
  const mtx = new TransactionBuilder(msrc, { fee: BASE_FEE, networkPassphrase: NET })
    .addOperation(Operation.accountMerge({ destination: admin.publicKey() })).setTimeout(30).build();
  mtx.sign(user);
  const mr = await hz.submitTransaction(mtx);
  console.log(`merge: ${EXPLORER}${mr.hash}`);
}

main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
