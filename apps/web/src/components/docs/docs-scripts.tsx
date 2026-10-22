import Script from "next/script";

/**
 * Behaviour the docs content still gets from the plain scripts in apps/docs
 * (copied to /docs-scripts/ at build, scripts/copy-docs-static.mjs) until
 * they become React components: the Ask AI pill, the RPC "Try it" panel,
 * Run buttons for recorded output, Playground links, in-page video playback
 * and the agent banner's Copy button. Each script delegates from `document`
 * and survives client-side navigation. The search hand-off, the theme
 * toggle and the logo link are React now (docs-header, docs-search).
 */
const SCRIPTS = [
  "ask-ai",
  "rpc-try-it",
  "run-examples",
  "playground",
  "video-chapters",
  "agent-banner",
] as const;

/**
 * Run output stays folded from the first paint, as before (the runner,
 * run-examples.js, sets the same flag once it loads). Render before the
 * content.
 */
export function DocsRunFlag() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `document.documentElement.setAttribute("data-sol-run","")`,
      }}
      suppressHydrationWarning
    />
  );
}

export function DocsScripts() {
  return (
    <>
      {SCRIPTS.map((name) => (
        <Script
          key={name}
          id={`docs-script-${name}`}
          src={`/docs-scripts/${name}.js`}
          strategy="afterInteractive"
        />
      ))}
      <script
        type="speculationrules"
        // Prerender /developers on logo hover.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            prerender: [
              {
                source: "document",
                where: { selector_matches: ".dh-logo" },
                eagerness: "moderate",
              },
            ],
          }),
        }}
        suppressHydrationWarning
      />
    </>
  );
}
