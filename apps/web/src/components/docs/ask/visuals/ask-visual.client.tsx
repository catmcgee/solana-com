"use client";

import { useMemo, type ReactNode } from "react";
import {
  introRepeatsSummary,
  normalizeAskVisual,
} from "@/lib/docs/ask/generative-ui/schema";
import type { AskGenerativeUi } from "@/lib/docs/ask/generative-ui/types";
import { VisualCalloutBlock } from "./callout.client";
import { VisualCommandListBlock } from "./command-list.client";
import { VisualConceptModelBlock } from "./concept-model.client";
import { VisualIntroBlock } from "./intro";
import { VisualModelFlowBlock, VisualStepFlowBlock } from "./step-flow.client";

/**
 * The visual the agent attached to an answer (`ui_done`), drawn in the
 * docs' own style, in the order the agent sent its blocks. A concept model
 * and a step flow merge into one diagram whose steps highlight the parts
 * they touch. The root is a container query box, so the layout follows the
 * panel's width (docked or full screen), not the viewport's.
 *
 * `summary` is the answer's summary text: an intro that only repeats it is
 * left out. While `streaming`, the intro waits for the final summary so it
 * doesn't appear and then vanish.
 */
export function AskVisual({
  ui,
  streaming = false,
  summary,
}: {
  ui: AskGenerativeUi;
  streaming?: boolean;
  summary?: string;
}) {
  const visual = useMemo(() => normalizeAskVisual(ui), [ui]);
  const { intro, model, flow } = visual;
  const showIntro =
    !!intro && !streaming && !(summary && introRepeatsSummary(intro, summary));

  const blocks: ReactNode[] = [];
  let drewModelFlow = false;
  for (const block of visual.order) {
    if (block.type === "intro") {
      if (intro && showIntro) {
        blocks.push(<VisualIntroBlock key="intro" intro={intro} />);
      }
    } else if (block.type === "callout") {
      blocks.push(
        <VisualCalloutBlock
          key={`callout-${block.index}`}
          callout={visual.callouts[block.index]!}
        />,
      );
    } else if (block.type === "commands") {
      blocks.push(
        <VisualCommandListBlock
          key={`commands-${block.index}`}
          list={visual.commandLists[block.index]!}
        />,
      );
    } else if (model && flow) {
      if (!drewModelFlow) {
        drewModelFlow = true;
        blocks.push(
          <VisualModelFlowBlock key="model-flow" model={model} flow={flow} />,
        );
      }
    } else if (model) {
      blocks.push(<VisualConceptModelBlock key="model" model={model} />);
    } else if (flow) {
      blocks.push(<VisualStepFlowBlock key="flow" flow={flow} />);
    }
  }
  if (blocks.length === 0) return null;
  return (
    <div data-ask-visual="" className="@container my-4 first:mt-0 last:mb-0">
      {blocks}
    </div>
  );
}
