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
  const [player, wl, counts] = await Promise.all([
    fetchOpenDota<OpenDotaPlayer>(`/players/${accountId}`),
    fetchOpenDota<OpenDotaWL>(`/players/${accountId}/wl?significant=0`),
    fetchOpenDota<OpenDotaCounts>(`/players/${accountId}/counts`),
  ]);

  if (!player) return null;

  const totalMatches = (wl?.win ?? 0) + (wl?.lose ?? 0);

  // Abandon count from leaver_status (0 = stayed, 1+ = left/abandoned)
  const leaverStatus = counts?.leaver_status ?? {};
  const abandonCount = Object.entries(leaverStatus)
    .filter(([k]) => parseInt(k) >= 1)
    .reduce((sum, [, v]) => sum + (v.games ?? 0), 0);

  const abandonRate = totalMatches > 0 ? abandonCount / totalMatches : 0;

  // Rank tier: 1=Herald, 2=Guardian, 3=Crusader, 4=Archon, 5=Legend, 6=Ancient, 7=Divine, 8=Immortal
  const rankTier = player.rank_tier ?? 0;
  const medal = Math.floor(rankTier / 10); // 1-8

  const activity       = Math.min(totalMatches / 20, 50);   // cap at 1000 matches = 50pts
  const rankBonus      = Math.min(medal * 3, 24);           // Immortal = 24pts
  const abandonPenalty = Math.min(abandonRate * 500, 50);   // 10% abandons = 50pt penalty

  return Math.max(0, Math.round(activity + rankBonus - abandonPenalty));
}
