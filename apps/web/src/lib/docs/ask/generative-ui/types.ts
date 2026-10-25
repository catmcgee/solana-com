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

function isComponent(value: unknown): value is AskGenerativeUiComponent {
  return isRecord(value) && typeof value.type === "string";
}

/**
 * The `solana-docs-ui/v1` answer payload in `value`, without components
 * that aren't objects with a string `type` (as Bri's client did: one bad
 * component no longer drops the whole visual; the agent's validator is the
 * strict gate). Null for any other envelope, or when no component is left.
 */
export function toAskGenerativeUi(value: unknown): AskGenerativeUi | null {
  if (
    !isRecord(value) ||
    value.version !== "solana-docs-ui/v1" ||
    value.kind !== "answer" ||
    !Array.isArray(value.components)
  ) {
    return null;
  }
  const components = value.components.filter(isComponent);
  if (components.length === 0) return null;
  return components.length === value.components.length
    ? (value as AskGenerativeUi)
    : ({ ...value, components } as AskGenerativeUi);
}

/** True for a well-formed `solana-docs-ui/v1` answer payload (every component valid). */
export function isAskGenerativeUi(value: unknown): value is AskGenerativeUi {
  return (
    isRecord(value) &&
    value.version === "solana-docs-ui/v1" &&
    value.kind === "answer" &&
    Array.isArray(value.components) &&
    value.components.every(isComponent)
  );
}
