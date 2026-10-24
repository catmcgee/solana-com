"use client";

import { DialogTitle } from "@radix-ui/react-dialog";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { cn } from "@/app/components/utils";
import { askStore } from "@/lib/docs/ask/store";
import { useAskSelector } from "@/lib/docs/ask/use-ask";
import {
  Maximize2Icon,
  Minimize2Icon,
  SquarePenIcon,
  XIcon,
} from "../docs-ui-icons";
import { focusRing, headerIconButton } from "./ui";

function HeaderButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(headerIconButton, focusRing)}
    >
      {children}
    </button>
  );
}

/**
 * The panel's title row: "Ask AI", then New chat, Expand / Exit full
 * screen and Close. No icon or badge beside the title. In a dialog
 * (overlay, full screen) the title labels it.
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
  const empty = useAskSelector(
    (s) => s.messages.length === 0 && s.pageContext === null && !s.busy,
  );
  const titleClass =
    "m-0 ps-1 text-[14px] font-medium leading-5 tracking-normal text-[var(--sol-text)]";
  return (
    <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-[var(--sol-line)] px-3">
      {dialog ? (
        <DialogTitle className={titleClass}>{t("panelLabel")}</DialogTitle>
      ) : (
        <h2 className={titleClass}>{t("panelLabel")}</h2>
      )}
      <div className="flex items-center gap-0.5">
        <HeaderButton
          label={t("newChat")}
          disabled={empty}
          onClick={() => askStore.reset()}
        >
          <SquarePenIcon />
        </HeaderButton>
        <HeaderButton
          label={fullscreen ? t("collapse") : t("expand")}
          onClick={() => askStore.setFullscreen(!fullscreen)}
        >
          {fullscreen ? <Minimize2Icon /> : <Maximize2Icon />}
        </HeaderButton>
        <HeaderButton label={tc("close")} onClick={() => askStore.close()}>
          <XIcon />
        </HeaderButton>
      </div>
    </div>
  );
}
