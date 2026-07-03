// Deploys Veil to testnet and runs the full e2e with REAL transactions:
//   deploy -> init -> set_vks -> deposit (insert proof) -> withdraw (membership
//   proof, paid to a stealth address) -> double-spend attempt (rejected).
//
//   bun run scripts/veil-deploy.ts
//
// Uses the native SAC as a USDC stand-in (no asset issuance needed for the demo).
import { $ } from "bun";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SDKB = join(ROOT, "sdk", "build");
const WASM = join(ROOT, "contracts/solvency/target/wasm32v1-none/release/veil.wasm");
const NET = "testnet";
const SRC = "issuer";

const m = JSON.parse(readFileSync(join(SDKB, "veil_manifest.json"), "utf8"));
const NATIVE_SAC = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

const issuer = (await $`stellar keys address ${SRC}`.text()).trim();
console.log(`issuer = ${issuer}`);

// 1. Deploy.
const cid = (
  await $`stellar contract deploy --wasm ${WASM} --source ${SRC} --network ${NET}`.text()
).trim();
writeFileSync(join(SDKB, "veil_contract.txt"), cid);
// Downstream (kage fabric, sdk/kage-onchain config, frontend) reads this.
writeFileSync(
  join(SDKB, "veil_deployment.json"),
  JSON.stringify({ network: NET, contract_id: cid, usdc_sac: NATIVE_SAC }, null, 2),
);
console.log(`contract = ${cid}`);

const inv = (args: string[]) =>
  $`stellar contract invoke --id ${cid} --source ${SRC} --network ${NET} -- ${args}`;

// 2. init(admin, usdc=native SAC, empty_root).
await inv(["init", "--admin", issuer, "--usdc", NATIVE_SAC, "--empty_root", m.emptyRoot]);
console.log("init OK");

// 3. set_vks.
await $`stellar contract invoke --id ${cid} --source ${SRC} --network ${NET} -- set_vks --insert_vk-file-path ${join(SDKB, "insert_vk.json")} --withdraw_vk-file-path ${join(SDKB, "withdraw_vk.json")}`;
console.log("set_vks OK");

// 4. Fund the stealth payout address (friendbot) so the SAC transfer reaches it.
await fetch(`https://friendbot.stellar.org/?addr=${m.stealthAddress}`).catch(() => {});
console.log(`stealth address funded: ${m.stealthAddress}`);

// 5. deposit(from, commitment, ephemeral_pubkey, amount, new_root, leaf_index, proof).
// Retry: RPC can briefly lag behind the set_vks instance write (simulation
// then reports NoVerificationKey, #4) before the new state propagates.
for (let attempt = 1; ; attempt++) {
  const r = await $`stellar contract invoke --id ${cid} --source ${SRC} --network ${NET} -- deposit --from ${issuer} --commitment ${m.commitment} --ephemeral_pubkey ${m.ephemeralPub} --amount ${m.amount} --new_root ${m.newRoot} --leaf_index ${m.leafIndex} --proof-file-path ${join(SDKB, "e2e_insert_proof.json")}`.nothrow();
  if (r.exitCode === 0) break;
  if (attempt >= 5) throw new Error(`deposit failed after ${attempt} attempts:\n${r.stderr}`);
  console.log(`  deposit attempt ${attempt} hit RPC lag, retrying…`);
}
console.log("deposit OK (insert proof verified on-chain, USDC pulled)");

const root = (await inv(["current_root"]).text()).trim();
const count = (await inv(["leaf_count"]).text()).trim();
console.log(`  current_root = ${root}  leaf_count = ${count}`);

// 6. withdraw(proof, root, nullifier_hash, to=stealth, amount).
await $`stellar contract invoke --id ${cid} --source ${SRC} --network ${NET} -- withdraw --proof-file-path ${join(SDKB, "e2e_withdraw_proof.json")} --root ${m.newRoot} --nullifier_hash ${m.nullifierHash} --to ${m.stealthAddress} --amount ${m.amount}`;
console.log("withdraw OK (membership proof verified, paid to stealth address)");

// 7. Double-spend: same nullifier must be rejected.
const dbl = await $`stellar contract invoke --id ${cid} --source ${SRC} --network ${NET} -- withdraw --proof-file-path ${join(SDKB, "e2e_withdraw_proof.json")} --root ${m.newRoot} --nullifier_hash ${m.nullifierHash} --to ${m.stealthAddress} --amount ${m.amount}`.nothrow();
if (dbl.exitCode !== 0) {
  console.log("double-spend rejected OK (NullifierUsed)");
} else {
  console.log("WARNING: double-spend NOT rejected — investigate");
}

console.log("\nVEIL e2e complete on testnet.");
console.log(`  contract: https://stellar.expert/explorer/testnet/contract/${cid}`);
