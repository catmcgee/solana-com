/**
 * Blocking inline scripts that set the theme class on <html> before the
 * landing markup below them is parsed, so the page paints without a flash.
 * ThemeProvider (@solana-com/ui-chrome) applies the same rule after hydration.
 *
 * - `ThemePrepaint` (light/dark landings, /learn): sets `dark tw-dark` or
 *   `light tw-light` from localStorage.theme or prefers-color-scheme.
 *   ThemeProvider owns the toggle. Readers without JS get no class, and
 *   globals.css falls back to prefers-color-scheme for them.
 * - `DarkPrepaint` (/developers, dark only): always sets `dark tw-dark` and
 *   leaves localStorage.theme alone, so the reader's choice still applies on
 *   /learn and the docs. Without JS, globals.css keeps
 *   [data-dev-landing="dark"] dark whatever the preference.
 *
 * Rendered from the page rather than [locale]/layout.tsx because the layout
 * cannot see the pathname; this keeps each script on its own routes.
 */
export const THEME_PREPAINT_SCRIPT = `(function(){try{var d=document.documentElement,t=null;try{t=window.localStorage.getItem("theme")}catch(e){}if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}d.classList.remove("dark","tw-dark","light","tw-light");d.classList.add(t,"tw-"+t)}catch(e){}})();`;

export const DARK_PREPAINT_SCRIPT = `(function(){try{var d=document.documentElement;d.classList.remove("light","tw-light");d.classList.add("dark","tw-dark")}catch(e){}})();`;

function InlineScript({ source }: { source: string }) {
  return (
    <script
      // Static string, no user input.
      dangerouslySetInnerHTML={{ __html: source }}
      suppressHydrationWarning
    />
  );
}

export function ThemePrepaint() {
  return <InlineScript source={THEME_PREPAINT_SCRIPT} />;
}

export function DarkPrepaint() {
  return <InlineScript source={DARK_PREPAINT_SCRIPT} />;
}
