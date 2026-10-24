"use client";

import { useMemo, useState, type FocusEvent } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/app/components/utils";
import {
  modelStateAtStep,
  type VisualConceptModel,
  type VisualLink,
  type VisualStep,
  type VisualStepFlow,
} from "@/lib/docs/ask/generative-ui/schema";
import { CommandRow } from "./command-row.client";
import { ModelDiagram, type ModelFocus } from "./concept-model.client";
import {
  bodyText,
  Disclosure,
  focusRing,
  mono,
  signatureLabel,
  VisualFrame,
  VisualLinks,
} from "./frame";
import { CircleCheckIcon } from "./icons";

/**
 * Which step the reader is looking at: hover wins over keyboard focus, which
 * wins over a step picked by clicking its title (touch has no hover).
 */
type StepPointer = {
  activeId: string | null;
  pinnedId: string | null;
  onEnter: (id: string) => void;
  onLeave: () => void;
  onFocus: (id: string) => void;
  onBlur: (event: FocusEvent<HTMLElement>) => void;
  onToggle: (id: string) => void;
};

/** Mouse and focus handlers for a step's element in the merged visual. */
function pointerProps(step: VisualStep, pointer: StepPointer | undefined) {
  if (!pointer) return {};
  return {
    onMouseEnter: () => pointer.onEnter(step.id),
    onMouseLeave: pointer.onLeave,
    onFocus: () => pointer.onFocus(step.id),
    onBlur: pointer.onBlur,
  };
}

function StepTitle({
  step,
  pointer,
  className,
}: {
  step: VisualStep;
  pointer?: StepPointer;
  className?: string;
}) {
  const t = useTranslations("docsAsk.visuals");
  const title = step.title ?? t("step", { n: step.n });
  const base = cn(
    "text-[13.5px] font-medium leading-5 text-[var(--sol-text)]",
    className,
  );
  // A title only does something when the step touches the diagram.
  if (!pointer || (step.touches.length === 0 && step.connects.length === 0)) {
    return <p className={cn(base, "m-0")}>{title}</p>;
  }
  const active = pointer.activeId === step.id;
  return (
    <button
      type="button"
      aria-pressed={pointer.pinnedId === step.id}
      onClick={() => pointer.onToggle(step.id)}
      className={cn(
        base,
        "rounded-sm text-start transition-colors duration-150 hover:text-[var(--sol-purple-text)] motion-reduce:transition-none",
        active && "text-[var(--sol-purple-text)]",
        focusRing,
      )}
    >
      {title}
    </button>
  );
}

/** Body, command, result, what changes and docs links of one step. */
function StepDetails({ step }: { step: VisualStep }) {
  const t = useTranslations("docsAsk.visuals");
  const changes = step.effects.filter((effect) => effect.label);
  return (
    <>
      {step.body ? (
        <p className={cn(bodyText, "m-0 mt-1 text-[13px] leading-[1.6]")}>
          {step.body}
        </p>
      ) : null}
      {step.command ? (
        <div className="mt-2">
          <CommandRow variant="boxed" command={step.command} />
        </div>
      ) : null}
      {step.result ? (
        <p className={cn(bodyText, "m-0 mt-2 text-[13px] leading-[1.6]")}>
          <span className={cn(signatureLabel, "me-2")}>{t("result")}</span>
          {step.result}
        </p>
      ) : null}
      {changes.length > 0 ? (
        <Disclosure className="mt-2" summary={t("changes")}>
          <ul className="m-0 mt-1.5 list-disc space-y-0.5 ps-[1.125rem] text-[12.5px] leading-[1.55] text-[var(--sol-muted)] marker:text-[var(--sol-dim)]">
            {changes.map((effect, index) => (
              <li key={`${index}-${effect.label}`}>{effect.label}</li>
            ))}
          </ul>
        </Disclosure>
      ) : null}
      <VisualLinks className="mt-2" label={t("docs")} links={step.links} />
    </>
  );
}

/** The numbered rail: 24px circles joined by a hairline. */
function StepRail({
  steps,
  pointer,
}: {
  steps: VisualStep[];
  pointer?: StepPointer;
}) {
  return (
    <ol className="m-0 list-none px-3.5 py-3.5">
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        const active = pointer?.activeId === step.id;
        return (
          <li
            key={step.id}
            data-step={step.id}
            data-active={active || undefined}
            className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3"
            {...pointerProps(step, pointer)}
          >
            <div aria-hidden="true" className="flex flex-col items-center">
              <span
                className={cn(
                  mono,
                  "grid size-6 shrink-0 place-items-center rounded-full border bg-[var(--sol-page)] text-[11px] transition-colors duration-150 motion-reduce:transition-none",
                  active
                    ? "border-[var(--sol-purple)] text-[var(--sol-purple-text)]"
                    : "border-[var(--sol-line-strong)] text-[var(--sol-muted)]",
                )}
              >
                {step.n}
              </span>
              {last ? null : (
                <span className="mt-1 w-px flex-1 bg-[var(--sol-line)]" />
              )}
            </div>
            <div className={cn("min-w-0 pt-0.5", !last && "pb-5")}>
              <StepTitle step={step} pointer={pointer} />
              <StepDetails step={step} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** "Before you start": setup steps as a checklist; folded when long. */
function SetupChecklist({
  steps,
  pointer,
}: {
  steps: VisualStep[];
  pointer?: StepPointer;
}) {
  const t = useTranslations("docsAsk.visuals");
  const list = (
    <ul className="m-0 mt-2 list-none space-y-2 p-0">
      {steps.map((step) => (
        <li
          key={step.id}
          data-step={step.id}
          data-active={pointer?.activeId === step.id || undefined}
          className="flex items-start gap-2"
          {...pointerProps(step, pointer)}
        >
          <CircleCheckIcon className="mt-[3px] shrink-0 text-[var(--sol-dim)]" />
          <div className="min-w-0 flex-1">
            <p className="m-0 text-[13px] leading-5 text-[var(--sol-muted)]">
              {step.title ?? step.body ?? t("step", { n: step.n })}
            </p>
            {step.command ? (
              <div className="mt-1">
                <CommandRow variant="compact" command={step.command} />
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="border-b border-[var(--sol-line)] px-3.5 py-3">
      {steps.length > 2 ? (
        <Disclosure
          summary={`${t("beforeYouStart")} (${steps.length})`}
          summaryClassName={signatureLabel}
        >
          {list}
        </Disclosure>
      ) : (
        <>
          <p className={cn(signatureLabel, "m-0")}>{t("beforeYouStart")}</p>
          {list}
        </>
      )}
    </div>
  );
}

/** "More you can do": optional steps, folded. */
function OptionalSteps({
  steps,
  pointer,
}: {
  steps: VisualStep[];
  pointer?: StepPointer;
}) {
  const t = useTranslations("docsAsk.visuals");
  return (
    <div className="border-t border-[var(--sol-line)] px-3.5 py-3">
      <Disclosure
        summary={`${t("moreYouCanDo")} (${steps.length})`}
        summaryClassName={signatureLabel}
      >
        <ul className="m-0 mt-3 list-none space-y-4 p-0">
          {steps.map((step) => (
            <li
              key={step.id}
              data-step={step.id}
              data-active={pointer?.activeId === step.id || undefined}
              {...pointerProps(step, pointer)}
            >
              <StepTitle step={step} pointer={pointer} />
              <StepDetails step={step} />
            </li>
          ))}
        </ul>
      </Disclosure>
    </div>
  );
}

/** Links of the model and flow that no step already shows. */
function footerLinks(flow: VisualStepFlow, extra: VisualLink[] = []) {
  const shown = new Set(
    [...flow.setup, ...flow.steps, ...flow.optional].flatMap((step) =>
      step.links.map((link) => link.href),
    ),
  );
  const links: VisualLink[] = [];
  for (const link of [...extra, ...flow.links]) {
    if (shown.has(link.href)) continue;
    shown.add(link.href);
    links.push(link);
  }
  return links;
}

function FlowBody({
  flow,
  links,
  pointer,
}: {
  flow: VisualStepFlow;
  links: VisualLink[];
  pointer?: StepPointer;
}) {
  const t = useTranslations("docsAsk.visuals");
  return (
    <>
      {flow.body ? (
        <p
          className={cn(
            bodyText,
            "m-0 border-b border-[var(--sol-line)] px-3.5 py-2.5 text-[13px] leading-[1.6]",
          )}
        >
          {flow.body}
        </p>
      ) : null}
      {flow.setup.length > 0 ? (
        <SetupChecklist steps={flow.setup} pointer={pointer} />
      ) : null}
      {flow.steps.length > 0 ? (
        <StepRail steps={flow.steps} pointer={pointer} />
      ) : null}
      {flow.optional.length > 0 ? (
        <OptionalSteps steps={flow.optional} pointer={pointer} />
      ) : null}
      <VisualLinks
        className="border-t border-[var(--sol-line)] px-3.5 py-2.5"
        label={t("docs")}
        links={links}
      />
    </>
  );
}

/** step_flow on its own. */
export function VisualStepFlowBlock({ flow }: { flow: VisualStepFlow }) {
  const t = useTranslations("docsAsk.visuals");
  return (
    <VisualFrame label={t("steps")} title={flow.title}>
      <FlowBody flow={flow} links={footerLinks(flow)} />
    </VisualFrame>
  );
}

/**
 * concept_model and step_flow together: the diagram on top, the steps
 * below. Pointing at a step (hover, focus, or a click on its title)
 * highlights the parts it touches, dims the rest and shows their fields as
 * that step leaves them.
 */
export function VisualModelFlowBlock({
  model,
  flow,
}: {
  model: VisualConceptModel;
  flow: VisualStepFlow;
}) {
  const t = useTranslations("docsAsk.visuals");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const activeId = hoveredId ?? focusedId ?? pinnedId;
  const focus = useMemo((): ModelFocus | null => {
    const step = [...flow.setup, ...flow.steps, ...flow.optional].find(
      (item) => item.id === activeId,
    );
    if (!step) return null;
    return {
      touches: step.touches,
      connects: step.connects,
      state: modelStateAtStep(model, flow, step.id),
    };
  }, [activeId, model, flow]);
  const pointer: StepPointer = {
    activeId,
    pinnedId,
    onEnter: setHoveredId,
    onLeave: () => setHoveredId(null),
    onFocus: setFocusedId,
    onBlur: (event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        setFocusedId(null);
      }
    },
    onToggle: (id) => setPinnedId((current) => (current === id ? null : id)),
  };
  return (
    <VisualFrame
      label={t("diagram")}
      title={flow.title ?? model.title ?? t("model")}
    >
      <ModelDiagram model={model} focus={focus} />
      <div className="border-t border-[var(--sol-line)]">
        <FlowBody
          flow={flow}
          links={footerLinks(flow, model.links)}
          pointer={pointer}
        />
      </div>
    </VisualFrame>
  );
}
