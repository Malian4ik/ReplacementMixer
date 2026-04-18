import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSearchSession } from "@/services/search-session.service";
import { z } from "zod";

const Schema = z.object({
  teamId: z.string(),
  replacedPlayerId: z.string().optional(),
  neededRole: z.number().int().min(1).max(5),
  judgeName: z.string().min(1),
  targetAvgMmr: z.number(),
  maxDeviation: z.number().default(800),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Неверные параметры", details: parsed.error.flatten() }, { status: 400 });
  }

  const { teamId, replacedPlayerId, neededRole, judgeName, targetAvgMmr, maxDeviation } = parsed.data;

  const guildId = process.env.DISCORD_GUILD_ID ?? "";
  const channelId = process.env.REPLACEMENTS_CHANNEL_ID ?? "";
  if (!channelId) {
    return NextResponse.json({ error: "REPLACEMENTS_CHANNEL_ID не настроен в переменных окружения" }, { status: 500 });
  }

  // Get team
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) return NextResponse.json({ error: "Команда не найдена" }, { status: 404 });

  // Get replaced player if specified
  let replacedPlayer: { id: string; nick: string; mmr: number } | null = null;
  if (replacedPlayerId) {
    replacedPlayer = await prisma.player.findUnique({
      where: { id: replacedPlayerId },
      select: { id: true, nick: true, mmr: true },
    });
    if (!replacedPlayer) return NextResponse.json({ error: "Игрок не найден" }, { status: 404 });
  }

  // Calculate team MMR
  const playerIds = [team.player1Id, team.player2Id, team.player3Id, team.player4Id, team.player5Id]
    .filter((id): id is string => !!id);
  const players = await prisma.player.findMany({
    where: { id: { in: playerIds } },
    select: { mmr: true },
  });
  const currentPlayerCount = players.length;
  const currentTeamAvgMmr = currentPlayerCount > 0
    ? Math.round(players.reduce((s, p) => s + p.mmr, 0) / currentPlayerCount)
    : 0;

  try {
    const session = await createSearchSession({
      teamId: team.id,
      teamName: team.name,
      neededRole,
      replacedPlayerId: replacedPlayer?.id,
      replacedPlayerNick: replacedPlayer?.nick,
      replacedPlayerMmr: replacedPlayer?.mmr,
      currentPlayerCount,
      currentTeamAvgMmr,
      targetAvgMmr,
      maxDeviation,
      triggeredBy: `web:${judgeName}`,
      guildId,
      channelId,
    });
    return NextResponse.json({ sessionId: session.id, teamName: team.name });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "DUPLICATE_SESSION") {
      return NextResponse.json({ error: "Для этой команды уже запущен активный поиск" }, { status: 409 });
    }
    console.error("start-discord-search error", err);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
