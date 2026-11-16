import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { adminLogin, fetchTournamentTeams } from "@/services/admin-source.service";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const getTournamentTeamNames = unstable_cache(async (externalId: string) => {
  await adminLogin();
  const teams = await fetchTournamentTeams(externalId);
  if (!teams.length) throw new Error("В админке нет доступного списка команд турнира");
  return teams.map(team => team.name);
}, ["official-tournament-team-names"], { revalidate: 300 });

const CreateTeamSchema = z.object({
  name: z.string().min(1),
  player1Id: z.string().optional().nullable(),
  player2Id: z.string().optional().nullable(),
  player3Id: z.string().optional().nullable(),
  player4Id: z.string().optional().nullable(),
  player5Id: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = CreateTeamSchema.parse(body);
    const team = await prisma.team.create({ data });
    return NextResponse.json(team, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Bad request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function GET(req: NextRequest) {
  let names: string[] | undefined;
  if (req.nextUrl.searchParams.get("scope") === "tournament") {
    const tournament =
      (await prisma.adminTournament.findFirst({
        where: { isActive: true },
        select: { externalId: true },
      })) ??
      (await prisma.adminTournament.findFirst({
        where: { lastSyncedAt: { not: null } },
        orderBy: { lastSyncedAt: "desc" },
        select: { externalId: true },
      }));
    if (!tournament) return NextResponse.json([]);
    try {
      names = await getTournamentTeamNames(tournament.externalId);
    } catch {
      return NextResponse.json({ error: "Не удалось загрузить список команд турнира" }, { status: 502 });
    }
  }

  const teams = await prisma.team.findMany({
    ...(names ? { where: { name: { in: names } } } : {}),
    orderBy: { name: "asc" },
  });

  const playerIds = teams.flatMap((t) =>
    [t.player1Id, t.player2Id, t.player3Id, t.player4Id, t.player5Id].filter(Boolean) as string[]
  );
  const uniqueIds = [...new Set(playerIds)];
  const players = await prisma.player.findMany({ where: { id: { in: uniqueIds } } });
  const playerMap = new Map(players.map((p) => [p.id, p]));

  const teamsWithAvg = teams.map((t) => {
    const roster = [t.player1Id, t.player2Id, t.player3Id, t.player4Id, t.player5Id]
      .map((id) => (id ? playerMap.get(id) ?? null : null));
    const activePlayers = roster.filter(Boolean);
    const avgMmr = activePlayers.length
      ? Math.round(activePlayers.reduce((s, p) => s + p!.mmr, 0) / activePlayers.length)
      : 0;
    return { ...t, avgMmr, players: roster };
  });

  return NextResponse.json(teamsWithAvg);
}
