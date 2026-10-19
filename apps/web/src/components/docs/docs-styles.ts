/**
 * Stylesheets of the docs pages, imported once by docs-page.tsx (so only
 * docs routes load them): the docs chrome shared with /developers, the base
 * layout and content styles, then the feature stylesheets kept in
 * apps/docs/styles (theme tokens and overrides, path boxes, demos, ...), in
 * the order the docs have always applied them (Mintlify's inline order).
 */
import "@/app/[locale]/developers/docs-chrome.css";
import "./docs.css";
import "../../../../docs/styles/concepts.css";
import "../../../../docs/styles/nojs.css";
import "../../../../docs/styles/run.css";
import "../../../../docs/styles/stepper.css";
import "../../../../docs/styles/theme.css";
import "../../../../docs/styles/ask-ai.css";
import "../../../../docs/styles/diagrams.css";
import "../../../../docs/styles/paths-sidebar.css";
import "../../../../docs/styles/demo.css";
import "../../../../docs/styles/playground.css";
import "../../../../docs/styles/rpc-try-it.css";
import "../../../../docs/styles/video.css";
import "../../../../docs/styles/agent-banner.css";
