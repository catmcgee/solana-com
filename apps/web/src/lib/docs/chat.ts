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
