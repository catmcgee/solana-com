"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { languages } from "@workspace/i18n/config";
import { useTheme } from "./theme-provider";
import { usePathname } from "@workspace/i18n/routing";
import { Link } from "./link";
import { HeaderList } from "./header-list";
import { DevelopersNav } from "./developers-nav";
import { SearchBar } from "./search-bar";
import { LanguageSelector } from "./language-selector";
import { MobileMenu } from "./mobile-menu";
import { shouldShowDevelopersNav } from "./developer-routes";

import SolanaLogo from "./assets/logotype.inline.svg";
import Moon from "./assets/icons/moon.inline.svg";
import { DEVELOPERS_LINK, NEW_TAB_PROPS, NewTabMark } from "./developers-link";
import Sun from "./assets/icons/sun.inline.svg";

/** The header's top level as plain links, in the same order. */
const NOSCRIPT_LINKS = [
  { href: "/use-solana", labelKey: "nav.useSolana.title" },
  { href: "/enterprise", labelKey: "nav.enterprise.title" },
  { href: "/products", labelKey: "nav.products.title" },
  { href: "/ecosystem", labelKey: "nav.ecosystem.title" },
] as const;

function withLocale(locale: string, path: string) {
  if (locale === "en") return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

/**
 * Plain-link fallback for readers without JavaScript: the dropdown menus and
 * the language selector need JS, so this lists the header's top level (the
 * section pages, then Developers in a new tab, as in the header) and every
 * language for the current page. React renders <noscript> children only
 * in the server HTML, so JS users never see or hydrate it.
 */
function NoScriptNav({ pathname }: { pathname: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const linkClass = "text-white/80 underline-offset-4 hover:text-white";

  return (
    <noscript>
      <nav
        aria-label="Site"
        className="border-b border-white/10 bg-black px-4 py-2 text-sm sm:px-5 xl:px-6"
      >
        <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-1 p-0">
          {NOSCRIPT_LINKS.map((link) => (
            <li key={link.href}>
              <a href={withLocale(locale, link.href)} className={linkClass}>
                {t(link.labelKey)}
              </a>
            </li>
          ))}
          <li>
            <a
              href={withLocale(locale, DEVELOPERS_LINK.href)}
              className={linkClass}
              data-nav-item="developers"
              {...NEW_TAB_PROPS}
            >
              {t(DEVELOPERS_LINK.titleKey)}
              <NewTabMark text={t(DEVELOPERS_LINK.newTabKey)} />
            </a>
          </li>
        </ul>
        <ul
          aria-label="Languages"
          className="m-0 mt-1 flex list-none flex-wrap gap-x-3 gap-y-1 p-0 text-xs"
        >
          {Object.entries(languages).map(([code, name]) => (
            <li key={code}>
              <a
                href={withLocale(code, pathname || "/")}
                hrefLang={code}
                lang={code}
                aria-current={code === locale ? "true" : undefined}
                className={linkClass}
              >
                {name}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </noscript>
  );
}

function Header({
  className = "",
  containerClassName = "",
  showLanguage = true,
  showDevelopersNav = true,
}) {
  const pathname = usePathname();
  const { theme, toggleTheme, isThemePage } = useTheme();
  const t = useTranslations();
  const [expanded, setExpanded] = useState(false);
  const showSecondaryDevelopersNav = shouldShowDevelopersNav(pathname);

  return (
    <>
      <header className={`sticky top-0 z-50 ${className}`}>
        <nav
          id="navbar"
          className="h-14 border-b border-white/10 bg-black/80 backdrop-blur-xl backdrop-saturate-150"
        >
          <div
            className={`mx-auto flex h-full w-full max-w-[1440px] items-center justify-between gap-x-4 px-4 sm:px-5 xl:gap-x-8 xl:px-6 ${containerClassName}`}
          >
            <Link
              to="/"
              className="flex h-11 shrink-0 grow-0 items-center !text-white"
              aria-label="Solana"
            >
              <SolanaLogo
                style={{ color: "currentColor" }}
                width={120}
                height={18}
                viewBox="0 0 149 22"
                className="block h-auto w-28 xl:w-[120px]"
              />
            </Link>

            <div className="ml-auto flex items-center gap-1 md:gap-2 xl:grow">
              {/* Desktop Menu */}
              <div className="hidden xl:block flex-1">
                <HeaderList />
              </div>

              {/* Desktop Search and Language */}
              <div className="flex items-center gap-3">
                <SearchBar />
                {showLanguage && (
                  <div className="relative items-center hidden xl:flex">
                    <LanguageSelector />
                  </div>
                )}
              </div>

              {/* Mobile Menu */}
              <MobileMenu
                expanded={expanded}
                setExpanded={setExpanded}
                showLanguage={showLanguage}
              />

              {/* Theme Toggle */}
              {isThemePage && (
                <button
                  className="ml-1 flex size-11 items-center justify-center border-none text-white transition-transform duration-300 ease-in-out hover:rotate-[15deg] md:size-9"
                  onClick={toggleTheme}
                  aria-label={t("commands.toggle")}
                >
                  {theme === "light" && <Moon />}
                  {theme === "dark" && <Sun />}
                </button>
              )}
            </div>
          </div>
        </nav>
        <NoScriptNav pathname={pathname} />
      </header>
      {/* Secondary nav for docs-owned developer routes. */}
      {showDevelopersNav && showSecondaryDevelopersNav && (
        <DevelopersNav containerClassName={containerClassName} />
      )}
    </>
  );
}

export { Header };
