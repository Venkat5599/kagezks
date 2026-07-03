// Dashboard → fabric bridge. The browser can't reach the Bun fabric server directly
// (it runs on localhost:8403, and only it can build ZK proofs), so the Next app
// proxies run requests to it server-side. Real execution end-to-end — no simulation:
// a workflow run here triggers the actual engine (and, for on-chain steps, a real
// Groth16 proof + Soroban deposit through the SessionAccount).
export const dynamic = "force-dynamic";
export const revalidate = 0;

const FABRIC = (process.env.KAGE_FABRIC_URL || "http://localhost:8403").replace(/\/$/, "");

export async function POST(req: Request) {
  let body: { kind?: "workflow" | "api"; slug?: string; input?: unknown; args?: unknown; token?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const { kind, slug, input, args, token } = body;
  if (!kind || !slug) return Response.json({ ok: false, error: "kind and slug required" }, { status: 400 });

  const path = kind === "api" ? "/run/api" : "/run/workflow";
  const payload = kind === "api" ? { slug, args } : { slug, input };
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;

  try {
    const r = await fetch(`${FABRIC}${path}`, { method: "POST", headers, body: JSON.stringify(payload) });
    const data = await r.json().catch(() => ({ ok: false, error: `fabric returned ${r.status}` }));
    return Response.json(data, { status: r.status });
  } catch (e) {
    return Response.json({ ok: false, error: `fabric unreachable at ${FABRIC}: ${(e as Error).message}` }, { status: 502 });
  }
}
