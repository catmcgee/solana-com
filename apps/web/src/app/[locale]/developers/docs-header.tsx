import { languages } from "@workspace/i18n/config";
import { getTranslations } from "@workspace/i18n/server";
import {
  DOCS_SEARCH_PROMPT,
  DOCS_TAB_DIVIDER_AFTER,
  docsSearchHref,
  getDocsTabs,
  type DocsTab,
} from "@/data/developers/docs-nav";
import { localizedHref } from "@/data/developers/hub";
import {
  DocsSearchField,
  HeaderMenus,
  ThemeToggle,
} from "./docs-header.client";
import {
  ChevronDownIcon,
  MenuIcon,
  SearchIcon,
  SolanaLogo,
  TabIcon,
} from "./docs-icons";

/**
 * The docs (Mintlify) header, rebuilt for the /developers landing so moving
 * between /developers and /developers/docs feels like one site. It matches
 * apps/docs/styles/theme.css sections 4-5b at every breakpoint (styles in
 * developers.css, "Docs header"):
 * - >= 1280px: one 4rem row: logo | tabs ... Video tutorials | search,
 *   theme, language. 1280-1439px: the search is an icon button.
 * - 1024-1279px: a 4rem row (logo, search, theme, language) over a 3rem tab
 *   row with icons.
 * - < 1024px: logo and search icon, then a menu row that opens the tabs, the
 *   theme switch and the languages.
 * The logo is the home link (/developers); no tab is active here. Tabs and
 * labels come from the docs navigation (data/developers/docs-nav.ts) and
 * open in the same tab. Works without JavaScript (see docs-header.client.tsx).
 */

const HEADER_ID = "dh";

function languageHref(code: string) {
  return code === "en" ? "/developers" : `/${code}/developers`;
}

function LanguageMenu({
  locale,
  label,
  className = "dh-lang",
}: {
  locale: string;
  label: string;
  className?: string;
}) {
  const current = languages[locale as keyof typeof languages] ?? locale;
  return (
    <details className={className}>
      <summary aria-label={`${label}: ${current}`}>
        <span>{current}</span>
        <ChevronDownIcon />
      </summary>
      <ul className="dh-lang-list" aria-label={label}>
        {Object.entries(languages).map(([code, name]) => (
          <li key={code}>
            <a
              href={languageHref(code)}
              hrefLang={code}
              lang={code}
              aria-current={code === locale ? "true" : undefined}
            >
              {name}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}

function Tabs({ tabs, label }: { tabs: DocsTab[]; label: string }) {
  return (
    <nav className="dh-tabs" aria-label={label}>
      <ul>
        {tabs.map((tab, index) => (
          <li
            key={tab.key}
            className={[
              index === DOCS_TAB_DIVIDER_AFTER ? "dh-divider" : "",
              tab.alignEnd ? "dh-end" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <a href={tab.href} className="dh-tab" data-tab={tab.key}>
              <TabIcon icon={tab.icon} />
              <span>{tab.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export async function DocsHeader({ locale }: { locale: string }) {
  const t = await getTranslations({
    locale,
    namespace: "developers.landing.header",
  });
  const tabs = getDocsTabs(locale);
  const docsRoot = localizedHref(locale, "/developers/docs");
  const toggle = { toDark: t("toDark"), toLight: t("toLight") };

  return (
    <header id={HEADER_ID} className="dh" data-docs-header="">
      <a href="#dl-main" className="dh-skip">
        {t("skip")}
      </a>
      <div className="dh-bar">
        <a
          href={localizedHref(locale, "/developers")}
          className="dh-logo"
          aria-label={t("home")}
        >
          <SolanaLogo gradientId="dh-logo-g" developers />
        </a>
        <Tabs tabs={tabs} label={t("sections")} />
        <div className="dh-tools">
          <DocsSearchField action={docsRoot} prompt={DOCS_SEARCH_PROMPT} />
          <a
            href={docsSearchHref(locale)}
            className="dh-search-icon"
            aria-label={DOCS_SEARCH_PROMPT}
          >
            <SearchIcon />
          </a>
          <ThemeToggle {...toggle} />
          <LanguageMenu locale={locale} label={t("language")} />
        </div>
      </div>
      <details className="dh-mobile">
        <summary aria-label={t("menu")}>
          <MenuIcon />
          <span>{t("current")}</span>
        </summary>
        <div className="dh-mobile-panel">
          <Tabs tabs={tabs} label={t("sections")} />
          <div className="dh-mobile-tools">
            <LanguageMenu
              locale={locale}
              label={t("language")}
              className="dh-lang dh-lang-mobile"
            />
            <ThemeToggle {...toggle} className="dh-theme dh-theme-mobile" />
          </div>
        </div>
      </details>
      <HeaderMenus rootId={HEADER_ID} />
    </header>
  );
}
