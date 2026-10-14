/**
 * Blocking inline script for light/dark landing pages (/developers, /learn).
 *
 * It sets `dark tw-dark` or `light tw-light` on <html> from localStorage.theme
 * or prefers-color-scheme before the landing markup below it is parsed, so the
 * page paints in the right theme without a flash. ThemeProvider
 * (@solana-com/ui-chrome) applies the same rule after hydration and owns the
 * toggle. Readers without JS get no class at all, and globals.css falls back
 * to prefers-color-scheme for them.
 *
 * Rendered from the page rather than [locale]/layout.tsx because the layout
 * cannot see the pathname; this keeps the script on theme routes only.
 */
export const THEME_PREPAINT_SCRIPT = `(function(){try{var d=document.documentElement,t=null;try{t=window.localStorage.getItem("theme")}catch(e){}if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}d.classList.remove("dark","tw-dark","light","tw-light");d.classList.add(t,"tw-"+t)}catch(e){}})();`;

export function ThemePrepaint() {
  return (
    <script
      // Static string, no user input.
      dangerouslySetInnerHTML={{ __html: THEME_PREPAINT_SCRIPT }}
      suppressHydrationWarning
    />
  );
}
