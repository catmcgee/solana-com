import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { registerSearchTool, registerSourceTools } from "fumadocs-core/mcp";
import { docsSource } from "@/lib/docs/source";
import { docsLlms } from "@/lib/docs/llms";
import { docsSearchServer } from "@/lib/docs/search";

/**
 * MCP server for the docs (Fumadocs `fumadocs-core/mcp`), stateless
 * streamable HTTP at /mcp, with the `search`, `list_pages` and `get_page`
 * tools (`get_page` returns a page's Markdown by its URL). Advertised in the
 * docs' Link header (src/proxy.ts).
 */
const handler = createMcpHandler(() => {
  const mcp = new McpServer({ name: "solana-docs", version: "1.0.0" });
  registerSearchTool(mcp, docsSearchServer);
  registerSourceTools(mcp, docsSource, docsLlms);
  return mcp;
});

export const dynamic = "force-dynamic";

function serve(request: Request) {
  return handler.fetch(request);
}

export { serve as GET, serve as POST, serve as DELETE };
