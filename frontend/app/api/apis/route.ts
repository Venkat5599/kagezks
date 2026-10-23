// APIs (x402 payment-gated proxies) — list + create, persisted in Neon.
import { sql, type ApiRow } from "@/lib/db";
import { builtinApiRows, findBuiltinApi } from "@/lib/builtin-catalog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const owner = url.searchParams.get("owner");
  const scope = url.searchParams.get("scope");
  // Built-in APIs belong to everyone, so every listing includes them.
  const builtins = builtinApiRows();
  try {
    const rows = (scope === "public"
      ? await sql`SELECT * FROM apis WHERE is_public = true ORDER BY created_at DESC`
      : owner
        ? await sql`SELECT * FROM apis WHERE owner_address = ${owner} ORDER BY created_at DESC`
        : await sql`SELECT * FROM apis ORDER BY created_at DESC`) as ApiRow[];
    return Response.json({ ok: true, apis: [...builtins, ...rows] });
  } catch (e) {
    // The database being unreachable must not hide the built-in catalog.
    return Response.json({ ok: builtins.length > 0, apis: builtins, error: String(e) }, { status: builtins.length > 0 ? 200 : 500 });
  }
}

export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (!b?.name || !b?.target_url) {
      return Response.json({ ok: false, error: "name and target_url are required" }, { status: 400 });
    }
    const slug = String(b.slug || b.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (findBuiltinApi(slug)) return Response.json({ ok: false, error: "slug is reserved by a built-in API" }, { status: 409 });
    const rows = (await sql`
      INSERT INTO apis (name, slug, description, category, tags, payment_address, target_url,
        http_method, content_type, query_params, variables, example_response, price, auth_headers, is_public, owner_address)
      VALUES (${b.name}, ${slug}, ${b.description ?? null}, ${b.category ?? null},
        ${JSON.stringify(b.tags ?? [])}::jsonb, ${b.payment_address ?? null}, ${b.target_url},
        ${b.http_method ?? "GET"}, ${b.content_type ?? "application/json"}, ${b.query_params ?? null},
        ${JSON.stringify(b.variables ?? [])}::jsonb, ${b.example_response ?? null},
        ${Number(b.price ?? 0.01)}, ${JSON.stringify(b.auth_headers ?? [])}::jsonb, ${Boolean(b.is_public)}, ${b.owner_address ?? null})
      RETURNING *
    `) as ApiRow[];
    return Response.json({ ok: true, api: rows[0] });
  } catch (e) {
    const msg = String(e);
    if (msg.includes("duplicate key")) return Response.json({ ok: false, error: "slug already exists" }, { status: 409 });
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
