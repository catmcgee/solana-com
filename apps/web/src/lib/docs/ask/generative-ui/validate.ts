/**
 * The server-side gate for visuals a model writes: a port of the docs
 * agent's GenerativeUiValidator.php (solana-com-agent). It returns a
 * sanitized `solana-docs-ui/v1` payload with only the four first-payload
 * component types and the fields the renderers read, or `ok: false`.
 *
 * Unlike ./schema.ts (which repairs whatever the agent sends so the panel
 * can draw it), this rejects: a component with any error is dropped, and a
 * payload that tried to draw a model and a flow fails unless both survive
 * and the flow's effects and text reference the model's nodes. Ported
 * as-is, with one stricter rule: a concept_model needs at least one node.
 */
import type { AskGenerativeUi, AskGenerativeUiComponent } from "./types";

export const ASK_VISUAL_VERSION = "solana-docs-ui/v1";

/** The agent's config/ask.php defaults. */
export const ASK_VISUAL_LIMITS = {
  components: 5,
  steps: 4,
  bytes: 12_000,
} as const;

const COMPONENT_TYPES = [
  "answer_intro",
  "callout",
  "concept_model",
  "step_flow",
] as const;

const ARCHETYPES = [
  "wallet",
  "signer",
  "mint-account",
  "token-account",
  "pda",
  "program",
  "instruction",
  "transaction",
  "rpc-client",
  "rpc-node",
  "validator",
];

const RELATIONSHIP_TYPES = [
  "owns",
  "signs",
  "derives",
  "initializes",
  "invokes",
  "writes",
  "reads",
  "mints-to",
  "transfers-to",
];

const EFFECT_ACTIONS = ["reveal", "update", "connect", "close"];

const SETUP_NEEDLES = [
  "airdrop",
  "fund wallet",
  "fund your wallet",
  "install ",
  "install the",
  "select devnet",
  "set --url devnet",
  "config set --url devnet",
  "connect to devnet",
  "point wallet",
];

const NODE_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export type AskVisualValidation =
  | { ok: true; payload: AskGenerativeUi; errors: string[] }
  | { ok: false; payload: null; errors: string[] };

type Rec = Record<string, unknown>;
type Errors = string[];

function isRecord(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** PHP's is_array: a JSON list or object. */
function isArrayLike(value: unknown): value is unknown[] | Rec {
  return Array.isArray(value) || isRecord(value);
}

function values(value: unknown[] | Rec): unknown[] {
  return Array.isArray(value) ? value : Object.values(value);
}

function isNumeric(value: unknown): boolean {
  return (
    (typeof value === "number" && Number.isFinite(value)) ||
    (typeof value === "string" && value.trim() !== "" && !isNaN(+value))
  );
}

function containsUnsafeMarkup(value: string): boolean {
  return (
    /<\s*\/?\s*(script|iframe|object|embed|style)\b/i.test(value) ||
    /\son[a-z]+\s*=/i.test(value) ||
    value.toLowerCase().includes("javascript:")
  );
}

/** Drops null, empty strings and empty arrays (PHP `compact` here). */
function compact<T extends Rec>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(
      ([, value]) =>
        value !== null &&
        value !== undefined &&
        value !== "" &&
        !(Array.isArray(value) && value.length === 0),
    ),
  ) as T;
}

function optionalText(
  item: Rec,
  key: string,
  path: string,
  errors: Errors,
): string | null {
  const raw = item[key];
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string" && !isNumeric(raw)) {
    errors.push(`${path} must be a string`);
    return null;
  }
  const value = String(raw).trim();
  if (!value) return null;
  if (containsUnsafeMarkup(value)) {
    errors.push(`${path} contains unsafe markup`);
    return null;
  }
  return value;
}

function requiredText(
  item: Rec,
  key: string,
  path: string,
  errors: Errors,
): string | null {
  const value = optionalText(item, key, path, errors);
  if (value === null) errors.push(`${path} is required`);
  return value;
}

function nodeIdOrNull(
  value: string | null,
  path: string,
  errors: Errors,
): string | null {
  if (value === null) return null;
  if (!NODE_ID.test(value)) {
    errors.push(`${path} must be stable kebab-case`);
    return null;
  }
  if (value.length > 64) {
    errors.push(`${path} must be 64 characters or fewer`);
    return null;
  }
  return value;
}

function requiredNodeId(item: Rec, key: string, path: string, errors: Errors) {
  return nodeIdOrNull(requiredText(item, key, path, errors), path, errors);
}

function optionalNodeId(item: Rec, key: string, path: string, errors: Errors) {
  return nodeIdOrNull(optionalText(item, key, path, errors), path, errors);
}

function optionalCode(
  item: Rec,
  key: string,
  path: string,
  errors: Errors,
): string | null {
  const raw = item[key];
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string" && !isNumeric(raw)) {
    errors.push(`${path} must be a string`);
    return null;
  }
  const value = String(raw).trim();
  if (!value) return null;
  if (
    /<\s*(script|iframe|object|embed|style)\b/i.test(value) ||
    value.toLowerCase().includes("javascript:")
  ) {
    errors.push(`${path} contains unsafe code content`);
    return null;
  }
  return value;
}

function optionalEnum(
  item: Rec,
  key: string,
  allowed: readonly string[],
  path: string,
  errors: Errors,
): string | null {
  const value = optionalText(item, key, path, errors);
  if (value === null) return null;
  if (!allowed.includes(value)) {
    errors.push(`${path} is invalid`);
    return null;
  }
  return value;
}

function arrayItems(
  item: Rec,
  key: string,
  path: string,
  errors: Errors,
  required = true,
): unknown[] {
  const raw = item[key];
  if (raw === undefined || raw === null) {
    if (required) errors.push(`${path} is required`);
    return [];
  }
  if (!isArrayLike(raw)) {
    errors.push(`${path} must be an array`);
    return [];
  }
  return values(raw);
}

function scalarText(value: unknown, path: string, errors: Errors) {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value !== "string" && !isNumeric(value)) {
    errors.push(`${path} must be a string`);
    return null;
  }
  const text = String(value).trim();
  if (!text) return null;
  if (containsUnsafeMarkup(text)) {
    errors.push(`${path} contains unsafe markup`);
    return null;
  }
  return text;
}

function fieldList(node: Rec, key: string, path: string, errors: Errors) {
  const raw = node[key];
  if (raw === undefined || raw === null) return [];
  if (!isArrayLike(raw)) {
    errors.push(`${path} must be an array or object`);
    return [];
  }
  const fields: Array<{ label: string; value: string }> = [];
  if (Array.isArray(raw)) {
    raw.forEach((field, index) => {
      if (!isRecord(field)) {
        errors.push(`${path}.${index} must be an object`);
        return;
      }
      const label = requiredText(
        field,
        "label",
        `${path}.${index}.label`,
        errors,
      );
      const value = requiredText(
        field,
        "value",
        `${path}.${index}.value`,
        errors,
      );
      if (label !== null && value !== null) fields.push({ label, value });
    });
    return fields;
  }
  for (const [name, value] of Object.entries(raw)) {
    const label = name.trim();
    if (!label) {
      errors.push(`${path}.${name} must have a non-empty label`);
      continue;
    }
    const text = scalarText(value, `${path}.${name}`, errors);
    if (text !== null) fields.push({ label, value: text });
  }
  return fields;
}

function fieldKey(label: string | null): string | null {
  if (label === null) return null;
  const key = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "");
  return /^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)*$/.test(key) ? key : null;
}

const ARCHETYPE_NEEDLES: Array<[string, string[]]> = [
  [
    "token-account",
    ["token-account", "token account", "associated token", "ata"],
  ],
  ["mint-account", ["mint-account", "mint account", "token mint", "mint"]],
  ["rpc-client", ["rpc-client", "rpc client", "client"]],
  ["rpc-node", ["rpc-node", "rpc node", "rpc"]],
  ["validator", ["validator"]],
  ["transaction", ["transaction", "tx"]],
  ["instruction", ["instruction"]],
  ["program", ["program-id", "program id", "program"]],
  ["pda", ["pda", "program derived address"]],
  ["signer", ["signer"]],
  ["wallet", ["wallet"]],
];

function scalar(value: unknown): string | null {
  return typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
    ? String(value)
    : null;
}

function inferArchetype(
  node: Rec,
  id: string | null,
  label: string | null,
): string | null {
  const text = [node.kind, id, label, node.description]
    .map(scalar)
    .filter((part): part is string => !!part)
    .join(" ")
    .toLowerCase();
  for (const [archetype, needles] of ARCHETYPE_NEEDLES) {
    if (needles.some((needle) => text.includes(needle))) return archetype;
  }
  return null;
}

const RELATIONSHIP_NEEDLES: Array<[string, string[]]> = [
  ["mints-to", ["mints-to", "minted to", "mint into", "mints into"]],
  ["transfers-to", ["transfers-to", "transfer to", "transfers"]],
  ["owns", ["owns", "owner", "owned by"]],
  ["signs", ["signs", "signer", "authority", "authorizes"]],
  ["derives", ["derives", "derived from", "derived for"]],
  [
    "initializes",
    ["initializes", "initialized at", "initialized with", "creates"],
  ],
  ["invokes", ["invokes", "cpi", "calls"]],
  ["writes", ["writes", "stores", "updates", "mutates"]],
  ["reads", ["reads", "references", "balance for", "points at"]],
];

function relationshipTypeFromText(value: unknown): string | null {
  const text = scalar(value)?.toLowerCase();
  if (!text) return null;
  for (const [type, needles] of RELATIONSHIP_NEEDLES) {
    if (needles.some((needle) => text.includes(needle))) return type;
  }
  return null;
}

function sanitizeAnswerIntro(component: Rec, path: string, errors: Errors) {
  return compact({
    type: "answer_intro",
    title: optionalText(component, "title", `${path}.title`, errors),
    body: requiredText(component, "body", `${path}.body`, errors),
    variant: optionalEnum(
      component,
      "variant",
      ["default", "summary"],
      `${path}.variant`,
      errors,
    ),
  });
}

function sanitizeCallout(component: Rec, path: string, errors: Errors) {
  return compact({
    type: "callout",
    tone:
      optionalEnum(
        component,
        "tone",
        ["info", "warning", "success"],
        `${path}.tone`,
        errors,
      ) ?? "info",
    title: optionalText(component, "title", `${path}.title`, errors),
    body: requiredText(component, "body", `${path}.body`, errors),
  });
}

function sanitizeConceptModel(component: Rec, path: string, errors: Errors) {
  const nodes: Rec[] = [];
  const nodeIds: string[] = [];
  arrayItems(component, "nodes", `${path}.nodes`, errors).forEach(
    (node, index) => {
      const at = `${path}.nodes.${index}`;
      if (!isRecord(node)) {
        errors.push(`${at} must be an object`);
        return;
      }
      // Contract field is `label`; `title` is accepted as an alias.
      const label =
        optionalText(node, "label", `${at}.label`, errors) ??
        optionalText(node, "title", `${at}.title`, errors);
      if (label === null) errors.push(`${at}.label is required`);
      const id = requiredNodeId(node, "id", `${at}.id`, errors);
      if (id !== null) {
        if (nodeIds.includes(id)) {
          errors.push(`${at}.id duplicates an earlier node id`);
        }
        nodeIds.push(id);
      }
      const archetype =
        optionalEnum(
          node,
          "archetype",
          ARCHETYPES,
          `${at}.archetype`,
          errors,
        ) ?? inferArchetype(node, id, label);
      if (archetype === null) errors.push(`${at}.archetype is required`);
      nodes.push(
        compact({
          id,
          archetype,
          label,
          description: optionalText(
            node,
            "description",
            `${at}.description`,
            errors,
          ),
          fields: fieldList(node, "fields", `${at}.fields`, errors),
        }),
      );
    },
  );
  if (nodes.length === 0) errors.push(`${path}.nodes must include a node`);

  // Contract field is `relationships`; `edges` is accepted as an alias.
  const key = Object.hasOwn(component, "relationships")
    ? "relationships"
    : "edges";
  const relationships: Rec[] = [];
  arrayItems(component, key, `${path}.${key}`, errors, false).forEach(
    (edge, index) => {
      const at = `${path}.${key}.${index}`;
      if (!isRecord(edge)) {
        errors.push(`${at} must be an object`);
        return;
      }
      const from = requiredText(edge, "from", `${at}.from`, errors);
      const to = requiredText(edge, "to", `${at}.to`, errors);
      if (from !== null && !nodeIds.includes(from)) {
        errors.push(`${at}.from must reference an existing node id`);
      }
      if (to !== null && !nodeIds.includes(to)) {
        errors.push(`${at}.to must reference an existing node id`);
      }
      const kind =
        optionalEnum(edge, "kind", RELATIONSHIP_TYPES, `${at}.kind`, errors) ??
        optionalEnum(edge, "type", RELATIONSHIP_TYPES, `${at}.type`, errors) ??
        relationshipTypeFromText(edge.label);
      if (kind === null) errors.push(`${at}.kind is required`);
      relationships.push(
        compact({
          from,
          to,
          kind,
          label: optionalText(edge, "label", `${at}.label`, errors),
        }),
      );
    },
  );

  return compact({
    type: "concept_model",
    title: optionalText(component, "title", `${path}.title`, errors),
    body:
      optionalText(component, "body", `${path}.body`, errors) ??
      optionalText(component, "description", `${path}.description`, errors),
    network: optionalText(component, "network", `${path}.network`, errors),
    state_label: optionalText(
      component,
      "state_label",
      `${path}.state_label`,
      errors,
    ),
    nodes,
    relationships,
  });
}

/** A devnet, airdrop or install step: the validator leaves these out. */
export function isSetupOnlyStep(parts: Array<string | null>): boolean {
  const text = parts
    .filter((part): part is string => !!part)
    .join("\n")
    .toLowerCase();
  return !!text && SETUP_NEEDLES.some((needle) => text.includes(needle));
}

/** "reveal a: …", "update a.b: …", "connect a -> b: …", "close a: …". */
function parseStateChange(change: string): Rec | null {
  const id = "[a-z][a-z0-9]*(?:-[a-z0-9]+)*";
  const field = "[a-z][a-z0-9_-]*(?:\\.[a-z][a-z0-9_-]*)*";
  const after = () => change.slice(change.indexOf(":") + 1).trim();
  let match = new RegExp(`^reveal (${id}): \\S.*$`).exec(change);
  if (match) return { action: "reveal", node_id: match[1], value: after() };
  match = new RegExp(`^update (${id})\\.(${field}): \\S.*$`).exec(change);
  if (match) {
    return {
      action: "update",
      node_id: match[1],
      field: match[2],
      value: after(),
    };
  }
  match = new RegExp(`^connect (${id}) -> (${id}): \\S.*$`).exec(change);
  if (match) {
    const label = after();
    return {
      action: "connect",
      node_id: match[1],
      to_node_id: match[2],
      kind: relationshipTypeFromText(label) ?? "reads",
      label,
    };
  }
  match = new RegExp(`^close (${id}): \\S.*$`).exec(change);
  if (match) return { action: "close", node_id: match[1], value: after() };
  return null;
}

function sanitizeEffect(effect: Rec, path: string, errors: Errors): Rec {
  const action = optionalEnum(
    effect,
    "action",
    EFFECT_ACTIONS,
    `${path}.action`,
    errors,
  );
  if (action === null) errors.push(`${path}.action is required`);
  let field: string | null = null;
  let value: string | null = null;
  let toNodeId: string | null = null;
  let kind: string | null = null;
  if (action === "update") {
    field = fieldKey(requiredText(effect, "field", `${path}.field`, errors));
    if (field === null) errors.push(`${path}.field must be a stable field key`);
    value = requiredText(effect, "value", `${path}.value`, errors);
  } else if (action === "connect") {
    toNodeId =
      optionalNodeId(effect, "to_node_id", `${path}.to_node_id`, errors) ??
      optionalNodeId(
        effect,
        "target_node_id",
        `${path}.target_node_id`,
        errors,
      );
    if (toNodeId === null) errors.push(`${path}.to_node_id is required`);
    kind =
      optionalEnum(
        effect,
        "kind",
        RELATIONSHIP_TYPES,
        `${path}.kind`,
        errors,
      ) ??
      optionalEnum(
        effect,
        "relationship",
        RELATIONSHIP_TYPES,
        `${path}.relationship`,
        errors,
      ) ??
      optionalEnum(
        effect,
        "type",
        RELATIONSHIP_TYPES,
        `${path}.type`,
        errors,
      ) ??
      relationshipTypeFromText(effect.label);
    if (kind === null) errors.push(`${path}.kind is required`);
  } else if (action === "reveal" || action === "close") {
    field = fieldKey(optionalText(effect, "field", `${path}.field`, errors));
    value =
      optionalText(effect, "value", `${path}.value`, errors) ??
      optionalText(effect, "body", `${path}.body`, errors);
  }
  return compact({
    node_id: requiredNodeId(effect, "node_id", `${path}.node_id`, errors),
    action,
    field,
    value,
    to_node_id: toNodeId,
    kind,
    label: optionalText(effect, "label", `${path}.label`, errors),
  });
}

function effectList(step: Rec, path: string, errors: Errors): Rec[] {
  if (step.effects !== undefined && step.effects !== null) {
    if (!isArrayLike(step.effects)) {
      errors.push(`${path}.effects must be an array`);
      return [];
    }
    return values(step.effects)
      .map((effect, index) => {
        if (!isRecord(effect)) {
          errors.push(`${path}.effects.${index} must be an object`);
          return null;
        }
        return sanitizeEffect(effect, `${path}.effects.${index}`, errors);
      })
      .filter(
        (effect): effect is Rec =>
          effect !== null && Object.keys(effect).length > 0,
      );
  }
  const changes = step.state_changes;
  if (changes === undefined || changes === null) return [];
  if (!isArrayLike(changes)) {
    errors.push(`${path}.state_changes must be an array`);
    return [];
  }
  const effects: Rec[] = [];
  values(changes).forEach((raw, index) => {
    const at = `${path}.state_changes.${index}`;
    if (typeof raw !== "string" && !isNumeric(raw)) {
      errors.push(`${at} must be a string`);
      return;
    }
    const change = String(raw).trim();
    if (!change) return;
    if (containsUnsafeMarkup(change)) {
      errors.push(`${at} contains unsafe markup`);
      return;
    }
    const effect = parseStateChange(change);
    if (!effect) {
      errors.push(
        `${at} must start with reveal, update, connect, or close using the Vector state_changes convention`,
      );
      return;
    }
    effects.push(effect);
  });
  return effects;
}

function sanitizeStepFlow(
  component: Rec,
  path: string,
  errors: Errors,
  maxSteps: number,
) {
  const steps: Rec[] = [];
  const items = arrayItems(component, "steps", `${path}.steps`, errors);
  for (const [index, step] of items.entries()) {
    if (steps.length >= maxSteps) break;
    const at = `${path}.steps.${index}`;
    if (!isRecord(step)) {
      errors.push(`${at} must be an object`);
      continue;
    }
    // A plain copyable string; the legacy {copy, …} object is folded to it.
    let command: string | null = null;
    if (step.command !== undefined && step.command !== null) {
      command = isRecord(step.command)
        ? optionalCode(step.command, "copy", `${at}.command.copy`, errors)
        : optionalCode(step, "command", `${at}.command`, errors);
    }
    const title = requiredText(step, "title", `${at}.title`, errors);
    const body = requiredText(step, "body", `${at}.body`, errors);
    const result = requiredText(step, "result", `${at}.result`, errors);
    if (isSetupOnlyStep([title, body, command, result])) continue;
    steps.push(
      compact({
        id: optionalText(step, "id", `${at}.id`, errors),
        title,
        body,
        command,
        result,
        effects: effectList(step, at, errors),
      }),
    );
  }
  if (steps.length === 0) {
    errors.push(`${path}.steps must include at least one primary visual step`);
  }
  return compact({
    type: "step_flow",
    title: optionalText(component, "title", `${path}.title`, errors),
    body:
      optionalText(component, "body", `${path}.body`, errors) ??
      optionalText(component, "description", `${path}.description`, errors),
    steps,
  });
}

function sanitizeComponent(
  component: unknown,
  path: string,
  errors: Errors,
  maxSteps: number,
): Rec | null {
  if (!isRecord(component)) {
    errors.push(`${path} must be an object`);
    return null;
  }
  const type = typeof component.type === "string" ? component.type : "";
  switch (type as (typeof COMPONENT_TYPES)[number]) {
    case "answer_intro":
      return sanitizeAnswerIntro(component, path, errors);
    case "callout":
      return sanitizeCallout(component, path, errors);
    case "concept_model":
      return sanitizeConceptModel(component, path, errors);
    case "step_flow":
      return sanitizeStepFlow(component, path, errors, maxSteps);
    default:
      // Never passed through: the renderers only cover the allowlist.
      errors.push(`${path}.type is unsupported and was omitted`);
      return null;
  }
}

/** The text a step "mentions": body, result and its effects' values. */
function stepReferenceText(step: Rec): string {
  const parts: string[] = [];
  for (const key of ["body", "result"]) {
    if (typeof step[key] === "string") parts.push(step[key] as string);
  }
  for (const effect of Array.isArray(step.effects) ? step.effects : []) {
    if (!isRecord(effect)) continue;
    parts.push(
      Object.values(effect)
        .map((value) => scalar(value) ?? "")
        // PHP array_filter: "" and "0" are falsy.
        .filter((value) => value !== "" && value !== "0")
        .join(" "),
    );
  }
  return parts.join("\n").toLowerCase();
}

function effectNodeIds(effect: Rec): string[] {
  return [effect.node_id, effect.to_node_id, effect.target_node_id].filter(
    (id): id is string => typeof id === "string",
  );
}

/**
 * Every step has effects on existing nodes, every node is mentioned by the
 * flow, and every step mentions a node: the model and the flow tell one story.
 */
function modelFlowContractErrors(components: Rec[]): string[] {
  const nodeIds = [
    ...new Set(
      components
        .filter((component) => component.type === "concept_model")
        .flatMap((component) =>
          (Array.isArray(component.nodes) ? component.nodes : [])
            .filter(isRecord)
            .map((node) => node.id)
            .filter((id): id is string => typeof id === "string"),
        ),
    ),
  ];
  if (nodeIds.length === 0) return [];
  const errors: string[] = [];
  const stepTexts: string[] = [];
  let stepIndex = 0;
  for (const component of components) {
    if (component.type !== "step_flow") continue;
    for (const step of Array.isArray(component.steps) ? component.steps : []) {
      if (!isRecord(step)) continue;
      stepTexts.push(stepReferenceText(step));
      const effects = (Array.isArray(step.effects) ? step.effects : []).filter(
        isRecord,
      );
      if (effects.length === 0) {
        errors.push(`step_flow step ${stepIndex} must include effects`);
      }
      effects.forEach((effect, effectIndex) => {
        for (const id of effectNodeIds(effect)) {
          if (!nodeIds.includes(id)) {
            errors.push(
              `step_flow step ${stepIndex} effects ${effectIndex} must reference an existing concept_model node id`,
            );
          }
        }
      });
      stepIndex++;
    }
  }
  if (stepTexts.length === 0) return errors;
  const flowText = stepTexts.join("\n").trim();
  for (const id of nodeIds) {
    if (!flowText.includes(id.toLowerCase())) {
      errors.push(
        `concept_model node id ${id} must be referenced by step_flow text`,
      );
    }
  }
  stepTexts.forEach((text, index) => {
    if (!nodeIds.some((id) => text.includes(id.toLowerCase()))) {
      errors.push(
        `step_flow step ${index} must reference at least one concept_model node id`,
      );
    }
  });
  return errors;
}

function invalid(errors: string[]): AskVisualValidation {
  return { ok: false, payload: null, errors: [...new Set(errors)] };
}

/**
 * Validates and sanitizes a model's visual. `ok` payloads contain only
 * allowlisted components and fields, at most `limits.components` components
 * and `limits.steps` steps per flow, and fit in `limits.bytes` of JSON
 * (trailing components are shed to fit).
 */
export function validateAskVisual(
  payload: unknown,
  limits: {
    components: number;
    steps: number;
    bytes: number;
  } = ASK_VISUAL_LIMITS,
): AskVisualValidation {
  if (!isRecord(payload)) return invalid(["payload must be a JSON object"]);
  const errors: string[] = [];
  if (payload.version !== ASK_VISUAL_VERSION) {
    errors.push(`version must be ${ASK_VISUAL_VERSION}`);
  }
  const kind =
    payload.kind === undefined || payload.kind === null
      ? "answer"
      : scalar(payload.kind);
  if (kind !== "answer") errors.push("kind must be answer");
  const components = isArrayLike(payload.components)
    ? values(payload.components)
    : [];
  if (components.length === 0) {
    errors.push("components must be a non-empty array");
  }
  // Top-level shape errors are fatal; component errors drop the component.
  if (errors.length > 0) return invalid(errors);

  const attempted = components.flatMap((component) =>
    isRecord(component) &&
    component.type !== undefined &&
    component.type !== null
      ? [scalar(component.type) ?? ""]
      : [],
  );
  const attemptedModelFlow =
    attempted.includes("concept_model") && attempted.includes("step_flow");

  const maxComponents = Math.max(1, limits.components);
  const maxSteps = Math.max(1, Math.min(4, limits.steps));
  const warnings: string[] = [];
  let sanitized: Rec[] = [];
  for (const [index, component] of components.entries()) {
    if (sanitized.length >= maxComponents) {
      warnings.push(`components truncated to ${maxComponents} items`);
      break;
    }
    const componentErrors: string[] = [];
    const result = sanitizeComponent(
      component,
      `components.${index}`,
      componentErrors,
      maxSteps,
    );
    if (result !== null && componentErrors.length === 0) sanitized.push(result);
    else warnings.push(...componentErrors);
  }
  if (sanitized.length === 0) {
    return invalid([
      "no valid components remained after validation",
      ...warnings,
    ]);
  }
  if (attemptedModelFlow) {
    const types = sanitized.map((component) => component.type);
    if (!types.includes("concept_model") || !types.includes("step_flow")) {
      return invalid([
        "procedural generative UI payloads require valid concept_model and step_flow components",
        ...warnings,
      ]);
    }
  }
  const contract = modelFlowContractErrors(sanitized);
  if (contract.length > 0) return invalid([...contract, ...warnings]);

  // Over the byte cap, shed trailing components rather than the payload.
  const maxBytes = Math.max(1_000, limits.bytes);
  const encoder = new TextEncoder();
  while (sanitized.length > 0) {
    const result: AskGenerativeUi = {
      version: ASK_VISUAL_VERSION,
      kind: "answer",
      components: sanitized as AskGenerativeUiComponent[],
    };
    if (encoder.encode(JSON.stringify(result)).length <= maxBytes) {
      return { ok: true, payload: result, errors: [...new Set(warnings)] };
    }
    sanitized = sanitized.slice(0, -1);
    warnings.push(`components dropped to fit the ${maxBytes}-byte cap`);
  }
  return invalid([`payload exceeds ${maxBytes} bytes`, ...warnings]);
}
