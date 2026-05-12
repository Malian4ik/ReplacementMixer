import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface OpenDotaPlayer {
  rank_tier?: number;
  profile?: { account_id?: number };
}

interface OpenDotaWL {
  win: number;
  lose: number;
}

interface OpenDotaCounts {
  leaver_status?: Record<string, { games: number }>;
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

// POST /api/players/trust — accepts { accountIds: string[] }, returns trust scores
// or GET /api/players/trust?accountId=XXX for single player
export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get("accountId");
  if (!accountId) return NextResponse.json({ error: "accountId required" }, { status: 400 });

  const score = await calcDotaTrust(accountId);
  return NextResponse.json({ accountId, trustScore: score });
}

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
  const [wl, counts] = await Promise.all([
    fetchOpenDota<OpenDotaWL>(`/players/${accountId}/wl?significant=0`),
    fetchOpenDota<OpenDotaCounts>(`/players/${accountId}/counts`),
  ]);

  if (!wl) return null;

  const totalMatches = (wl.win ?? 0) + (wl.lose ?? 0);

  // ── Account age from account_id (lower = older Steam account) ──────────────
  // Sequential Steam IDs: <50M = pre-2009, <150M = ~2012, <300M = ~2016, >500M = new
  const idNum = parseInt(accountId, 10);
  const ageScore =
    idNum < 50_000_000  ? 30 :
    idNum < 150_000_000 ? 25 :
    idNum < 300_000_000 ? 18 :
    idNum < 500_000_000 ? 10 : 4;  // Very new account → smurf risk high

  // ── Match count (few matches on this account = smurf signal) ───────────────
  const matchScore = Math.min(totalMatches / 20, 40); // 800+ matches = 40pts

  // ── Win rate penalty (smurfs dominate → abnormally high WR) ────────────────
  const winRate = totalMatches > 0 ? wl.win / totalMatches : 0.5;
  // Normal ~50%, suspicious >62%, blatant >70%
  const winRatePenalty = Math.min(30, Math.max(0, (winRate - 0.62) * 300));

  // ── Abandon penalty (account sharing = different people quit) ──────────────
  const leaverStatus = counts?.leaver_status ?? {};
  const abandonCount = Object.entries(leaverStatus)
    .filter(([k]) => parseInt(k) >= 1)
    .reduce((sum, [, v]) => sum + (v.games ?? 0), 0);
  const abandonRate = totalMatches > 0 ? abandonCount / totalMatches : 0;
  const abandonPenalty = Math.min(20, abandonRate * 400); // 5% abandons = -20pts

  const score = ageScore + matchScore - winRatePenalty - abandonPenalty;
  return Math.max(0, Math.round(score));
}
