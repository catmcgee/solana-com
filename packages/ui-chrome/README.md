# @solana-com/ui-chrome

Shared UI chrome for the Solana.com monorepo: Header, Footer, ThemeProvider,
site-wide alerts, the header search, Link with cross-app navigation, and
supporting components.

## Installation

This package is part of the monorepo workspace. Apps depend on it via the
workspace and import from the main entry or subpaths:

```ts
// Main entry – chrome components and config
import {
  Header,
  Footer,
  ThemeProvider,
  SitewideTopAlert,
  SearchBar,
  NewsletterModal,
  DocsSidebarToggleIcon,
  DOCS_SIDEBAR_TOGGLE_SLOT_ID,
  LanguageSelector,
  sitewideTopAlertConfig,
} from "@solana-com/ui-chrome";
import type { SitewideTopAlertConfig } from "@solana-com/ui-chrome";

// Subpath – Link and InlineLink (cross-app aware)
import { Link, InlineLink } from "@solana-com/ui-chrome/link";

// Subpath – URL routing helper for cross-app links
import { shouldUseNextLink } from "@solana-com/ui-chrome/url-config";
```

## Components

### Header

Main site navigation header.

### Footer

Site footer with links and branding.

### ThemeProvider

Provides dark/light theme context to the app.

### SitewideTopAlert

Announcement banner at the top of the page. Configurable via
`sitewideTopAlertConfig` (see [Site-Wide Alerts](#site-wide-alerts)).

### SearchBar

The header's search button for the site search (Inkeep with `INKEEP_API_KEY`,
else Fumadocs, in `apps/web`). In `apps/web`, which mounts the search on every
page, a click or `⌘ K` / `Ctrl+K` opens it in place. In the other apps
(`NEXT_PUBLIC_APP_NAME` set) it goes to `/developers/docs?search=1` (localized),
where the docs page opens the dialog. It shows the `⌘ K` shortcut on larger
viewports; the optional `expanded` prop adds a visible label and full-width
styling.

### NewsletterModal

Modal for newsletter sign-up (e.g. Iterable). Props: `formId`,
`analyticsAppName`, and `children` (trigger). `analyticsAppName` is required so
a successful subscription can be attributed consistently; use one of `web`,
`docs`, `media`, `templates`, `accelerate`, or `breakpoint`.

### DocsSidebarToggleIcon / DOCS_SIDEBAR_TOGGLE_SLOT_ID

Icon component and slot ID for the docs sidebar toggle. Used by the docs app to
portal the toggle into the header.

### LanguageSelector

Dropdown for switching locale (uses `@workspace/i18n` and next-intl).

## Subpath exports

### `@solana-com/ui-chrome/link`

- **Link** – Anchor that uses Next.js `Link` for in-app routes and `<a>` for
  cross-app routes (based on `url-config`). Supports `to`/`href`,
  `activeClassName`, `partiallyActive`, `partiallyActiveIgnore`, `scroll`,
  `prefetch`, and standard anchor props.
- **InlineLink** – Simple external-style link (e.g. `target="_blank"`,
  `rel="noopener noreferrer"`). Props: `to`, `children`, plus anchor props.

Apps often re-export these from their own `utils/Link` (e.g. `apps/web`,
`apps/docs`).

### `@solana-com/ui-chrome/docs-search`

- **openDocsSearch(query?)** / **DOCS_SEARCH_OPEN_EVENT** – Open the docs search
  dialog on the current page (the window event the dialog listens for).

### `@solana-com/ui-chrome/inkeep-modal` and `/inkeep-proxy`

See [Inkeep (search and chat)](#inkeep-search-and-chat).

### `@solana-com/ui-chrome/url-config`

- **shouldUseNextLink(href)** – Returns whether `href` should use Next.js `Link`
  (client navigation) or a plain `<a>` (full page load). All apps are served
  under solana.com via rewrites; this keeps cross-app navigation as full loads
  and in-app as client nav. Depends on `NEXT_PUBLIC_APP_NAME` in non-web apps.

## Inkeep (search and chat)

Inkeep is wired in `src/inkeep-config.ts` (as on production solana.com) and used
by `inkeep-modal` (default export): Inkeep's search and chat modal, opened by
the caller. In `apps/web`, `components/docs/inkeep.client.tsx` mounts it on
every page the first time search or Ask AI opens (it is the module that brings
in `@inkeep/cxkit-react`). The modal is themed for Solana (dark/light).

- **Env**: Set the server-only `INKEEP_API_KEY` on the web deployment. Never use
  a `NEXT_PUBLIC_` Inkeep credential. Without it, `apps/web` uses the Fumadocs
  search dialog and the docs' Ask AI menu instead.
- **Internal APIs**: CXKit sends challenge, chat, search, and analytics requests
  to `/api/inkeep/*` (`proxyInkeepRequest` from `inkeep-proxy`). The routes
  validate requests and authenticate to Inkeep on the server. The current
  domain-restricted web credential requires CXKit to solve Inkeep's challenge
  before each chat request. Conversation analytics are write-only; the public
  proxy does not expose conversation reads.
- **Rate limits**: Configure Vercel WAF rate-limit rules named `inkeep-chat` (30
  requests/minute/IP), `inkeep-search` (120 requests/minute/IP), and
  `inkeep-analytics` (240 requests/minute/IP). Production builds (Vercel
  previews included) fail closed when a rule is missing or the rate-limit
  service fails.
- **Verification**: Confirm chat streams an answer with working citations,
  search returns source links, a code block's Ask button sends its code, and
  browser network requests contain only the non-secret internal proxy
  identifier.

## Site-Wide Alerts

`SitewideTopAlert` shows a gradient banner at the top of the page for
announcements (e.g. conferences, launches).

### Enabling an alert

Edit `packages/ui-chrome/src/sitewide-top-alert-config.ts`:

```ts
export const sitewideTopAlertConfig: SitewideTopAlertConfig = {
  enabled: true,
  text: "Join us at Breakpoint 2025!",
  cta: {
    label: "Get Tickets",
    url: "/breakpoint",
  },
  color: "green", // or "purple"
  excludedPaths: ["/breakpoint/app"],
};
```

### Configuration options

| Option          | Type                  | Description                                                          |
| --------------- | --------------------- | -------------------------------------------------------------------- |
| `enabled`       | `boolean`             | Set to `true` to display the alert site-wide                         |
| `text`          | `string`              | Main announcement message                                            |
| `cta.label`     | `string`              | Call-to-action button text                                           |
| `cta.url`       | `string`              | URL the CTA links to (pages matching this URL do not show the alert) |
| `color`         | `"green" \| "purple"` | Theme: green = Solana gradient, purple = alt gradient                |
| `excludedPaths` | `string[]`            | Extra paths where the alert is hidden                                |

### Color themes

- **green**: Gradient teal (#00d18c) → green (#14f195) → purple (#9945ff), black
  text.
- **purple**: Gradient purple (#9945ff) → green (#14f195), white text.

### Behavior

- Alert is hidden on the CTA URL and on any `excludedPaths`.
- Slide-down animation on load.

### Disabling the alert

Set `enabled: false` in the config file.

## Usage in apps

The alert is integrated in the root layouts of:

- `apps/web`
- `apps/docs`

Example layout with chrome and alert:

```tsx
import {
  Header,
  Footer,
  ThemeProvider,
  SitewideTopAlert,
} from "@solana-com/ui-chrome";

export default function RootLayout({ children }) {
  return (
    <ThemeProvider>
      <SitewideTopAlert />
      <Header />
      {children}
      <Footer />
    </ThemeProvider>
  );
}
```

## Dependencies

- **Peer**: `@workspace/i18n`, `next`, `next-intl`, `react`, `react-dom`
