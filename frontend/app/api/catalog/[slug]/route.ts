// Built-in catalog API: GET /api/catalog/<slug>?arg=value
// Free, keyless, server-side calls to public upstreams (see lib/builtin-catalog.ts).
import { runBuiltinApi } from "@/lib/builtin-catalog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const args = Object.fromEntries(new URL(req.url).searchParams.entries());
  const res = await runBuiltinApi(slug, args);
  if (!res.ok) return Response.json({ ok: false, error: res.error }, { status: res.status });
  return Response.json({ ok: true, data: res.data }, { headers: { "access-control-allow-origin": "*" } });
}
