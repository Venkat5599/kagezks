// What a plain visit to /mcp/<server> shows. AI assistants talk MCP to this URL; a
// person (or a chat assistant using web browsing) opening it gets a readable page: what
// the server does, how to connect it, and a direct link for every tool that returns
// the answer as JSON, so a browsing assistant can use it without a connector.
import { builtinMcpRowsFull, type ToolCard } from "@/lib/builtin-workflows";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const toolUrl = (origin: string, c: ToolCard) => {
  const path = c.kind === "workflow" ? `/api/flows/${c.tool.slice(4)}` : `/api/catalog/${c.tool.slice(5)}`;
  const qs = new URLSearchParams(c.example).toString();
  return `${origin}${path}${qs ? `?${qs}` : ""}`;
};

export function mcpInfo(origin: string, slug: string) {
  const row = builtinMcpRowsFull().find((r) => r.slug === slug);
  if (!row) return null;
  const url = `${origin}/mcp/${slug}`;
  return {
    server: row.display_name,
    description: row.description,
    mcpUrl: url,
    note: "This is an MCP server URL. Add it to an AI assistant as a connector, or open any tool link below directly to get its answer as JSON.",
    connect: {
      claude: "Settings → Connectors → Add custom connector → paste the MCP URL",
      chatgpt: "Settings → Apps & Connectors → Advanced → Developer mode on → Create → paste the MCP URL, Authentication: none",
      claudeCode: `claude mcp add kage --transport http ${url}`,
    },
    tools: row.cards.map((c) => ({
      tool: c.tool,
      name: c.name,
      description: c.description,
      ask: c.ask,
      inputs: c.inputs.map((i) => ({ name: i.name, required: i.required, description: i.description })),
      tryIt: toolUrl(origin, c),
    })),
  };
}

export function mcpInfoHtml(info: NonNullable<ReturnType<typeof mcpInfo>>) {
  const tools = info.tools
    .map(
      (t) => `<li><h3>${esc(t.name)} <code>${esc(t.tool)}</code></h3><p>${esc(t.description)}</p><p class="ask">Ask: “${esc(t.ask)}”</p>
<p>Inputs: ${t.inputs.length ? t.inputs.map((i) => `<code>${esc(i.name)}</code>${i.required ? "" : " (optional)"}`).join(", ") : "none"}</p>
<p><a href="${esc(t.tryIt)}">${esc(t.tryIt)}</a></p></li>`,
    )
    .join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(info.server)} · Kage MCP server</title><meta name="description" content="${esc(info.description)}">
<style>body{font:16px/1.55 system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;color:#111}code{background:#f2f2f2;padding:1px 5px;border-radius:4px;font-size:.9em}
pre{background:#f2f2f2;padding:12px;border-radius:8px;overflow:auto}li{margin-bottom:22px}h3{margin:0 0 4px;font-size:1.05em}p{margin:4px 0}.ask{color:#555;font-style:italic}a{word-break:break-all}</style></head>
<body><p><a href="https://kageai.me">Kage</a> · MCP server</p><h1>${esc(info.server)}</h1><p>${esc(info.description)}</p>
<p><strong>MCP URL:</strong> <code>${esc(info.mcpUrl)}</code></p><p>${esc(info.note)}</p>
<h2>Connect it</h2><ul><li><strong>Claude:</strong> ${esc(info.connect.claude)}</li><li><strong>ChatGPT:</strong> ${esc(info.connect.chatgpt)}</li><li><strong>Claude Code:</strong> <code>${esc(info.connect.claudeCode)}</code></li></ul>
<h2>Tools (${info.tools.length})</h2><p>Every link runs the tool with an example and returns JSON. Change the values in the link to ask about another wallet or token.</p><ol>${tools}</ol></body></html>`;
}
