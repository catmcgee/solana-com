"use client";

import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { InkeepRequest } from "@solana-com/ui-chrome/inkeep-modal";
import { DOCS_SEARCH_OPEN_EVENT } from "@solana-com/ui-chrome/docs-search";
import { DOCS_ASK_CODE_EVENT } from "@/lib/docs/ask-ai";
import { takeSearchHandOff } from "@/lib/docs/search-hand-off";

// Inkeep's modal and @inkeep/cxkit-react, fetched on first open (and when
// the pointer or focus reaches the Ask AI pill, ask-ai.client.tsx).
const InkeepModal = lazy(() => import("@solana-com/ui-chrome/inkeep-modal"));

/** The longest code block sent as a question (the proxy allows 8,000). */
const MAX_CODE = 6000;

/**
 * Search and Ask AI with Inkeep (INKEEP_API_KEY set), as on solana.com
 * before the docs moved: mounted once on every apps/web page (SiteShell),
 * in place of the Fumadocs search dialog. Inkeep's modal and its package
 * load the first time something opens it:
 *
 * - search (search view): the docs header's field and search icon, the
 *   solana.com header's search, ⌘K / Ctrl+K (`openDocsSearch`), and the
 *   `?q=` / `?search=1` hand-off on arrival;
 * - Ask AI (chat view): the floating pill, Ctrl+/ and a code block's Ask
 *   button, which sends the code as the question (`openAskAi`).
 */
export default function InkeepSearchAndChat({
  onReady,
}: {
  /** Called once it listens (inkeep-mount.client.tsx replays then). */
  onReady?: () => void;
}) {
  const [request, setRequest] = useState<InkeepRequest>();
  const [open, setOpen] = useState(false);
  const opener = useRef<Element | null>(null);

  const show = useCallback((next: Omit<InkeepRequest, "seq">) => {
    opener.current = document.activeElement;
    setRequest((last) => ({ ...next, seq: (last?.seq ?? 0) + 1 }));
    setOpen(true);
  }, []);

  useEffect(() => {
    const onSearch = (event: Event) =>
      show({
        view: "search",
        query: (event as CustomEvent<{ query?: string }>).detail?.query,
      });
    const onAsk = (event: Event) => {
      const code = (event as CustomEvent<{ code?: string }>).detail?.code;
      show({
        view: "chat",
        message: code?.trim()
          ? `Explain this code from ${document.title}:\n\n\`\`\`\n${code.trim().slice(0, MAX_CODE)}\n\`\`\``
          : undefined,
      });
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "/" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        show({ view: "chat" });
      }
    };
    window.addEventListener(DOCS_SEARCH_OPEN_EVENT, onSearch);
    window.addEventListener(DOCS_ASK_CODE_EVENT, onAsk);
    window.addEventListener("keydown", onKeyDown);
    const handOff = takeSearchHandOff();
    if (handOff !== null) show({ view: "search", query: handOff });
    onReady?.();
    return () => {
      window.removeEventListener(DOCS_SEARCH_OPEN_EVENT, onSearch);
      window.removeEventListener(DOCS_ASK_CODE_EVENT, onAsk);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [show, onReady]);

  // Closing returns focus to what opened it, unless the reader moved it.
  const wasOpen = useRef(false);
  useEffect(() => {
    const closed = wasOpen.current && !open;
    wasOpen.current = open;
    if (!closed) return;
    // After the modal has unmounted and let go of focus.
    const timer = setTimeout(() => {
      const active = document.activeElement;
      if (!active || active === document.body)
        (opener.current as HTMLElement | null)?.focus?.({
          preventScroll: true,
        });
    }, 50);
    return () => clearTimeout(timer);
  }, [open]);

  if (!request) return null;
  return (
    <LoadFailed attempt={request.seq}>
      <Suspense fallback={open ? <Loading /> : null}>
        <InkeepModal request={request} open={open} onOpenChange={setOpen} />
      </Suspense>
    </LoadFailed>
  );
}

/** Shown while Inkeep's code loads (first open only). */
function Loading() {
  return (
    <div className="sol-inkeep-loading" role="status" aria-busy="true">
      <p>Loading…</p>
    </div>
  );
}

/**
 * If Inkeep's code cannot load (offline, or a new deployment replaced it),
 * say so, closably, instead of taking the page down; each new open
 * (`attempt`) shows the message again.
 */
class LoadFailed extends Component<
  { attempt: number; children: React.ReactNode },
  { failed: boolean; attempt: number; dismissed: boolean }
> {
  state = { failed: false, attempt: this.props.attempt, dismissed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  static getDerivedStateFromProps(
    props: { attempt: number },
    state: { attempt: number },
  ) {
    return props.attempt === state.attempt
      ? null
      : { attempt: props.attempt, dismissed: false };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    if (this.state.dismissed) return null;
    return (
      <div className="sol-inkeep-loading" role="alert">
        <p>
          {
            "Search and Ask AI couldn't load. Check your connection, or reload the page."
          }
        </p>
        <button
          type="button"
          onClick={() => this.setState({ dismissed: true })}
        >
          Close
        </button>
      </div>
    );
  }
}
