"use client";

import { Fragment } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/app/components/utils";
import {
  ASK_NODE_ARCHETYPES,
  type AskNodeTone,
  type VisualConceptModel,
  type VisualNode,
  type VisualNodeState,
  type VisualRelationship,
} from "@/lib/docs/ask/generative-ui/schema";
import { bodyText, mono, signatureLabel, VisualFrame } from "./frame";

/** What a hovered or focused step points at, and the model as it leaves it. */
export type ModelFocus = {
  touches: string[];
  connects: string[];
  state: Map<string, VisualNodeState>;
};

const TONE_TEXT: Record<AskNodeTone, string> = {
  purple: "text-[var(--sol-purple-text)]",
  green: "text-[var(--sol-green-text)]",
  neutral: "text-[var(--sol-dim)]",
};

const tag = cn(mono, "text-[10.5px] uppercase leading-4 tracking-[0.08em]");

const fade = "transition-opacity duration-150 motion-reduce:transition-none";

/** One column in a narrow panel; two or three with room, without orphans. */
function gridColumns(count: number) {
  if (count === 1) return "";
  if (count === 2 || count === 4) return "@[22rem]:grid-cols-2";
  return "@[22rem]:grid-cols-2 @xl:grid-cols-3";
}

function NodeCard({
  node,
  focus,
}: {
  node: VisualNode;
  focus: ModelFocus | null;
}) {
  const t = useTranslations("docsAsk.visuals");
  const state = focus?.state.get(node.id);
  const fields = state?.fields ?? node.fields;
  const closed = state ? state.closed : !!node.closed;
  const touched = !!focus?.touches.includes(node.id);
  return (
    <li
      data-node={node.id}
      data-archetype={node.archetype ?? undefined}
      data-touched={touched || undefined}
      className={cn(
        "min-w-0 rounded-lg border bg-[var(--sol-surface)] p-3 transition-[opacity,background-color,border-color,box-shadow] duration-150 motion-reduce:transition-none",
        closed ? "border-dashed" : "border-solid",
        touched
          ? "border-[var(--sol-purple-line)] bg-[var(--sol-purple-soft)] ring-1 ring-[var(--sol-purple-line)]"
          : closed
            ? "border-[var(--sol-line-strong)]"
            : "border-[var(--sol-line)]",
        focus && !touched && "opacity-60",
      )}
    >
      {node.archetype || closed ? (
        <div className="flex items-center justify-between gap-2">
          {node.archetype ? (
            <span className={cn(tag, TONE_TEXT[node.tone])}>
              {ASK_NODE_ARCHETYPES[node.archetype].label}
            </span>
          ) : null}
          {closed ? (
            <span className={cn(tag, "ms-auto text-[var(--sol-dim)]")}>
              {t("closed")}
            </span>
          ) : null}
        </div>
      ) : null}
      <p
        className={cn(
          "m-0 text-[13.5px] font-medium leading-5 text-[var(--sol-text)] [overflow-wrap:anywhere]",
          (node.archetype || closed) && "mt-1",
        )}
      >
        {node.name}
      </p>
      {node.address ? (
        <p
          className={cn(
            mono,
            "m-0 truncate text-[11.5px] text-[var(--sol-dim)]",
          )}
        >
          {node.address}
        </p>
      ) : null}
      {node.description ? (
        <p className="m-0 mt-1 text-[12.5px] leading-[1.5] text-[var(--sol-muted)]">
          {node.description}
        </p>
      ) : null}
      {fields.length > 0 ? (
        <dl className="m-0 mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[12px] leading-[18px]">
          {fields.map((field) => {
            const changed = "changed" in field && field.changed;
            return (
              <Fragment key={field.key}>
                <dt className="m-0 font-normal text-[var(--sol-dim)]">
                  {field.key}
                </dt>
                <dd
                  data-changed={changed || undefined}
                  className={cn(
                    mono,
                    "m-0 [overflow-wrap:anywhere]",
                    changed
                      ? "font-medium text-[var(--sol-purple-text)]"
                      : "text-[var(--sol-text)]",
                  )}
                >
                  {field.value}
                </dd>
              </Fragment>
            );
          })}
        </dl>
      ) : null}
    </li>
  );
}

function RelationshipRow({
  relationship,
  focus,
}: {
  relationship: VisualRelationship;
  focus: ModelFocus | null;
}) {
  const linked = !!focus?.connects.includes(relationship.id);
  const accent = linked
    ? "text-[var(--sol-purple-text)]"
    : "text-[var(--sol-dim)]";
  const arrow = (
    <span
      aria-hidden="true"
      className={cn("inline-block rtl:-scale-x-100", accent)}
    >
      →
    </span>
  );
  return (
    <li
      data-relationship={relationship.id}
      className={cn(
        "flex flex-wrap items-baseline gap-x-1.5 text-[13px] leading-5 text-[var(--sol-text)]",
        fade,
        focus && !linked && "opacity-60",
      )}
    >
      <span>{relationship.fromName}</span>
      {arrow}
      <span
        className={cn(
          mono,
          "text-[11px]",
          linked ? "text-[var(--sol-purple-text)]" : "text-[var(--sol-muted)]",
        )}
      >
        {relationship.label}
      </span>
      {arrow}
      <span>{relationship.toName}</span>
    </li>
  );
}

/**
 * The model's parts as cards (one column in the docked panel, two or three
 * when there's room) and how they connect. With `focus`, the parts a step
 * touches are highlighted, the rest dimmed, and fields show the step's
 * result.
 */
export function ModelDiagram({
  model,
  focus = null,
}: {
  model: VisualConceptModel;
  focus?: ModelFocus | null;
}) {
  const t = useTranslations("docsAsk.visuals");
  return (
    <>
      <div className="p-3">
        {model.body ? (
          <p
            className={cn(
              bodyText,
              "m-0 mb-3 px-0.5 text-[13px] leading-[1.6]",
            )}
          >
            {model.body}
          </p>
        ) : null}
        <ul
          className={cn(
            "m-0 grid list-none gap-2 p-0",
            gridColumns(model.nodes.length),
          )}
        >
          {model.nodes.map((node) => (
            <NodeCard key={node.id} node={node} focus={focus} />
          ))}
        </ul>
      </div>
      {model.relationships.length > 0 ? (
        <div className="border-t border-[var(--sol-line)] px-3.5 py-3">
          <p className={cn(signatureLabel, "m-0")}>{t("relationships")}</p>
          <ul className="m-0 mt-2 list-none space-y-1 p-0">
            {model.relationships.map((relationship) => (
              <RelationshipRow
                key={relationship.id}
                relationship={relationship}
                focus={focus}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

/** concept_model on its own: the diagram in a frame. */
export function VisualConceptModelBlock({
  model,
}: {
  model: VisualConceptModel;
}) {
  const t = useTranslations("docsAsk.visuals");
  return (
    <VisualFrame label={t("diagram")} title={model.title ?? t("model")}>
      <ModelDiagram model={model} />
    </VisualFrame>
  );
}
