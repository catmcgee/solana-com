"use client";

import { DialogTitle } from "@radix-ui/react-dialog";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { cn } from "@/app/components/utils";
import { askStore } from "@/lib/docs/ask/store";
import { useAskSelector } from "@/lib/docs/ask/use-ask";
import { Maximize2Icon, Minimize2Icon, XIcon } from "../docs-ui-icons";
import { focusRing, headerHover, headerIconButton } from "./ui";

function HeaderButton({
  label,
  onClick,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(headerIconButton, focusRing, className)}
    >
      {children}
    </button>
  );
}

/**
 * The panel's title row: "Ask AI", then New chat (a labelled text button,
 * once there is a conversation), Expand / Exit full screen and Close. No
 * icon or badge beside the title. Header, thread and composer share one
 * 16px gutter; in full screen the row sits on the reading column's edges.
 * In a dialog (overlay, full screen) the title labels it.
 */
export function AskHeader({
  fullscreen,
  dialog,
}: {
  fullscreen: boolean;
  dialog: boolean;
}) {
  const t = useTranslations("docsAsk");
  const tc = useTranslations("commands");
  const empty = useAskSelector((s) => s.messages.length === 0 && !s.busy);
  const titleClass =
    "m-0 text-[14px] font-medium leading-5 tracking-normal text-[var(--sol-text)]";
  return (
    <div className="shrink-0 border-b border-[var(--sol-line)]">
      <div
        className={cn(
          "flex h-12 items-center justify-between gap-2",
          fullscreen ? "mx-auto w-full max-w-[46rem] px-6" : "px-4",
        )}
      >
        {dialog ? (
          <DialogTitle className={titleClass}>{t("panelLabel")}</DialogTitle>
        ) : (
          <h2 className={titleClass}>{t("panelLabel")}</h2>
        )}
        {/* -me-1.5 lines the Close glyph up with the content's end edge. */}
        <div className="-me-1.5 flex items-center gap-0.5">
          {empty ? null : (
            <button
              type="button"
              onClick={() => askStore.reset()}
              className={cn(
                "me-1 h-7 rounded-lg px-2 text-[13px] leading-5 text-[var(--sol-muted)] transition-colors duration-150 motion-reduce:transition-none",
                headerHover,
                focusRing,
              )}
            >
              {t("newChat")}
            </button>
          )}
          {/* A phone sheet is already full screen; full screen keeps its
              way back at every width. */}
          <HeaderButton
            label={fullscreen ? t("collapse") : t("expand")}
            onClick={() => askStore.setFullscreen(!fullscreen)}
            className={fullscreen ? undefined : "max-sm:hidden"}
          >
            {fullscreen ? <Minimize2Icon /> : <Maximize2Icon />}
          </HeaderButton>
          <HeaderButton label={tc("close")} onClick={() => askStore.close()}>
            <XIcon />
          </HeaderButton>
        </div>
      </div>
    </div>
  );
}
