/**
 * MCP server card for the docs MCP server at /mcp (src/app/mcp/route.ts),
 * advertised in the docs' Link header (rel="mcp-server-card").
 */
export const dynamic = "force-static";

export function GET() {
  return Response.json({
    version: "1.0",
    serverInfo: {
      name: "solana-docs",
      title: "Solana Developer Docs",
      version: "1.0.0",
    },
    description:
      "Search the Solana developer docs and read any page as Markdown.",
    documentationUrl: "https://solana.com/developers/docs",
    transport: { type: "streamable-http", endpoint: "/mcp" },
    capabilities: { tools: { listChanged: false } },
    tools: [
      { name: "search", description: "Search docs pages with a query" },
      {
        name: "list_pages",
        description: "List all docs pages with their pathnames (URLs)",
      },
      {
        name: "get_page",
        description:
          "Get the Markdown content of a docs page by its pathname (URL)",
      },
    ],
  });
}
