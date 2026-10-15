import { ArrowDown } from "@boxicons/react/ArrowDown";
import { ArrowRight } from "@boxicons/react/ArrowRight";
import { ArrowUpRight } from "@boxicons/react/ArrowUpRight";
import { BookOpen } from "@boxicons/react/BookOpen";
import { CodeAlt } from "@boxicons/react/CodeAlt";
import { CreditCard } from "@boxicons/react/CreditCard";
import { Layers } from "@boxicons/react/Layers";
import { Package } from "@boxicons/react/Package";
import { School } from "@boxicons/react/School";
import { Server } from "@boxicons/react/Server";
import { Fragment, type ComponentType, type ReactNode } from "react";
import { getTranslations } from "@workspace/i18n/server";
import { isDocsHref } from "@solana-com/ui-chrome/url-config";
import {
  AGENT_SETUP,
  COST_MODEL,
  DEVELOPER_NEWSLETTER_FORM_ID,
  HERO_LINKS,
  HUB_STATS,
  JOB_PATHS,
  LEARN_ROUTES,
  MORE_USE_CASES,
  PRODUCTION_USERS,
  WHY_REASONS,
  computeCosts,
  formatAsOf,
  formatInteger,
  formatStatValue,
  formatUsd,
  localizedHref,
  type JobPathId,
  type LearnRouteId,
} from "@/data/developers/hub";
import type { DeveloperUpdate } from "@/lib/developer-media";
import { CostCalculator } from "./cost-calculator.client";
import { CopyButton } from "./copy-button.client";
import { NewsletterForm } from "./newsletter-form.client";

/** Docs links always open in a new tab. */
const newTab = (to: string) =>
  isDocsHref(to) ? { target: "_blank", rel: "noopener noreferrer" } : {};

type IconComponent = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean;
}>;

const container = "mx-auto w-full max-w-[1200px] px-5 md:px-8";
const focus =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--dl-accent-text)]";
const h2 =
  "m-0 mb-3 font-brand text-[28px] font-medium leading-[1.05] tracking-[-0.03em] text-[var(--dl-text)] md:text-[34px]";
const lead = "m-0 text-[16.5px] leading-[1.55] text-[var(--dl-muted)]";
const inlineLink = `text-[var(--dl-text)] underline decoration-[var(--dl-line-strong)] underline-offset-4 hover:text-[var(--dl-accent-text)] hover:decoration-[var(--dl-accent-text)] ${focus}`;
const arrowDir = "rtl:-scale-x-100";

const JOB_ICONS: Record<JobPathId, IconComponent> = {
  payments: CreditCard,
  payPerCall: Server,
  asset: Layers,
};

const ROUTE_ICONS: Record<LearnRouteId, IconComponent> = {
  docs: BookOpen,
  bootcamp: School,
  templates: Package,
  cookbook: CodeAlt,
};

function SectionHead({
  id,
  title,
  body,
  children,
}: {
  id: string;
  title: string;
  body: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-[720px]">
        <h2 id={id} className={h2}>
          {title}
        </h2>
        <p className={lead}>{body}</p>
      </div>
      {children}
    </div>
  );
}

function PaymentVisual({ t }: { t: (key: string) => string }) {
  const node =
    "rounded-full border border-[var(--dl-line)] bg-[var(--dl-raised)] px-3 py-[7px] text-[12.5px] leading-none text-[var(--dl-text)]";
  return (
    <div className="grid w-[86%] grid-cols-[auto_1fr_auto] items-center gap-2.5">
      <span className={node}>{t("picker.visuals.payFrom")}</span>
      <span className="relative h-0.5 bg-[repeating-linear-gradient(90deg,var(--dl-line-strong)_0_6px,transparent_6px_12px)]">
        <i className="absolute left-0 top-1/2 -mt-3 h-6 rounded-[7px] border border-[var(--dl-accent-line)] bg-[var(--dl-surface-2)] px-2 font-brand-mono text-[11.5px] font-semibold not-italic leading-[22px] text-[var(--dl-accent-text)] motion-safe:animate-[dl-coin_2.8s_cubic-bezier(.6,0,.3,1)_infinite]">
          $1.00
        </i>
      </span>
      <span className={`${node} border-[var(--dl-accent-line)]`}>
        {t("picker.visuals.payTo")}
      </span>
      <span className="col-span-3 mt-4 justify-self-center font-brand-mono text-xs text-[var(--dl-accent-text)] motion-safe:animate-[dl-tag_2.8s_infinite]">
        {t("picker.visuals.payTag")}
      </span>
    </div>
  );
}

function ApiVisual() {
  const line =
    "rounded-lg border border-[var(--dl-line)] bg-[var(--dl-surface-2)] px-2.5 py-1.5 motion-safe:animate-[dl-line_4.8s_infinite]";
  return (
    <div
      dir="ltr"
      className="flex w-[84%] flex-col gap-1.5 font-brand-mono text-[12.5px] leading-normal text-[var(--dl-muted)]"
    >
      <div className={line}>
        <b className="font-semibold text-[var(--dl-code-fn)]">GET</b>{" "}
        /api/forecast
      </div>
      <div className={`${line} [animation-delay:.6s]`}>
        <span className="text-[var(--dl-code-num)]">402</span> price: $0.01
      </div>
      <div className={`${line} [animation-delay:1.2s]`}>
        <span className="text-[var(--dl-accent-text)]">paid</span> 0.01 USDC
      </div>
      <div className={`${line} [animation-delay:1.8s]`}>
        <span className="text-[var(--dl-accent-text)]">200</span>{" "}
        {'{ "sky": "clear" }'}
      </div>
    </div>
  );
}

function AssetVisual({ t }: { t: (key: string) => string }) {
  const row =
    "rounded-[10px] border border-[var(--dl-line)] bg-[var(--dl-raised)] px-3 py-[7px] text-[13px] text-[var(--dl-text)] motion-safe:animate-[dl-row_4s_infinite]";
  return (
    <div className="flex items-center gap-5">
      <div className="grid size-16 place-items-center rounded-2xl border border-[var(--dl-gold-line)] bg-[var(--dl-gold-soft)] font-brand-mono text-sm font-bold text-[var(--dl-gold)] motion-safe:animate-[dl-bob_4s_ease-in-out_infinite]">
        LSF
      </div>
      <div className="flex flex-col gap-2">
        <div className={row}>
          → {t("picker.visuals.assetApproved")}{" "}
          <b className="ms-2 text-[var(--dl-accent-text)]">✓</b>
        </div>
        <div className={`${row} [animation-delay:2s]`}>
          → {t("picker.visuals.assetUnknown")}{" "}
          <b className="ms-2 text-[var(--dl-danger)]">✕</b>
        </div>
      </div>
    </div>
  );
}

/**
 * Lets a long command wrap between words only (never after the "-" in
 * "--url"). Copying the selection still yields the exact command.
 */
function CommandWords({ command }: { command: string }) {
  return command.split(" ").map((word, index) => (
    <Fragment key={index}>
      {index > 0 && " "}
      <span className="whitespace-nowrap">{word}</span>
    </Fragment>
  ));
}

type Translate = (key: string, values?: Record<string, string>) => string;

/**
 * "Build with your agent": the Solana MCP server URL and the one-line setup
 * commands from https://mcp.solana.com. Everything is plain, selectable text
 * in the server render; the copy buttons turn on after hydration.
 */
function AgentCard({ t, moreHref }: { t: Translate; moreHref: string }) {
  const row =
    "m-0 flex items-start gap-3 rounded-xl border bg-[var(--dl-surface)] pe-2 ps-3.5";
  const code =
    "min-w-0 flex-1 self-center select-all font-brand-mono text-[var(--dl-text)] [overflow-wrap:anywhere]";
  const label = "mb-2 text-[13px] text-[var(--dl-dim)]";
  const copy = { copyText: t("agent.copy"), copiedText: t("agent.copied") };

  return (
    <section
      aria-labelledby="dl-agent-title"
      data-testid="agent-card"
      className="rounded-2xl border border-[var(--dl-line)] bg-[var(--dl-surface-2)] p-5 md:p-6"
    >
      <h2
        id="dl-agent-title"
        className="m-0 mb-2 font-brand text-[22px] font-medium leading-tight tracking-[-0.02em] text-[var(--dl-text)]"
      >
        {t("agent.title")}
      </h2>
      <p className="m-0 mb-5 text-[15px] leading-[1.55] text-[var(--dl-muted)]">
        {t("agent.body")}
      </p>
      <dl className="m-0 flex flex-col gap-4">
        <div>
          <dt className={label}>{t("agent.serverUrl")}</dt>
          <dd className={`${row} border-[var(--dl-line-strong)] py-2.5`}>
            <code
              dir="ltr"
              data-testid="agent-server-url"
              className={`${code} text-[15px] leading-[1.5]`}
            >
              {AGENT_SETUP.serverUrl}
            </code>
            <CopyButton
              text={AGENT_SETUP.serverUrl}
              label={t("agent.copyServerUrl")}
              {...copy}
            />
          </dd>
        </div>
        {AGENT_SETUP.clients.map((client) => (
          <div key={client.id}>
            <dt className={label}>{client.name}</dt>
            <dd className={`${row} border-[var(--dl-line)] py-2`}>
              <code
                dir="ltr"
                data-testid={`agent-command-${client.id}`}
                className={`${code} text-[13px] leading-[1.6]`}
              >
                <CommandWords command={client.command} />
              </code>
              <CopyButton
                text={client.command}
                label={t("agent.copyCommand", { client: client.name })}
                {...copy}
              />
            </dd>
          </div>
        ))}
      </dl>
      <a
        href={moreHref}
        target="_blank"
        rel="noopener noreferrer"
        className={`mt-5 inline-flex items-center gap-1.5 text-sm ${inlineLink}`}
      >
        {t("agent.otherClients")}
        <ArrowRight aria-hidden className={`!size-4 ${arrowDir}`} />
      </a>
    </section>
  );
}

export async function DevelopersHub({
  locale,
  updates,
}: {
  locale: string;
  updates: DeveloperUpdate[];
}) {
  const t = await getTranslations({
    locale,
    namespace: "developers.landing",
  });
  const href = (path: string) => localizedHref(locale, path);
  const tt = (key: string, values?: Record<string, string>) => t(key, values);

  const defaults = COST_MODEL.defaults;
  const defaultCosts = computeCosts(
    defaults.paymentsPerMonth,
    defaults.averagePaymentUsd,
  );
  const visuals: Record<JobPathId, ReactNode> = {
    payments: <PaymentVisual t={tt} />,
    payPerCall: <ApiVisual />,
    asset: <AssetVisual t={tt} />,
  };

  return (
    <main
      data-dev-landing="dark"
      className="overflow-hidden bg-[var(--dl-bg)] font-brand text-base text-[var(--dl-text)] transition-colors duration-300 motion-reduce:transition-none"
    >
      {/* Hero */}
      <section
        aria-labelledby="dl-hero-title"
        className="border-b border-[var(--dl-line)] pb-14 pt-14 md:pb-16 md:pt-[88px]"
      >
        <div className={container}>
          <h1
            id="dl-hero-title"
            className="m-0 mb-7 max-w-[1100px] font-brand text-[clamp(2.75rem,8vw,5.75rem)] font-medium leading-[0.98] tracking-[-0.05em] text-[var(--dl-text)]"
          >
            {t("hero.title")}
          </h1>
          <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] lg:gap-14">
            <div>
              <p className="m-0 mb-6 max-w-[620px] text-[17.5px] leading-[1.6] text-[var(--dl-muted)]">
                {t("hero.lede")}
              </p>
              <div className="flex flex-wrap gap-2.5">
                <a
                  href={HERO_LINKS.picker}
                  className={`inline-flex h-10 items-center gap-2 rounded-full bg-[var(--dl-accent)] px-[18px] text-sm font-medium text-[var(--dl-on-accent)] no-underline transition-colors hover:bg-[#3ff5aa] hover:text-[var(--dl-on-accent)] ${focus}`}
                >
                  {t("hero.primaryCta")}
                  <ArrowDown aria-hidden className="!size-4" />
                </a>
                <a
                  href={href(HERO_LINKS.docs)}
                  {...newTab(href(HERO_LINKS.docs))}
                  className={`inline-flex h-10 items-center rounded-full border border-[var(--dl-line-strong)] px-[18px] text-sm font-medium text-[var(--dl-text)] no-underline transition-colors hover:border-[var(--dl-text)] hover:text-[var(--dl-text)] ${focus}`}
                >
                  {t("hero.secondaryCta")}
                </a>
              </div>
            </div>
            <AgentCard t={tt} moreHref={AGENT_SETUP.moreHref} />
          </div>
        </div>
      </section>

      {/* Job picker */}
      <section
        id="picker"
        aria-labelledby="dl-picker-title"
        className="scroll-mt-28 py-16 md:py-[72px]"
      >
        <div className={container}>
          <SectionHead
            id="dl-picker-title"
            title={t("picker.title")}
            body={t("picker.body")}
          />
          <input
            type="checkbox"
            id="dl-pause-animations"
            className="peer sr-only"
          />
          <label
            htmlFor="dl-pause-animations"
            className="mb-4 inline-flex cursor-pointer select-none items-center gap-2 rounded-full border border-[var(--dl-line)] px-3 py-1.5 text-[13px] text-[var(--dl-muted)] hover:border-[var(--dl-line-strong)] peer-checked:border-[var(--dl-accent-line)] peer-checked:text-[var(--dl-text)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--dl-accent-text)] motion-reduce:hidden"
          >
            <span
              aria-hidden
              className="grid size-3.5 place-items-center rounded-sm border border-[var(--dl-line-strong)] text-[10px] leading-none"
            >
              ❚❚
            </span>
            {t("picker.pauseAnimations")}
          </label>
          <ul
            className="m-0 grid list-none gap-[18px] p-0 lg:grid-cols-3 peer-checked:[&_*]:![animation:none]"
            data-testid="job-cards"
          >
            {JOB_PATHS.map((job) => {
              const Icon = JOB_ICONS[job.id];
              return (
                <li key={job.id} className="flex">
                  <a
                    href={href(job.href)}
                    {...newTab(href(job.href))}
                    data-testid={`job-card-${job.id}`}
                    className={`group flex w-full flex-col overflow-hidden rounded-3xl border border-[var(--dl-line)] bg-[var(--dl-surface)] text-[var(--dl-text)] no-underline transition hover:border-[var(--dl-accent-line)] hover:text-[var(--dl-text)] motion-safe:hover:-translate-y-1 ${focus}`}
                  >
                    <div
                      aria-hidden
                      className="relative m-2.5 grid h-[168px] place-items-center overflow-hidden rounded-2xl border border-[var(--dl-line)] [background:var(--dl-vis)]"
                    >
                      {visuals[job.id]}
                    </div>
                    <div className="px-6 pt-[18px]">
                      <span className="grid size-9 place-items-center rounded-[11px] border border-[var(--dl-accent-line)] bg-[var(--dl-accent-soft)] text-[var(--dl-accent-text)]">
                        <Icon aria-hidden className="!size-[18px]" />
                      </span>
                      <h3 className="mb-2.5 mt-4 font-brand text-2xl font-medium leading-[1.15] tracking-[-0.03em] text-[var(--dl-text)]">
                        {t(`picker.cards.${job.id}.title`)}
                      </h3>
                      <p className="m-0 text-[15px] leading-[1.55] text-[var(--dl-muted)]">
                        {t(`picker.cards.${job.id}.body`)}
                      </p>
                    </div>
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-3 px-6 py-6 text-[13px] text-[var(--dl-dim)]">
                      <span>
                        {t.rich("picker.firstResult", {
                          time: job.firstResult,
                          b: (chunks) => (
                            <b className="font-medium text-[var(--dl-text)]">
                              {chunks}
                            </b>
                          ),
                        })}
                        {" · "}
                        {t("picker.totalTime", { time: job.total })}
                      </span>
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-[var(--dl-text)]">
                        {t(`picker.cards.${job.id}.cta`)}
                        <ArrowRight
                          aria-hidden
                          className={`!size-4 text-[var(--dl-accent-text)] transition-transform motion-safe:group-hover:translate-x-1 ${arrowDir}`}
                        />
                      </span>
                    </div>
                  </a>
                </li>
              );
            })}
          </ul>
          <nav
            aria-label={t("picker.moreLabel")}
            className="mt-6 flex flex-wrap items-center gap-2.5 text-sm text-[var(--dl-dim)]"
          >
            <span>{t("picker.moreLabel")}</span>
            {MORE_USE_CASES.map((item) => (
              <a
                key={item.id}
                href={href(item.href)}
                {...newTab(href(item.href))}
                className={`rounded-full border border-[var(--dl-line-strong)] px-3.5 py-2 text-[var(--dl-text)] no-underline transition-colors hover:border-[var(--dl-accent-line)] hover:bg-[var(--dl-accent-soft)] hover:text-[var(--dl-text)] ${focus}`}
              >
                {t(`picker.more.${item.id}`)}
              </a>
            ))}
          </nav>
        </div>
      </section>

      {/* Why Solana */}
      <section
        id="why-solana"
        aria-labelledby="dl-why-title"
        className="scroll-mt-28 py-16 md:py-[72px]"
      >
        <div className={container}>
          <SectionHead
            id="dl-why-title"
            title={t("why.title")}
            body={t("why.body")}
          />
          <ul
            className="m-0 grid list-none gap-3.5 p-0 sm:grid-cols-2 lg:grid-cols-4"
            data-testid="stats"
          >
            {HUB_STATS.map((stat, index) => (
              <li
                key={stat.id}
                data-testid={`stat-${stat.id}`}
                className="flex flex-col gap-1.5 rounded-[18px] border border-[var(--dl-line)] bg-[var(--dl-surface)] px-[22px] py-6"
              >
                <b className="text-[40px] font-medium leading-[1.05] tracking-[-0.04em] text-[var(--dl-text)]">
                  {formatStatValue(stat, locale)}
                </b>
                <span className="text-[14.5px] text-[var(--dl-text)]">
                  {t(`why.stats.${stat.labelKey}.label`)}
                </span>
                <em className="text-[12.5px] not-italic text-[var(--dl-dim)]">
                  {stat.id === "uptime"
                    ? t("why.stats.uptime.detail")
                    : t("why.asOf", {
                        date: formatAsOf(stat.asOf, locale),
                      })}{" "}
                  <a
                    href={`#dl-source-${stat.id}`}
                    aria-label={t("why.sourceLink", {
                      n: index + 1,
                      name: stat.source.name,
                    })}
                    className={`text-[var(--dl-muted)] underline underline-offset-2 hover:text-[var(--dl-accent-text)] ${focus}`}
                  >
                    [{index + 1}]
                  </a>
                </em>
              </li>
            ))}
          </ul>
          <ul className="m-0 mt-3.5 grid list-none gap-3.5 p-0 sm:grid-cols-2 lg:grid-cols-4">
            {WHY_REASONS.map((id) => (
              <li
                key={id}
                className="rounded-[18px] border border-[var(--dl-line)] p-[22px]"
              >
                <h3 className="m-0 mb-2 font-brand text-[17px] font-medium leading-snug tracking-[-0.015em] text-[var(--dl-text)]">
                  {t(`why.reasons.${id}.title`)}
                </h3>
                <p className="m-0 text-sm leading-[1.55] text-[var(--dl-muted)]">
                  {t(`why.reasons.${id}.body`)}
                </p>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-2.5 border-y border-[var(--dl-line)] py-5">
            <span className="text-[13.5px] text-[var(--dl-dim)]">
              {t("why.productionLabel")}
            </span>
            <ul className="m-0 flex list-none flex-wrap gap-x-7 gap-y-2.5 p-0">
              {PRODUCTION_USERS.map((name) => (
                <li
                  key={name}
                  className="text-[19px] font-semibold tracking-[-0.02em] text-[var(--dl-muted)]"
                >
                  {name}
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-4 text-xs text-[var(--dl-dim)]">
            <h3 className="m-0 mb-1.5 font-brand text-xs font-medium text-[var(--dl-muted)]">
              {t("why.sourcesTitle")}
            </h3>
            <ol
              className="m-0 list-decimal space-y-1 ps-5"
              data-testid="stat-sources"
            >
              {HUB_STATS.map((stat) => (
                <li
                  key={stat.id}
                  id={`dl-source-${stat.id}`}
                  className="scroll-mt-28"
                >
                  <a
                    href={stat.source.url}
                    rel="noopener noreferrer"
                    className={`text-[var(--dl-muted)] underline decoration-[var(--dl-line-strong)] underline-offset-[3px] hover:text-[var(--dl-accent-text)] ${focus}`}
                  >
                    {stat.source.name}
                  </a>
                  {": "}
                  {t(`why.stats.${stat.labelKey}.label`)} (
                  {formatAsOf(stat.asOf, locale)}),{" "}
                  {t("why.retrieved", {
                    date: formatAsOf(stat.retrievedAt, locale),
                  })}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Cost calculator */}
      <section
        id="cost"
        aria-labelledby="dl-calc-title"
        className="scroll-mt-28 py-16 md:py-[72px]"
      >
        <div className={container}>
          <SectionHead
            id="dl-calc-title"
            title={t("calc.title")}
            body={t("calc.body")}
          />
          <CostCalculator
            locale={locale}
            initial={{
              payments: formatInteger(defaults.paymentsPerMonth, locale),
              average: formatUsd(defaults.averagePaymentUsd, locale),
              card: formatUsd(defaultCosts.card, locale),
              solana: formatUsd(defaultCosts.solana, locale),
              savings: formatUsd(defaultCosts.savings, locale),
            }}
            note={t.rich("calc.note", {
              cardSource: (chunks) => (
                <a
                  href={COST_MODEL.card.source.url}
                  rel="noopener noreferrer"
                  className={inlineLink}
                >
                  {chunks}
                </a>
              ),
              feeSource: (chunks) => (
                <a
                  href={href(COST_MODEL.solana.source.url)}
                  {...newTab(href(COST_MODEL.solana.source.url))}
                  className={inlineLink}
                >
                  {chunks}
                </a>
              ),
            })}
          />
          <div className="mt-[18px] overflow-x-auto rounded-[20px] border border-[var(--dl-line)]">
            <table
              className="w-full border-collapse text-start text-sm"
              data-testid="calc-table"
            >
              <caption className="px-6 pb-2 pt-4 text-start text-[13px] text-[var(--dl-dim)]">
                {t("calc.tableCaption", {
                  average: formatUsd(defaults.averagePaymentUsd, locale),
                })}
              </caption>
              <thead>
                <tr className="text-[var(--dl-muted)]">
                  {(["tableVolume", "tableCard", "tableSolana"] as const).map(
                    (key) => (
                      <th
                        key={key}
                        scope="col"
                        className="border-b border-[var(--dl-line)] px-6 py-2.5 text-start font-medium"
                      >
                        {t(`calc.${key}`)}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {COST_MODEL.tableVolumes.map((volume) => {
                  const costs = computeCosts(
                    volume,
                    defaults.averagePaymentUsd,
                  );
                  return (
                    <tr
                      key={volume}
                      className="border-b border-[var(--dl-line)] last:border-0"
                    >
                      <th
                        scope="row"
                        className="px-6 py-3 text-start font-normal text-[var(--dl-text)]"
                      >
                        {formatInteger(volume, locale)}
                      </th>
                      <td className="px-6 py-3 text-[var(--dl-text)]">
                        {formatUsd(costs.card, locale)}
                      </td>
                      <td className="px-6 py-3 text-[var(--dl-accent-text)]">
                        {formatUsd(costs.solana, locale)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Other ways to learn */}
      <section
        id="learn"
        aria-labelledby="dl-routes-title"
        className="scroll-mt-28 py-16 md:py-[72px]"
      >
        <div className={container}>
          <SectionHead
            id="dl-routes-title"
            title={t("routes.title")}
            body={t("routes.body")}
          />
          <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
            {LEARN_ROUTES.map((route) => {
              const Icon = ROUTE_ICONS[route.id];
              return (
                <li key={route.id} className="flex">
                  <a
                    href={href(route.href)}
                    {...newTab(href(route.href))}
                    className={`group relative block w-full rounded-[20px] border border-[var(--dl-line)] bg-[var(--dl-surface)] px-6 pb-7 pt-[26px] text-[var(--dl-text)] no-underline transition hover:border-[var(--dl-purple-line)] hover:text-[var(--dl-text)] motion-safe:hover:-translate-y-[3px] ${focus}`}
                  >
                    <span className="grid size-9 place-items-center rounded-[11px] border border-[var(--dl-purple-line)] bg-[var(--dl-purple-soft)] text-[var(--dl-purple-text)]">
                      <Icon aria-hidden className="!size-[18px]" />
                    </span>
                    <ArrowUpRight
                      aria-hidden
                      className={`absolute end-[22px] top-7 !size-4 text-[var(--dl-dim)] transition-transform group-hover:text-[var(--dl-text)] motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5 ${arrowDir}`}
                    />
                    <h3 className="mb-1.5 mt-[26px] font-brand text-lg font-medium tracking-[-0.02em] text-[var(--dl-text)]">
                      {t(`routes.items.${route.id}.title`)}
                    </h3>
                    <p className="m-0 text-sm leading-normal text-[var(--dl-muted)]">
                      {t(`routes.items.${route.id}.body`)}
                    </p>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* Developer updates (hidden when the Media feed is empty) */}
      {updates.length > 0 && (
        <section
          id="updates"
          aria-labelledby="dl-updates-title"
          className="scroll-mt-28 py-16 md:py-[72px]"
        >
          <div className={container}>
            <SectionHead
              id="dl-updates-title"
              title={t("updates.title")}
              body={t("updates.body")}
            />
            <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2 lg:grid-cols-4">
              {updates.slice(0, 4).map((update) => (
                <li key={update.href} className="flex">
                  <a
                    href={update.href}
                    className={`flex w-full flex-col gap-2 rounded-[20px] border border-[var(--dl-line)] p-6 text-[var(--dl-text)] no-underline transition-colors hover:border-[var(--dl-line-strong)] hover:text-[var(--dl-text)] ${focus}`}
                  >
                    <span className="text-xs text-[var(--dl-dim)]">
                      {t(`updates.kinds.${update.kind}`)}
                      {update.publishedAt
                        ? ` · ${formatAsOf(update.publishedAt.slice(0, 10), locale)}`
                        : ""}
                    </span>
                    <h3 className="m-0 font-brand text-[17px] font-medium leading-snug text-[var(--dl-text)]">
                      {update.title}
                    </h3>
                    <p className="m-0 line-clamp-3 text-sm text-[var(--dl-muted)]">
                      {update.description}
                    </p>
                    <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-medium">
                      {t("updates.read")}
                      <ArrowRight
                        aria-hidden
                        className={`!size-4 text-[var(--dl-accent-text)] ${arrowDir}`}
                      />
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Newsletter */}
      <section
        id="newsletter"
        aria-labelledby="dl-news-title"
        className="pb-[90px] pt-6"
      >
        <div className={container}>
          <div className="flex flex-col items-start justify-between gap-7 rounded-[26px] border border-[var(--dl-line)] px-6 py-9 [background:var(--dl-news)] md:flex-row md:items-center md:px-11 md:py-10">
            <div>
              <h2
                id="dl-news-title"
                className="m-0 mb-1.5 font-brand text-[26px] font-medium tracking-[-0.025em] text-[var(--dl-text)]"
              >
                {t("newsletter.title")}
              </h2>
              <p className="m-0 text-[16px] text-[var(--dl-muted)]">
                {t("newsletter.body")}
              </p>
            </div>
            <NewsletterForm formId={DEVELOPER_NEWSLETTER_FORM_ID} />
          </div>
        </div>
      </section>
    </main>
  );
}
