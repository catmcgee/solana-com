import { Metadata } from "next";
import type { AbstractIntlMessages } from "next-intl";
import { getBaseMetadata } from "@@/src/app/metadata";
import { locales, staticLocales } from "@workspace/i18n/config";
import { loadMergedMessages } from "@workspace/i18n/messages";
import { notFound } from "next/navigation";
// Only the Tailwind classes these pages use (not the site's globals.css).
import "@/app/docs-globals.css";
import { SiteShell } from "@/components/site-shell";
import { InkeepChatButton } from "@solana-com/ui-chrome/inkeep-chat-button";
import { DocsInkeep } from "@/components/docs/inkeep.client";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

/**
 * Root layout of the /developers landing and the docs (/developers/docs,
 * /developers/cookbook, /learn/<article>). They wear the docs header and
 * footer, so the site Header and Footer are left out, and the client gets
 * only the messages its components read (cookie banner, landing calculator,
 * newsletter form, and Ask AI), not the whole site's.
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
    developers: {
      landing: { calc: landing.calc, newsletter: landing.newsletter },
    },
  };
  return (
    <SiteShell locale={locale} messages={clientMessages}>
      {children}
      {/* Above the docs' sticky table of contents (z-index 21). */}
      <InkeepChatButton className="z-40" />
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
