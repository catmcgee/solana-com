/**
 * Wire types for the visuals ("generative UI") the docs agent can attach to
 * an answer: `solana-docs-ui/v1`, sent in the chat stream's `ui_done` event
 * or with `done`. The renderers in components/docs/ask/visuals normalize
 * these through ./schema.ts before drawing anything.
 */

export type AskGenerativeUiComponentType =
  | "answer_intro"
  | "callout"
  | "cards"
  | "code_tabs"
  | "command_list"
  | "comparison"
  | "concept_model"
  | "definition_grid"
  | "source_links"
  | "step_flow";

export type AskGenerativeUiComponent = {
  type: AskGenerativeUiComponentType | (string & {});
  [key: string]: unknown;
};

export type AskGenerativeUi = {
  version: "solana-docs-ui/v1";
  kind: "answer";
  components: AskGenerativeUiComponent[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True for a well-formed `solana-docs-ui/v1` answer payload. */
export function isAskGenerativeUi(value: unknown): value is AskGenerativeUi {
  return (
    isRecord(value) &&
    value.version === "solana-docs-ui/v1" &&
    value.kind === "answer" &&
    Array.isArray(value.components) &&
    value.components.every(
      (component) => isRecord(component) && typeof component.type === "string",
    )
  );
}
