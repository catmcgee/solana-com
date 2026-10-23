import type { InferUITool, Tool, UIMessage } from "ai";
import type { AIChatClientData } from "@fumadocs/ai-chat";

/** The docs `search` tool, shared by /api/docs-chat and the chat UI. */
export type DocsSearchTool = Tool<
  { query: string; limit: number },
  { doc?: { url: string; title: string } | null; content?: string }[]
>;

export type DocsChatMessage = UIMessage<
  never,
  { client: AIChatClientData },
  { search: InferUITool<DocsSearchTool> }
>;

/**
 * Event Ask AI (components/docs/ask-ai.client.tsx) listens for: ask about a
 * code block (`detail.code`), from its Ask button (docs-components.client).
 */
export const DOCS_ASK_CODE_EVENT = "docs-ask-ai:code";
