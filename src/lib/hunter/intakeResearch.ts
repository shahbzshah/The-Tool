/**
 * Intake research wiring (plan §6) — the part that already exists.
 *
 * On confirm, the draft's keywords feed the engines The-Tool already
 * runs. This module adds NO second research system: it runs the same
 * Hunter scan per keyword (max 3, deduped), then saves exactly ONE
 * opportunity for the idea itself — with source = upload | link |
 * own-idea and the original thumbnail beside the score — instead of
 * persisting every scanned competitor as its own row. Competitor data
 * still flows into the score through the evidence packet: the ranked
 * top-10 peers are stored in the opportunity's breakdown as intakePeers,
 * and buildEvidencePacket falls back to them when the row has no
 * same-scan peers of its own.
 *
 * The idea's score is a NICHE score (wedge + vulnerability +
 * monetisation from real competitors, via the packet's composite), not
 * any single competitor's score. Missing components are excluded, never
 * zeroed, exactly as the composite function already does.
 */

import { prisma } from "@/lib/db";
import { scanKeyword } from "./scraper";
import { rankScan, recordSnapshots } from "./persistScan";
import { buildEvidencePacket } from "./evidence";
import type { UnderstandingDraft } from "./understanding";

export interface IntakePeer {
  appId: string;
  title: string;
  rating: number | null;
  reviewsCount: number | null;
  installsMin: number | null;
}

function dedupeKeywords(keywords: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of keywords) {
    const t = (k ?? "").trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out.slice(0, 3);
}

/**
 * Run research for one confirmed intake job and create its opportunity.
 * Idempotency lives in the route (done/researching jobs short-circuit);
 * this function always does one full research run.
 */
export async function runIntakeResearch(args: {
  jobId: string;
  userId: string;
  source: string;
  linkUrl: string | null;
  thumbnail: string | null;
  draft: UnderstandingDraft;
}): Promise<{ opportunityId: string; scanJobId: string }> {
  const { draft } = args;
  const keywords = dedupeKeywords(draft.keywords);
  if (!keywords.length) {
    throw new Error("Add at least one keyword before researching.");
  }
  const topic = draft.topic.trim();
  if (!topic) {
    throw new Error("Add a topic before researching.");
  }
  const primary = keywords[0];

  // Same Hunter scan per keyword as the scans route, but capped at 10
  // apps per keyword so three keywords + the evidence build stay inside
  // the function's time window. Competitor rows are NOT persisted — the
  // idea gets exactly one opportunity (plan §9 acceptance check).
  let primaryPeers: IntakePeer[] = [];
  for (const kw of keywords) {
    const details = await scanKeyword(kw, 30, 10);
    if (!details.length) continue;
    const ranked = await rankScan(kw, details);
    await recordSnapshots(ranked, kw);
    if (kw === primary) {
      primaryPeers = ranked.slice(0, 10).map((r) => ({
        appId: r.detail.appId,
        title: r.detail.title,
        rating: r.detail.score != null ? Number(r.detail.score) : null,
        reviewsCount: r.detail.reviews != null ? Number(r.detail.reviews) : null,
        installsMin: r.detail.installs_num != null ? Number(r.detail.installs_num) : null,
      }));
    }
  }

  const now = new Date();
  const scanJob = await prisma.scanJob.create({
    data: {
      keyword: primary,
      status: "completed",
      startedAt: now,
      finishedAt: now,
      resultsCount: primaryPeers.length,
      userId: args.userId,
    },
  });

  const breakdownBase = {
    intake: true,
    source: args.source,
    draft: {
      topic: draft.topic,
      app_concept: draft.app_concept,
      audience: draft.audience,
      keywords,
    },
    intakePeers: primaryPeers,
  };

  // Synthetic appId: this row IS the idea, not a Play app. Evidence,
  // mining and cross-checks all degrade honestly around it (see
  // buildEvidencePacket's intakePeers fallback); Play details are never
  // faked for it, so rating/installs stay null.
  const opp = await prisma.opportunity.create({
    data: {
      scanJobId: scanJob.id,
      appId: `intake:${args.jobId}`,
      title: topic,
      summary: draft.app_concept ?? topic,
      url: args.source === "link" ? args.linkUrl : null,
      score: 0,
      breakdown: JSON.stringify(breakdownBase),
      source: args.source,
      thumbnail: args.thumbnail,
    },
  });

  // Full evidence packet (wedge, mining, monetisation, trend, range)
  // built from the real peers, then the niche composite becomes the row's
  // score. The detail page rebuilds this packet on visit anyway; building
  // it here means the list score is real from the first render.
  try {
    const packet = await buildEvidencePacket({
      id: opp.id,
      appId: opp.appId,
      title: opp.title,
      rating: null,
      installs: null,
      installsMin: null,
      reviewsCount: null,
      score: 0,
      category: null,
      playUpdated: null,
      breakdown: JSON.stringify(breakdownBase),
      scanJob: { keyword: primary },
    });
    await prisma.opportunity.update({
      where: { id: opp.id },
      data: {
        score: Math.round(packet.composite.score * 10) / 10,
        velocityPerDay: packet.velocity.perDay,
        deltaRatings30: packet.velocity.delta30,
        isRising: packet.isRising,
        breakdown: JSON.stringify({
          ...breakdownBase,
          composite: packet.composite,
          wedge: packet.wedge,
          velocity: packet.velocity,
          isRising: packet.isRising,
        }),
      },
    });
  } catch (err) {
    // A failed packet build must not lose the research run: the row
    // exists with a Low-confidence 0 score and the detail page rebuilds
    // the packet on first visit.
    console.warn("[intake] evidence packet build failed, keeping row:", err);
  }

  return { opportunityId: opp.id, scanJobId: scanJob.id };
}
