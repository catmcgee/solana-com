"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useState,
  type ComponentType,
  type RefObject,
} from "react";
import type { InkeepModalSearchProps } from "@inkeep/cxkit-react";
import { useInkeepConfig } from "@solana-com/ui-chrome/inkeep-config";
import { openAskAi } from "@/lib/docs/ask-ai";
import {
  DOCS_SEARCH_OPEN_EVENT,
  takeSearchHandOff,
} from "@/lib/docs/search-hand-off";

/** What Inkeep's search passes when the reader picks "Ask AI". */
type ToggleView = { view: "search" | "chat"; query?: string };

/**
 * cxkit's modal search spreads extra props into its search view, which
 * shows the "Ask AI" toggle and card when it gets `onToggleView`; the
 * modal's types leave that prop out, hence the cast.
 */
type SearchModalProps = InkeepModalSearchProps & {
  onToggleView?: (toggle: ToggleView) => void;
};

const InkeepModalSearch = dynamic(
  () =>
    import("@inkeep/cxkit-react").then(
      (mod) => mod.InkeepModalSearch as ComponentType<SearchModalProps>,
    ),
  {
    ssr: false,
  },
);

/**
 * The docs search: Inkeep's search modal, opened by the docs header's
 * search field (`openDocsSearch`, with what was typed, and `?q=` on
 * arrival). Its "Ask AI" toggle and card hand the query to the docs' own
 * Ask AI panel (components/docs/ask), which sends it; Inkeep's chat is not
 * used.
 */
export function DocsInkeep() {
  const config = useInkeepConfig();
  const { isOpen, onOpenChange } = config.modalSettings;
  const [query, setQuery] = useState("");

  useEffect(() => {
    const search = (text = "") => {
      setQuery(text);
      onOpenChange(true);
    };
    const onSearch = (event: Event) =>
      search((event as CustomEvent<{ query?: string }>).detail?.query);
    window.addEventListener(DOCS_SEARCH_OPEN_EVENT, onSearch);
    const handOff = takeSearchHandOff();
    if (handOff !== null) search(handOff);
    return () => window.removeEventListener(DOCS_SEARCH_OPEN_EVENT, onSearch);
  }, [onOpenChange]);

  const onToggleView = useCallback(
    ({ view, query: asked }: ToggleView) => {
      if (view !== "chat") return;
      onOpenChange(false);
      openAskAi({ question: asked?.trim() || undefined });
    },
    [onOpenChange],
  );

  // defaultQuery only applies when the search first mounts, so hand later
  // queries over once it is ready, as ui-chrome's config does for ?search=.
  const searchFunctions = config.searchSettings
    .searchFunctionsRef as RefObject<{
    updateQuery: (query: string) => void;
    focusInput: () => void;
  } | null>;
  useEffect(() => {
    if (!isOpen || !query) return;
    let frame = 0;
    let tries = 0;
    const apply = () => {
      const search = searchFunctions.current;
      if (search) {
        search.updateQuery(query);
        search.focusInput();
      } else if (++tries < 120) {
        frame = requestAnimationFrame(apply);
      }
    };
    apply();
    return () => cancelAnimationFrame(frame);
  }, [isOpen, query, searchFunctions]);

  return (
    <InkeepModalSearch
      baseSettings={config.baseSettings}
      searchSettings={{ ...config.searchSettings, defaultQuery: query }}
      modalSettings={{ isOpen, onOpenChange, shortcutKey: null }}
      onToggleView={onToggleView}
    />
  );
}
