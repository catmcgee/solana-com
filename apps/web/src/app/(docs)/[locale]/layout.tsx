import { Metadata } from "next";
import type { AbstractIntlMessages } from "next-intl";
import { getBaseMetadata } from "@@/src/app/metadata";
import { locales, staticLocales } from "@workspace/i18n/config";
import { loadMergedMessages } from "@workspace/i18n/messages";
import { notFound } from "next/navigation";
// Only the Tailwind classes these pages use (not the site's globals.css).
import "@/app/docs-globals.css";
import { SiteShell } from "@/components/site-shell";
import { AskAi } from "@/components/docs/ask/ask-ai.client";
import { DocsInkeep } from "@/components/docs/inkeep.client";
import { DOCS_ASK_PREPAINT_SCRIPT } from "@/lib/docs/ask/config";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

/**
 * Root layout of the /developers landing and the docs (/developers/docs,
 * /developers/cookbook, /learn/<article>). They wear the docs header and
 * footer, so the site Header and Footer are left out, and the client gets
 * only the messages its components read (cookie banner, landing calculator,
 * newsletter form, and Ask AI), not the whole site's. Ask AI (the launcher
 * and its panel) lives here, so a conversation survives moving between
 * docs pages; Inkeep is the docs search.
 */
export default async function DocsRootLayout({ children, params }: Props) {
  const { locale = "en" } = await params;

  if (!locales.includes(locale)) {
    notFound();
  }

  const messages = await loadMergedMessages({ app: "web", locale });
  const landing = (messages.developers as AbstractIntlMessages)
    .landing as AbstractIntlMessages;
  const clientMessages: AbstractIntlMessages = {
    "cookie-consent": messages["cookie-consent"],
    commands: messages.commands,
    docsAsk: messages.docsAsk,
    developers: {
      landing: { calc: landing.calc, newsletter: landing.newsletter },
    },
  };
  return (
    <SiteShell locale={locale} messages={clientMessages}>
      {/* Before the page: a panel left docked keeps its room from the
          first paint. */}
      <script
        // Static string, no user input.
        dangerouslySetInnerHTML={{ __html: DOCS_ASK_PREPAINT_SCRIPT }}
        suppressHydrationWarning
      />
      {children}
      <AskAi />
      <DocsInkeep />
    </SiteShell>
  );
}

export async function generateStaticParams() {
  return staticLocales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return getBaseMetadata(locale);
}
