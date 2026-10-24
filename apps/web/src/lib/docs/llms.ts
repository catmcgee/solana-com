import { llms } from "fumadocs-core/source";
import docsConfig from "../../../../docs/docs.json";
import { docsSource, type DocsPage } from "./source";
import { frontmatter } from "./page-data";

/**
 * Markdown for agents: page `.md` twins, /llms-full.txt and the MCP server.
 * Pages are Fumadocs' processed Markdown (snippets inlined, see
 * remark-docs-compat), headed by the docs' agent instructions
 * (docs.json `markdown.instructions`) and an index pointer, as before.
 */
const SITE = "https://solana.com";

const INSTRUCTIONS: string[] = docsConfig.markdown.instructions;

export const AGENT_PREAMBLE = [
  "> ## Documentation Index",
  `> Fetch the complete documentation index at: ${SITE}/llms.txt`,
  "> Use this file to discover all available pages before exploring further.",
  "",
  "> ## Agent Instructions",
  ...INSTRUCTIONS.map((line) => `> ${line}`),
  "",
].join("\n");

async function body(page: DocsPage): Promise<string> {
  const text = await (
    page.data as unknown as { getText: (t: "processed") => Promise<string> }
  ).getText("processed");
  return text.trim();
}

/** A page as Markdown, as served at `<page>.md`. */
export async function pageMarkdown(page: DocsPage): Promise<string> {
  const fm = frontmatter(page);
  const head = [`# ${fm.title}`, ""];
  if (fm.description) head.push(`> ${fm.description}`, "");
  return `${AGENT_PREAMBLE}\n${head.join("\n")}\n${await body(page)}\n`;
}

export const docsLlms = llms(docsSource, {
  async renderPage(page) {
    const fm = frontmatter(page);
    return `# ${fm.title}\nSource: ${SITE}${page.url}\n\n${fm.description ? `${fm.description}\n\n` : ""}${await body(page)}`;
  },
});
