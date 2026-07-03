// Dashboard → fabric bridge for provisioning a per-user SessionAccount. The browser
// posts the generated wallet's owner address + secret (testnet only); the Bun fabric
// deploys + inits + funds a real SessionAccount and returns a personal bearer token.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const FABRIC = (process.env.KAGE_FABRIC_URL || "http://localhost:8403").replace(/\/$/, "");

export async function POST(req: Request) {
  let body: { ownerAddress?: string; ownerSecret?: string; amount?: string };
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid JSON" }, { status: 400 }); }
  if (!body.ownerAddress || !body.ownerSecret) return Response.json({ ok: false, error: "ownerAddress and ownerSecret required" }, { status: 400 });
  try {
    const r = await fetch(`${FABRIC}/provision`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({ ok: false, error: `fabric ${r.status}` }));
    return Response.json(data, { status: r.status });
  } catch (e) {
    return Response.json({ ok: false, error: `fabric unreachable: ${(e as Error).message}` }, { status: 502 });
  }
}
