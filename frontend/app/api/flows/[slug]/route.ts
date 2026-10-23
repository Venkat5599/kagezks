// Built-in workflow: GET /api/flows/<slug>?input=value → { answer, details, steps }
import { runBuiltinWorkflow } from "@/lib/builtin-workflows";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const args = Object.fromEntries(new URL(req.url).searchParams.entries());
  const res = await runBuiltinWorkflow(slug, args);
  if (!res.ok) return Response.json({ ok: false, error: res.error, steps: res.steps ?? [] }, { status: res.status });
  return Response.json({ ok: true, ...res.result }, { headers: { "access-control-allow-origin": "*" } });
}
