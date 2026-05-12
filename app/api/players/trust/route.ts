import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface OpenDotaWL {
  win: number;
  lose: number;
}

interface OpenDotaCounts {
  leaver_status?: Record<string, { games: number }>;
}

interface OpenDotaHero {
  hero_id: number;
  games: number;
  win: number;
}

interface OpenDotaMatch {
  kills: number;
  deaths: number;
  assists: number;
  cluster: number;
}

interface OpenDotaProfile {
  rank_tier?: number;
}

async function fetchOpenDota<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`https://api.opendota.com/api${path}`, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

// GET /api/players/trust?accountId=XXX — single player trust score
export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get("accountId");
  if (!accountId) return NextResponse.json({ error: "accountId required" }, { status: 400 });

  const score = await calcDotaTrust(accountId);
  return NextResponse.json({ accountId, trustScore: score });
}

// POST /api/players/trust — batch trust scores for { playerIds: string[] }
export async function POST(req: NextRequest) {
  const { playerIds } = await req.json().catch(() => ({})) as { playerIds?: string[] };
  if (!playerIds?.length) return NextResponse.json({ error: "playerIds required" }, { status: 400 });

  const players = await prisma.player.findMany({
    where: { id: { in: playerIds } },
    select: { id: true, steamAccountId: true, isDisqualified: true },
  });

  const results = await Promise.all(
    players.map(async (p) => {
      if (p.isDisqualified) return { id: p.id, trustScore: 0, hasSteam: false };
      if (!p.steamAccountId) return { id: p.id, trustScore: null, hasSteam: false };
      const score = await calcDotaTrust(p.steamAccountId);
      return { id: p.id, trustScore: score, hasSteam: true };
    })
  );

  return NextResponse.json(results);
}

async function calcDotaTrust(accountId: string): Promise<number | null> {
  const [wl, counts, heroes, matches, profile] = await Promise.all([
    fetchOpenDota<OpenDotaWL>(`/players/${accountId}/wl?significant=0`),
    fetchOpenDota<OpenDotaCounts>(`/players/${accountId}/counts`),
    fetchOpenDota<OpenDotaHero[]>(`/players/${accountId}/heroes`),
    fetchOpenDota<OpenDotaMatch[]>(`/players/${accountId}/matches?limit=20`),
    fetchOpenDota<OpenDotaProfile>(`/players/${accountId}`),
  ]);

  if (!wl) return null;

  const totalMatches = (wl.win ?? 0) + (wl.lose ?? 0);
  const isVeteran = totalMatches >= 1000;

  // ── Account age (lower Steam account_id = older account) ───────────────────
  const idNum = parseInt(accountId, 10);
  const ageScore =
    idNum < 50_000_000  ? 30 :
    idNum < 150_000_000 ? 25 :
    idNum < 300_000_000 ? 18 :
    idNum < 500_000_000 ? 10 : 4;

  // ── Match count (few matches = smurf signal) ────────────────────────────────
  const matchScore = Math.min(totalMatches / 20, 40); // 800+ matches = full 40pts

  // ── Rank bonus (Immortal/Divine players are verified non-smurfs) ────────────
  // rank_tier: 10=Herald, 20=Guardian, 30=Crusader, 40=Archon, 50=Legend,
  //            60=Ancient, 70=Divine, 80=Immortal
  const rankTier = profile?.rank_tier ?? 0;
  const rankBonus =
    rankTier >= 80 ? 20 :  // Immortal
    rankTier >= 70 ? 12 :  // Divine
    rankTier >= 60 ? 7  :  // Ancient
    rankTier >= 50 ? 3  : 0;

  // ── Win rate penalty (smurfs dominate → abnormally high WR) ────────────────
  const winRate = totalMatches > 0 ? wl.win / totalMatches : 0.5;
  const winRatePenalty = Math.min(30, Math.max(0, (winRate - 0.62) * 300));

  // ── Abandon penalty (account sharing = different people quit) ──────────────
  // Veterans get a softer cap: old disconnects shouldn't tank a 3000+ game account
  const leaverStatus = counts?.leaver_status ?? {};
  const abandonCount = Object.entries(leaverStatus)
    .filter(([k]) => parseInt(k) >= 1)
    .reduce((sum, [, v]) => sum + (v.games ?? 0), 0);
  const abandonRate = totalMatches > 0 ? abandonCount / totalMatches : 0;
  const abandonCap = isVeteran ? 10 : 20;
  const abandonPenalty = Math.min(abandonCap, abandonRate * 400);

  const matchList = matches ?? [];

  // ── Hero diversity ─────────────────────────────────────────────────────────
  let heroPenalty = 0;
  let heroDiversityBonus = 0;
  if (heroes) {
    const significantHeroes = heroes.filter(h => h.games >= 3).length;
    const heroDiversity = significantHeroes / 124;
    if (totalMatches < 200) {
      heroPenalty = Math.max(0, (0.15 - heroDiversity) * 60);
    } else {
      heroDiversityBonus = Math.min(15, Math.max(0, (heroDiversity - 0.20) * 60));
    }
  }

  // ── KDA ────────────────────────────────────────────────────────────────────
  let kdaPenalty = 0;
  let normalKdaBonus = 0;
  if (matchList.length > 0) {
    const avgKda = matchList.reduce((sum, m) => {
      return sum + (m.kills + m.assists) / Math.max(m.deaths, 1);
    }, 0) / matchList.length;
    if (totalMatches < 500) {
      kdaPenalty = Math.max(0, (avgKda - 4.0) * 5);
    } else {
      normalKdaBonus = avgKda >= 1.5 && avgKda <= 3.5 ? 5 : 0;
    }
  }

  // ── Private / empty profile penalty ────────────────────────────────────────
  const privatePenalty = matches !== null && matchList.length === 0 ? 5 : 0;

  // ── Region switching (softer for veterans — pros play in multiple regions) ──
  let regionPenalty = 0;
  if (matchList.length > 0) {
    const uniqueRegions = new Set(matchList.map(m => m.cluster)).size;
    if (uniqueRegions > 3) regionPenalty = isVeteran ? 5 : 10;
  }

  // Max possible: 30 (age) + 40 (matches) + 20 (rank) + 15 (hero) + 5 (kda) = 110 → capped at 100
  const score = ageScore + matchScore + rankBonus + heroDiversityBonus + normalKdaBonus
    - winRatePenalty - kdaPenalty - heroPenalty - privatePenalty
    - abandonPenalty - regionPenalty;

  return Math.max(0, Math.min(100, Math.round(score)));
}
