import { Metadata } from "next";
import { getBaseMetadata } from "@@/src/app/metadata";
import { locales, staticLocales } from "@workspace/i18n/config";
import { loadMergedMessages } from "@workspace/i18n/messages";
import { notFound } from "next/navigation";
import { Header, Footer, InkeepChatButton } from "@solana-com/ui-chrome";
import { ChromeWrapper } from "@/components/ChromeWrapper";
import "@/app/globals.css";
import { SiteShell } from "@/components/site-shell";
import { PostHogProvider } from "@@/src/app/components/posthog/PostHogProvider";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function RootLayout({ children, params }: Props) {
  const { locale = "en" } = await params;

  if (!locales.includes(locale)) {
    notFound();
  }

  const messages = await loadMergedMessages({ app: "web", locale });
  return (
    <SiteShell
      locale={locale}
      messages={messages}
      header={
        <ChromeWrapper>
          <Header />
        </ChromeWrapper>
      }
      footer={
        <ChromeWrapper>
          <Footer />
        </ChromeWrapper>
      }
    >
      <PostHogProvider>{children}</PostHogProvider>
      <InkeepChatButton />
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
