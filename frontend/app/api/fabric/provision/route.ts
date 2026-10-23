// Dashboard → fabric bridge for setting up a per-user SessionAccount, in two steps:
//   { step: "prepare", ownerAddress, cap, amount } → a plan with two unsigned approvals
//   { step: "finish", id, signed: [..] }            → the session, once both are signed
// The owner's secret key is signed with in the browser and is never sent here; any
// request that carries one is refused.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const FABRIC = (process.env.KAGE_FABRIC_URL || "http://localhost:8403").replace(/\/$/, "");
// Shared secret the reverse proxy requires on every non-MCP fabric route (provisioning spends relayer XLM).
const GATEWAY: Record<string, string> = process.env.KAGE_FABRIC_GATEWAY_TOKEN ? { "x-kage-gateway": process.env.KAGE_FABRIC_GATEWAY_TOKEN } : {};

const carriesSecret = (body: Record<string, unknown>) =>
  Object.entries(body).some(([k, v]) => /secret/i.test(k) || (typeof v === "string" && /^S[A-Z2-7]{55}$/.test(v)));

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  if (carriesSecret(body)) return Response.json({ ok: false, error: "secret keys are never accepted; approvals are signed in your browser" }, { status: 400 });
  const step = body.step;
  if (step !== "prepare" && step !== "finish") return Response.json({ ok: false, error: "step must be prepare or finish" }, { status: 400 });
  const payload =
    step === "prepare"
      ? { ownerAddress: body.ownerAddress, cap: body.cap, amount: body.amount }
      : { id: body.id, signed: body.signed };
  try {
    const r = await fetch(`${FABRIC}/provision/${step}`, { method: "POST", headers: { "content-type": "application/json", ...GATEWAY }, body: JSON.stringify(payload) });
    const data = await r.json().catch(() => ({ ok: false, error: `fabric ${r.status}` }));
    return Response.json(data, { status: r.status });
  } catch (e) {
    return Response.json({ ok: false, error: `fabric unreachable: ${(e as Error).message}` }, { status: 502 });
  }
}
