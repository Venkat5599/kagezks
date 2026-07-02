// Workflows — list + create, persisted in Neon.
import { sql, type WorkflowRow } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const rows = (await sql`SELECT * FROM workflows ORDER BY created_at DESC`) as WorkflowRow[];
    return Response.json({ ok: true, workflows: rows });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (!b?.name) return Response.json({ ok: false, error: "name is required" }, { status: 400 });
    const slug = String(b.slug || b.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const rows = (await sql`
      INSERT INTO workflows (name, slug, description, is_public, input_variables, steps, output_mapping, allowed_contracts, tags)
      VALUES (${b.name}, ${slug}, ${b.description ?? null}, ${Boolean(b.is_public)},
        ${JSON.stringify(b.input_variables ?? [])}::jsonb, ${JSON.stringify(b.steps ?? [])}::jsonb,
        ${JSON.stringify(b.output_mapping ?? [])}::jsonb, ${JSON.stringify(b.allowed_contracts ?? [])}::jsonb,
        ${JSON.stringify(b.tags ?? [])}::jsonb)
      RETURNING *
    `) as WorkflowRow[];
    return Response.json({ ok: true, workflow: rows[0] });
  } catch (e) {
    const msg = String(e);
    if (msg.includes("duplicate key")) return Response.json({ ok: false, error: "slug already exists" }, { status: 409 });
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
