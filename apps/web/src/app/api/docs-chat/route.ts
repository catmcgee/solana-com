import { createOpenAI } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type InferToolOutput,
} from "ai";
import { z } from "zod";
import { defaultLocale } from "@workspace/i18n/config";
import { docsSearchServer } from "@/lib/docs/search";
import { docsSource } from "@/lib/docs/source";
import type { DocsChatMessage, DocsSearchTool } from "@/lib/docs/chat";

/**
 * Ask AI for the docs (Fumadocs AI chat, components/docs/docs-chat.client):
 * GLM through Nous' OpenAI-compatible API, grounded by a `search` tool over
 * the docs search index and the found pages' Markdown.
 */
export const maxDuration = 60;

const MODEL = process.env.NOUS_MODEL ?? "z-ai/glm-5.3-flash:US";

const nous = createOpenAI({
  baseURL: "https://inference-api.nousresearch.com/v1",
  apiKey: process.env.NOUS_API_KEY,
});

const INSTRUCTIONS = [
  "You are Ask AI on solana.com, the assistant for the Solana developer docs. Readers may ask from any solana.com page, not only the docs.",
  "Use the `search` tool to find the relevant docs pages before answering, and answer from them. Search with short keyword queries (for example `transaction fees` or `send USDC`), and search again with other words if the first results do not answer the question.",
  "A user message may begin with [Client Context], the page they are reading; for questions about this page, search its title.",
  "Cite the pages you used as Markdown links with the `url` the search returned, as a path, for example [Fees](/developers/docs/core/fees). Only link pages the search returned; never make up a URL.",
  "Prefer @solana/kit for TypeScript examples. Keep answers short and concrete.",
  "If the docs do not cover the question, say so and suggest where to look.",
].join("\n");

const EXCERPT = 6000;

function searchTool(locale: string) {
  return tool({
    description:
      "Search the Solana developer docs. Returns matching pages with their Markdown.",
    inputSchema: z.object({
      query: z.string(),
      limit: z.number().int().min(1).max(8).default(4),
    }),
    async execute({ query, limit }): Promise<InferToolOutput<DocsSearchTool>> {
      const hits = await docsSearchServer.search(query, { locale });
      const urls = [
        ...new Set(hits.map((hit) => hit.url.split("#")[0]).filter(Boolean)),
      ].slice(0, limit);
      return Promise.all(
        urls.map(async (url) => {
          const page = [
            ...docsSource.getPages(locale),
            ...docsSource.getPages(),
          ].find((p) => p.url === url);
          if (!page) return { doc: null };
          const data = page.data as unknown as {
            title: string;
            getText: (type: "processed") => Promise<string>;
          };
          const text = await data.getText("processed").catch(() => "");
          return {
            doc: { url, title: data.title },
            content: text.slice(0, EXCERPT),
          };
        }),
      );
    },
  });
}

export async function POST(req: Request) {
  if (!process.env.NOUS_API_KEY)
    return new Response("Ask AI is not configured", { status: 503 });
  const body = (await req.json()) as {
    messages?: DocsChatMessage[];
    locale?: string;
  };
  const locale = body.locale ?? defaultLocale;
  const result = streamText({
    model: nous.chat(MODEL),
    instructions: INSTRUCTIONS,
    stopWhen: stepCountIs(5),
    tools: { search: searchTool(locale) },
    toolChoice: "auto",
    messages: await convertToModelMessages<DocsChatMessage>(
      body.messages ?? [],
      {
        convertDataPart(part) {
          if (part.type === "data-client")
            return {
              type: "text",
              text: `[Client Context: ${JSON.stringify(part.data)}]`,
            };
        },
      },
    ),
  });
  return result.toUIMessageStreamResponse();
}
