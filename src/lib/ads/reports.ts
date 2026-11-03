/**
 * Report di campagna (settimanale e conclusivo) ed esportazione CSV.
 * Regola: ciò che non è stato misurato è riportato come `not_measured` (valore null), mai come zero.
 */

import { addDays } from "./dates";
import type { Advertiser, Campaign, DailyStat, Placement } from "./types";

export type MetricStatus = "measured" | "not_measured";

export interface Metric {
  value: number | null;
  status: MetricStatus;
  note?: string;
}

export interface ReportMetrics {
  impressions_registered: Metric;
  impressions_eligible: Metric;
  clicks_registered: Metric;
  clicks_eligible: Metric;
  ctr_percent: Metric;
  unique_clicks: Metric;
}

export interface ReportRow {
  scope: string;
  from: string;
  to: string;
  complete: boolean;
  metrics: ReportMetrics;
}

export interface CampaignReport {
  type: "weekly" | "final";
  generated_at: string;
  as_of: string;
  provisional: boolean;
  synthetic_data: boolean;
  campaign: {
    code: string;
    name: string;
    advertiser: string;
    status: string;
    starts_on: string;
    ends_on: string;
    articles: string[];
  };
  measurement: { status: MetricStatus; reason: string | null };
  totals: ReportRow;
  weeks: ReportRow[];
  by_article: ReportRow[];
  methodology: string[];
  limitations: string[];
  warnings: string[];
}

export const METHODOLOGY = [
  "Impressione registrata: il box sponsorizzato è rimasto visibile almeno al 50% per almeno 1 secondo nel browser del lettore (IntersectionObserver), segnalato con una richiesta first-party senza cookie.",
  "Clic registrato: passaggio dal redirect server-side di Canapalandia verso la destinazione approvata.",
  "Evento idoneo: evento registrato esclusi user-agent automatizzati noti, prefetch/prerender e ripetizioni dello stesso visitatore pseudonimo entro 30 minuti (impressioni) o 10 minuti (clic).",
  "CTR: clic idonei / impressioni idonee × 100, calcolato solo se le impressioni idonee sono maggiori di zero.",
  "Il visitatore pseudonimo è un HMAC giornaliero troncato di IP e user-agent: non è reversibile, non è collegabile tra giorni diversi e serve solo alla deduplica.",
  "I dati grezzi sono conservati al massimo 35 giorni; oltre restano solo aggregati giornalieri.",
];

export const LIMITATIONS = [
  "Le impressioni senza JavaScript, con blocco degli annunci o con chiusura della pagina prima di 1 secondo non sono registrate: il valore è un minimo verificabile, non il totale delle visualizzazioni.",
  "Il filtro dei bot riconosce solo automatismi che si dichiarano o mostrano segnali evidenti; bot evoluti possono non essere esclusi.",
  "Clic unici non misurati: con un identificativo pseudonimo giornaliero non esiste una metodologia affidabile e conforme alla privacy per contarli.",
  "Conversioni, vendite e comportamento sul sito dell'inserzionista non sono misurati da Canapalandia.",
  "Il limite di frequenza è applicato per istanza serverless: in caso di traffico anomalo distribuito alcune richieste possono essere registrate e poi classificate come non idonee.",
];

interface Totals {
  impressions_registered: number;
  impressions_eligible: number;
  clicks_registered: number;
  clicks_eligible: number;
}

function sum(stats: readonly DailyStat[]): Totals {
  return stats.reduce<Totals>(
    (acc, s) => ({
      impressions_registered: acc.impressions_registered + s.impressions_registered,
      impressions_eligible: acc.impressions_eligible + s.impressions_eligible,
      clicks_registered: acc.clicks_registered + s.clicks_registered,
      clicks_eligible: acc.clicks_eligible + s.clicks_eligible,
    }),
    { impressions_registered: 0, impressions_eligible: 0, clicks_registered: 0, clicks_eligible: 0 },
  );
}

const notMeasured = (note: string): Metric => ({ value: null, status: "not_measured", note });
const UNIQUE_NOTE = "metodologia di unicità non affidabile: non misurato";

function metrics(t: Totals | null, reason: string | null): ReportMetrics {
  if (!t) {
    const note = reason ?? "non misurato";
    return {
      impressions_registered: notMeasured(note),
      impressions_eligible: notMeasured(note),
      clicks_registered: notMeasured(note),
      clicks_eligible: notMeasured(note),
      ctr_percent: notMeasured(note),
      unique_clicks: notMeasured(UNIQUE_NOTE),
    };
  }
  const m = (value: number): Metric => ({ value, status: "measured" });
  return {
    impressions_registered: m(t.impressions_registered),
    impressions_eligible: m(t.impressions_eligible),
    clicks_registered: m(t.clicks_registered),
    clicks_eligible: m(t.clicks_eligible),
    ctr_percent:
      t.impressions_eligible > 0
        ? m(Math.round((t.clicks_eligible / t.impressions_eligible) * 10_000) / 100)
        : notMeasured("nessuna impressione idonea: CTR non calcolabile"),
    unique_clicks: notMeasured(UNIQUE_NOTE),
  };
}

/**
 * Il tracciamento è avvenuto solo se la campagna è stata autorizzata e avviata.
 * Una campagna annullata conta come misurata solo se ha effettivamente prodotto dati.
 */
function measurementState(
  campaign: Campaign,
  hasData: boolean,
  options: { syntheticTest?: boolean },
): { status: MetricStatus; reason: string | null } {
  const started = ["active", "paused", "completed"].includes(campaign.status) || (campaign.status === "cancelled" && hasData);
  const ran = started && Boolean(campaign.activation_authorized_at);
  if (ran) return { status: "measured", reason: null };
  if (options.syntheticTest && campaign.is_synthetic) return { status: "measured", reason: null };
  return { status: "not_measured", reason: `campagna mai avviata (stato ${campaign.status}): nessuna misurazione` };
}

/** Blocchi di 7 giorni a partire dall'inizio contrattuale (l'ultimo può essere più corto). */
export function campaignWeeks(startsOn: string, endsOn: string): { index: number; from: string; to: string }[] {
  const weeks: { index: number; from: string; to: string }[] = [];
  let from = startsOn;
  let index = 1;
  while (from <= endsOn) {
    const to = addDays(from, 6) < endsOn ? addDays(from, 6) : endsOn;
    weeks.push({ index, from, to });
    from = addDays(to, 1);
    index++;
  }
  return weeks;
}

export function buildCampaignReport(input: {
  type: "weekly" | "final";
  campaign: Campaign;
  advertiser: Advertiser;
  placements: Placement[];
  stats: DailyStat[];
  today: string;
  now: Date;
  syntheticTest?: boolean;
}): CampaignReport {
  const { campaign, advertiser, placements, today } = input;
  const measurement = measurementState(campaign, input.stats.some((x) => x.campaign_id === campaign.id), {
    syntheticTest: input.syntheticTest,
  });
  const asOf = today < campaign.ends_on ? today : campaign.ends_on;
  const inPeriod = input.stats.filter((s) => s.campaign_id === campaign.id && s.day >= campaign.starts_on && s.day <= campaign.ends_on);
  const measured = measurement.status === "measured";
  const ended = today > campaign.ends_on;

  const row = (scope: string, from: string, to: string, stats: DailyStat[]): ReportRow => {
    const started = today >= from;
    const reason = !measured ? measurement.reason : !started ? "periodo non ancora iniziato" : null;
    return {
      scope,
      from,
      to,
      complete: today > to,
      metrics: metrics(measured && started ? sum(stats) : null, reason),
    };
  };

  const weeks = campaignWeeks(campaign.starts_on, campaign.ends_on)
    .filter((w) => input.type === "final" || w.from <= asOf)
    .map((w) => row(`settimana ${w.index}`, w.from, w.to, inPeriod.filter((s) => s.day >= w.from && s.day <= w.to)));

  const articles = [...new Set(placements.filter((p) => p.campaign_id === campaign.id).map((p) => p.article_slug))].sort();
  const placementSlug = new Map(placements.map((p) => [p.id, p.article_slug]));
  const byArticle = articles.map((slug) =>
    row(`articolo ${slug}`, campaign.starts_on, campaign.ends_on, inPeriod.filter((s) => placementSlug.get(s.placement_id) === slug)),
  );

  const warnings: string[] = [];
  const synthetic = campaign.is_synthetic || advertiser.is_synthetic;
  if (synthetic) warnings.push("DATI SINTETICI DI TEST: non rappresentano una campagna commerciale reale.");
  if (input.type === "final" && !ended && campaign.status !== "completed") {
    warnings.push(`Report conclusivo provvisorio: la campagna termina il ${campaign.ends_on}.`);
  }
  if (ended && ["active", "scheduled", "paused"].includes(campaign.status)) {
    warnings.push(`Campagna scaduta il ${campaign.ends_on} ma ancora in stato "${campaign.status}": non viene più mostrata, chiuderla come "completed".`);
  }
  const outOfPeriod = input.stats.filter((s) => s.campaign_id === campaign.id).length - inPeriod.length;
  if (outOfPeriod > 0) warnings.push(`${outOfPeriod} righe giornaliere fuori dal periodo contrattuale escluse dal report.`);

  const totalsTo = input.type === "final" ? campaign.ends_on : asOf;
  return {
    type: input.type,
    generated_at: input.now.toISOString(),
    as_of: asOf,
    provisional: input.type === "final" ? !ended && campaign.status !== "completed" : !ended,
    synthetic_data: synthetic,
    campaign: {
      code: campaign.code,
      name: campaign.name,
      advertiser: advertiser.display_name,
      status: campaign.status,
      starts_on: campaign.starts_on,
      ends_on: campaign.ends_on,
      articles,
    },
    measurement,
    totals: row("totale", campaign.starts_on, totalsTo, inPeriod.filter((s) => s.day <= totalsTo)),
    weeks,
    by_article: byArticle,
    methodology: METHODOLOGY,
    limitations: LIMITATIONS,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** Escape CSV con protezione da formula injection (celle che iniziano con = + - @ tab CR). */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CSV_HEADER = [
  "campaign_code",
  "synthetic_data",
  "report_type",
  "scope",
  "from",
  "to",
  "period_complete",
  "impressions_registered",
  "impressions_eligible",
  "clicks_registered",
  "clicks_eligible",
  "ctr_percent",
  "unique_clicks",
  "measurement_status",
  "note",
];

export function reportToCsv(report: CampaignReport): string {
  const lines = [CSV_HEADER.join(",")];
  const rows = [...report.weeks, ...report.by_article, report.totals];
  for (const r of rows) {
    const m = r.metrics;
    const notes = [...new Set([m.impressions_registered.note, m.ctr_percent.note].filter(Boolean))].join(" | ");
    lines.push(
      [
        report.campaign.code,
        report.synthetic_data ? "yes" : "no",
        report.type,
        r.scope,
        r.from,
        r.to,
        r.complete ? "yes" : "no",
        m.impressions_registered.value,
        m.impressions_eligible.value,
        m.clicks_registered.value,
        m.clicks_eligible.value,
        m.ctr_percent.value,
        m.unique_clicks.value === null ? "not_measured" : m.unique_clicks.value,
        m.impressions_registered.status,
        notes,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
