import "server-only";

/**
 * What kind of answer a question wants, as the docs agent's
 * GenerativeUiService::visualIntent decides it (no answer plan here). It
 * picks the visual (comparison and weak get none) and whether a conceptual
 * answer offers code follow-ups.
 */
export type VisualIntent =
  | "comparison"
  | "debugging"
  | "conceptual"
  | "procedural"
  | "weak";

const COMPARISON =
  /\b(compare|comparison|difference|differences|vs\.?|versus|which is better|tradeoffs?)\b/;
const ACTION =
  /\b(create|derive|initialize|debug|fix|mint|transfer|sign|send|build)\b/;
const DEBUG =
  /\b(error|fail|failed|failing|debug|fix|troubleshoot|exception|invalid|insufficient|not working|cannot|can't|logs?)\b/;
const CONCEPT =
  /\b(what is|what are|what does|explain|how does|why|concept|overview|model)\b|\bwhat's\b/;
const PROCEDURAL =
  /\b(how do i|how to|create|derive|initialize|send|transfer|sign|mint|airdrop|deploy|invoke|call|request|fetch|build|run)\b/;

function normalize(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .trim()
    .toLowerCase();
}

export function hasConceptIntent(text: string): boolean {
  return CONCEPT.test(normalize(text));
}

export function hasDebugIntent(text: string): boolean {
  return DEBUG.test(normalize(text));
}

/** The question decides first; the answer only settles an unclear question. */
export function visualIntent(question: string, answer = ""): VisualIntent {
  const asked = normalize(question);
  const text = normalize(`${question}\n${answer}`);
  if (!text) return "weak";
  if (COMPARISON.test(asked) && !ACTION.test(asked)) return "comparison";
  if (DEBUG.test(asked)) return "debugging";
  if (CONCEPT.test(asked)) return "conceptual";
  if (PROCEDURAL.test(text)) return "procedural";
  if (CONCEPT.test(text)) return "conceptual";
  return "weak";
}

/** Comparisons and questions without structure get no visual. */
export function wantsVisual(intent: VisualIntent): boolean {
  return intent !== "comparison" && intent !== "weak";
}
