/**
 * Evidence packet (plan items 2–12, minus the deferred set).
 *
 * The packet is the ONLY thing the LLM scorecard ever sees. Every number
 * in it was computed in code from Play data, snapshot history, or HN
 * counts. The packet is cached per opportunity for 7 days (NicheEvidence)
 * so review mining and detail refetches don't run on every page view.
 *
 * DEFERRED BY PLAN — do NOT build here: ad intelligence, SDK analysis,
 * demographics, revenue modelling. Those need paid-panel data and add
 * little to a pre-build decision for a solo dev.
 */

import { prisma } from "@/lib/db";
import { fetchReviews, appDetails } from "./scraper";
import type { AppDetail } from "./scoring";
import { auditWedge, type WedgeAudit } from "./wedge";
import { computeVelocity, isRisingApp, type Velocity } from "./snapshots";
import { monetisationStrip, type MonetisationStrip } from "./monetisation";
import { mineReviews, type ReviewMining } from "./reviewMining";
import { estimateDownloads, type DownloadRange } from "./estimates";
import { compositeScore, type CompositeResult } from "./composite";
import { trendSlope, type TrendSlope } from "./trend";
import { daysSince, parsePlayDate } from "./dates";

export const EVIDENCE_TTL_MS = 7 * 24 * 3600 * 1000;

/** Standing unknowns: Play data can never answer these. Shown verbatim. */
export const STANDING_UNKNOWNS = [
  "Retention (will users stay past day 30?) — not in Play data.",
  "DAU/MAU and real active users — installs are cumulative, not active.",
  "CAC / LTV and ad efficiency — no spend or revenue data is public.",
  "Real revenue for any competitor — Play never publishes it; any $/mo figure elsewhere is a model, not a fact.",
];

const WEDGE_SUFFIX: Record<string, string> = {
  ads: "no ads",
  offline: "offline",
  pricing: "free",
  performance: "lightweight",
  privacy: "private",
  sync_data_loss: "sync",
};

export function slugifyTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "app"
  );
}

export interface EvidencePacket {
  version: number;
  opportunityId: string;
  appId: string;
  title: string;
  keyword: string;
  computedAt: string;
  asOf: string;
  wedge: WedgeAudit;
  velocity: Velocity;
  isRising: boolean;
  monetisation: MonetisationStrip;
  mining: ReviewMining | null;
  miningNote: string | null;
  freshness: {
    daysSinceUpdate: number | null;
    recentAvg: number | null;
    recentDelta: number | null;
    versionBreak: string | null;
    developerReplyRate: number | null;
  };
  trend: TrendSlope;
  range: DownloadRange | null;
  composite: CompositeResult;
  /** Dated ratings-count series for the trend sparkline. */
  snapshots: { day: string; ratingsCount: number | null }[];
  crossChecks: { appBrainUrl: string; appTrendKitUrl: string };
  unknowns: string[];
}

type OppRow = {
  id: string;
  appId: string;
  title: string;
  rating: number | null;
  installs: string | null;
  installsMin: bigint | null;
  reviewsCount: bigint | null;
  score: number;
  category: string | null;
  genreId?: string | null;
  playUpdated: string | null;
  breakdown: string | null;
  scanJob: { keyword: string } | null;
};

function legacyGapFrom(breakdown: string | null): number | null {
  if (!breakdown) return null;
  try {
    const b = JSON.parse(breakdown);
    return typeof b?.legacyGapScore === "number" ? b.legacyGapScore : null;
  } catch {
    return null;
  }
}

/**
 * Build a fresh packet. Best-effort throughout: a failed Play fetch degrades
 * that section to null/unknown, never to a guessed number, and never fails
 * the whole packet.
 */
export async function buildEvidencePacket(opp: OppRow): Promise<EvidencePacket> {
  const keyword = opp.scanJob?.keyword ?? "";
  const now = new Date();
  const asOf = now.toISOString().slice(0, 10);

  // Peer opportunities from the same scan (for the wedge audit).
  let peers: OppRow[] = [];
  try {
    const jobId = (
      await prisma.opportunity.findUnique({
        where: { id: opp.id },
        select: { scanJobId: true },
      })
    )?.scanJobId;
    if (jobId) {
      const rows = await prisma.opportunity.findMany({
        where: { scanJobId: jobId },
        orderBy: { score: "desc" },
        take: 20,
        include: { scanJob: { select: { keyword: true } } },
      });
      peers = rows as unknown as OppRow[];
    }
  } catch (err) {
    console.warn("[evidence] peer lookup failed:", err);
  }

  // Snapshots -> velocity.
  let snapRows: { day: string; ratingsCount: bigint | null; installsMin: bigint | null; categoryRank: number | null; score: number | null }[] = [];
  try {
    snapRows = await prisma.appSnapshot.findMany({
      where: { appId: opp.appId },
      orderBy: { day: "asc" },
      select: { day: true, ratingsCount: true, installsMin: true, categoryRank: true, score: true },
    });
  } catch (err) {
    console.warn("[evidence] snapshot lookup failed:", err);
  }
  const velocity = computeVelocity(snapRows);
  const rising = isRisingApp(velocity);

  // Fresh details for self + top peers (bounded, parallel) so the
  // monetisation strip and freshness use current Play data.
  const peerApps = peers.filter((p) => p.appId !== opp.appId).slice(0, 5);
  let selfDetail: AppDetail | null = null;
  let peerDetails: AppDetail[] = [];
  try {
    const ids = [opp.appId, ...peerApps.map((p) => p.appId)];
    const details = await Promise.all(ids.map((id) => appDetails(id)));
    selfDetail = details[0];
    peerDetails = details.slice(1).filter((d): d is AppDetail => !!d);
  } catch (err) {
    console.warn("[evidence] detail refetch failed:", err);
  }

  // Wedge audit from stored peer rows (no extra fetch needed).
  const wedgePeers = peers.slice(0, 10).map((p) => ({
    appId: p.appId,
    title: p.title,
    rating: p.rating,
    reviewsCount: p.reviewsCount != null ? Number(p.reviewsCount) : null,
    installsMin: p.installsMin != null ? Number(p.installsMin) : null,
  }));

  // Review mining: self + top 2 competitors, newest 100 each, capped.
  let mining: ReviewMining | null = null;
  let miningNote: string | null = null;
  try {
    const mineTargets = [
      { appId: opp.appId, title: opp.title },
      ...peerApps.slice(0, 2).map((p) => ({ appId: p.appId, title: p.title })),
    ];
    const mined = await Promise.all(
      mineTargets.map(async (t) => ({
        ...t,
        reviews: await fetchReviews(t.appId, 100),
      }))
    );
    const withReviews = mined.filter((m) => m.reviews.length > 0);
    if (withReviews.length === 0) {
      miningNote = "No reviews could be fetched for this niche right now — themes and recent-vs-lifetime rating are unavailable until Play answers.";
    } else {
      mining = mineReviews(withReviews, opp.rating);
      if (withReviews.length < mineTargets.length) {
        miningNote = `Reviews fetched for ${withReviews.length} of ${mineTargets.length} apps; themes cover only those apps.`;
      }
    }
  } catch (err) {
    console.warn("[evidence] review mining failed:", err);
    miningNote = "Review mining failed for this niche — themes are unavailable.";
  }

  // Suggested wedge keywords: audited keyword + theme-derived long-tails.
  const suggested: string[] = [];
  if (mining) {
    for (const theme of mining.themes.slice(0, 3)) {
      const suffix = WEDGE_SUFFIX[theme.key];
      if (suffix && keyword) suggested.push(`${keyword} ${suffix}`);
    }
  }
  const wedge = auditWedge(keyword, wedgePeers, suggested);

  // Monetisation strip (fresh details when available, else stored rows).
  const selfForStrip: AppDetail = selfDetail ?? {
    appId: opp.appId,
    title: opp.title,
  };
  const strip = monetisationStrip(selfForStrip, peerDetails);

  const playUpdated = selfDetail?.updated ?? opp.playUpdated ?? null;
  const days = daysSince(parsePlayDate(playUpdated));
  const freshness = {
    daysSinceUpdate: days,
    recentAvg: mining?.recentAvg ?? null,
    recentDelta: mining?.recentDelta ?? null,
    versionBreak: mining?.versionBreak ?? null,
    developerReplyRate: mining?.developerReplyRate ?? null,
  };

  const trend = await trendSlope(keyword, velocity);
  const range = estimateDownloads(velocity.perDay, selfDetail?.genreId ?? opp.category);

  const composite = compositeScore({
    medianRatings: wedge.medianRatings,
    wedge,
    mining,
    recentDelta: mining?.recentDelta ?? null,
    velocity,
    ageDays: velocity.ageDays,
    monetisation: strip,
    playUpdated,
    ratingsCount: opp.reviewsCount != null ? Number(opp.reviewsCount) : null,
    reviewSample: mining?.fetched ?? 0,
    snapshotDays: snapRows.length,
    legacyGapScore: legacyGapFrom(opp.breakdown),
  });

  return {
    version: 1,
    opportunityId: opp.id,
    appId: opp.appId,
    title: opp.title,
    keyword,
    computedAt: now.toISOString(),
    asOf,
    wedge,
    velocity,
    isRising: rising,
    monetisation: strip,
    mining,
    miningNote,
    freshness,
    trend,
    range,
    composite,
    snapshots: snapRows.map((s) => ({
      day: s.day,
      ratingsCount: s.ratingsCount != null ? Number(s.ratingsCount) : null,
    })),
    crossChecks: {
      appBrainUrl: `https://www.appbrain.com/app/${slugifyTitle(opp.title)}/${opp.appId}`,
      // AppTrendKit is iOS-focused; link its free keyword difficulty
      // checker as a manual keyword sense-check, not an app page.
      appTrendKitUrl: "https://www.apptrendkit.com/tools/keyword-difficulty-checker",
    },
    unknowns: STANDING_UNKNOWNS,
  };
}

/**
 * Cached packet: returns the stored packet when fresh (< 7 days), else
 * builds + stores a new one. `force` rebuilds regardless. Never throws —
 * callers get null only when the opportunity itself can't be read.
 */
export async function getEvidencePacket(
  opportunityId: string,
  opts: { force?: boolean } = {}
): Promise<EvidencePacket | null> {
  try {
    if (!opts.force) {
      const cached = await prisma.nicheEvidence.findUnique({
        where: { opportunityId },
      });
      if (cached) {
        const age = Date.now() - cached.computedAt.getTime();
        if (age < EVIDENCE_TTL_MS) {
          try {
            return JSON.parse(cached.packet) as EvidencePacket;
          } catch {
            // fall through and rebuild
          }
        }
      }
    }
    const opp = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      include: { scanJob: { select: { keyword: true } } },
    });
    if (!opp) return null;
    const packet = await buildEvidencePacket(opp as unknown as OppRow);
    await prisma.nicheEvidence.upsert({
      where: { opportunityId },
      create: { opportunityId, packet: JSON.stringify(packet) },
      update: { packet: JSON.stringify(packet), computedAt: new Date() },
    });
    return packet;
  } catch (err) {
    console.warn("[evidence] getEvidencePacket failed:", err);
    return null;
  }
}
