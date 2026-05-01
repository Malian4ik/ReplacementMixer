import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSearchSession } from "@/services/search-session.service";
import { z } from "zod";

const SlotSchema = z.object({
  teamId: z.string().optional(),
  teamName: z.string().optional(),
  replacedPlayerId: z.string().optional(),
  replacedPlayerNick: z.string().optional(),
  neededRole: z.number().int().min(1).max(5),
  teamSlot: z.number().int().min(1).max(5),
});

const Schema = z.object({
  // Unified match session fields (new format — both provided together)
  homeTeamId: z.string().optional(),
  homeTeamName: z.string().optional(),
  awayTeamId: z.string().optional(),
  awayTeamName: z.string().optional(),
  // Single-team session (backward compat)
  teamId: z.string().optional(),
  // Common
  judgeName: z.string().min(1),
  targetAvgMmr: z.number(),
  maxDeviation: z.number().default(800),
  activeMatchId: z.string().optional(),
  slots: z.array(SlotSchema).min(1).optional(),
  // Legacy single-slot backward-compat fields
  replacedPlayerId: z.string().optional(),
  neededRole: z.number().int().min(1).max(5).optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Неверные параметры", details: parsed.error.flatten() }, { status: 400 });
  }

  const { judgeName, targetAvgMmr, maxDeviation, activeMatchId } = parsed.data;

  const guildId = process.env.DISCORD_GUILD_ID ?? "";
  const channelId = process.env.REPLACEMENTS_CHANNEL_ID ?? "";
  if (!channelId) {
    return NextResponse.json({ error: "REPLACEMENTS_CHANNEL_ID не настроен" }, { status: 500 });
  }

  const isMatchSession = !!(parsed.data.homeTeamId && parsed.data.awayTeamId);

  // ── Unified match session ─────────────────────────────────────────────────
  if (isMatchSession) {
    const { homeTeamId, homeTeamName, awayTeamId, awayTeamName } = parsed.data as {
      homeTeamId: string; homeTeamName?: string; awayTeamId: string; awayTeamName?: string;
    };

    const homeTeam = await prisma.team.findUnique({ where: { id: homeTeamId } });
    if (!homeTeam) return NextResponse.json({ error: "Команда home не найдена" }, { status: 404 });

    // Calculate home team MMR
    const homePlayerIds = [homeTeam.player1Id, homeTeam.player2Id, homeTeam.player3Id, homeTeam.player4Id, homeTeam.player5Id]
      .filter((id): id is string => !!id);
    const homePlayers = await prisma.player.findMany({
      where: { id: { in: homePlayerIds } },
      select: { mmr: true },
    });
    const homePlayerCount = homePlayers.length;
    const homeAvgMmr = homePlayerCount > 0
      ? Math.round(homePlayers.reduce((s, p) => s + p.mmr, 0) / homePlayerCount)
      : 0;

    // Calculate away team MMR
    const awayTeam = await prisma.team.findUnique({ where: { id: awayTeamId } });
    const awayPlayerIds = awayTeam
      ? [awayTeam.player1Id, awayTeam.player2Id, awayTeam.player3Id, awayTeam.player4Id, awayTeam.player5Id].filter((id): id is string => !!id)
      : [];
    const awayPlayers = awayPlayerIds.length > 0
      ? await prisma.player.findMany({ where: { id: { in: awayPlayerIds } }, select: { mmr: true } })
      : [];
    const awayAvgMmr = awayPlayers.length > 0
      ? Math.round(awayPlayers.reduce((s, p) => s + p.mmr, 0) / awayPlayers.length)
      : 0;

    // Build slots with slotTeamId/slotTeamName from per-slot teamId field
    const rawSlots = parsed.data.slots ?? [];
    if (rawSlots.length === 0) {
      return NextResponse.json({ error: "Не указаны слоты для матч-сессии" }, { status: 400 });
    }

    const enrichedSlots = await Promise.all(
      rawSlots.map(async (s, i) => {
        let nick = s.replacedPlayerNick;
        let mmr = 0;
        if (s.replacedPlayerId) {
          const p = await prisma.player.findUnique({ where: { id: s.replacedPlayerId }, select: { nick: true, mmr: true } });
          if (!nick && p?.nick) nick = p.nick;
          mmr = p?.mmr ?? 0;
        }
        return {
          slotIndex: i,
          neededRole: s.neededRole,
          teamSlot: s.teamSlot,
          replacedPlayerId: s.replacedPlayerId,
          replacedPlayerNick: nick,
          replacedPlayerMmr: mmr,
          slotTeamId: s.teamId ?? homeTeamId,
          slotTeamName: s.teamName ?? (homeTeamName ?? homeTeam.name),
        };
      })
    );

    // Scoring context: use average MMR of replaced players (not 0) so balance factor is correct.
    // For currentTeamAvgMmr: weighted average of home/away by how many slots each team has.
    const replacedMmrs = enrichedSlots.map((s) => s.replacedPlayerMmr).filter((m) => m > 0);
    const avgReplacedMmr = replacedMmrs.length > 0
      ? Math.round(replacedMmrs.reduce((a, b) => a + b, 0) / replacedMmrs.length)
      : 0;

    const homeSlotCount = enrichedSlots.filter((s) => s.slotTeamId === homeTeamId).length;
    const awaySlotCount = enrichedSlots.filter((s) => s.slotTeamId === awayTeamId).length;
    const totalSlots = homeSlotCount + awaySlotCount || 1;
    const weightedAvgMmr = Math.round(
      (homeAvgMmr * homeSlotCount + awayAvgMmr * awaySlotCount) / totalSlots
    );

    const resolvedHomeName = homeTeamName ?? homeTeam.name;
    const resolvedAwayName = awayTeamName ?? (awayTeam?.name ?? awayTeamId);

    try {
      const session = await createSearchSession({
        teamId: homeTeamId,
        teamName: resolvedHomeName,
        awayTeamId,
        awayTeamName: resolvedAwayName,
        neededRole: enrichedSlots[0].neededRole,
        replacedPlayerId: enrichedSlots[0].replacedPlayerId,
        replacedPlayerNick: enrichedSlots[0].replacedPlayerNick,
        replacedPlayerMmr: avgReplacedMmr,
        currentPlayerCount: 5,
        currentTeamAvgMmr: weightedAvgMmr,
        targetAvgMmr,
        maxDeviation,
        triggeredBy: `web:${judgeName}`,
        guildId,
        channelId,
        activeMatchId,
        slots: enrichedSlots,
      });
      return NextResponse.json({
        sessionId: session.id,
        teamName: `${resolvedHomeName} vs ${resolvedAwayName}`,
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "DUPLICATE_SESSION") {
        return NextResponse.json({ error: "Для этого матча уже запущен активный поиск" }, { status: 409 });
      }
      console.error("start-discord-search (match) error", err);
      return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
    }
  }

  // ── Single-team session (backward compat) ─────────────────────────────────
  const teamId = parsed.data.teamId;
  if (!teamId) {
    return NextResponse.json({ error: "Укажите teamId или homeTeamId+awayTeamId" }, { status: 400 });
  }

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) return NextResponse.json({ error: "Команда не найдена" }, { status: 404 });

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

  let slots: Array<{ slotIndex: number; neededRole: number; teamSlot: number; replacedPlayerId?: string; replacedPlayerNick?: string }>;

  if (parsed.data.slots && parsed.data.slots.length > 0) {
    const enriched = await Promise.all(
      parsed.data.slots.map(async (s, i) => {
        let nick = s.replacedPlayerNick;
        if (!nick && s.replacedPlayerId) {
          const p = await prisma.player.findUnique({ where: { id: s.replacedPlayerId }, select: { nick: true } });
          nick = p?.nick;
        }
        return {
          slotIndex: i,
          neededRole: s.neededRole,
          teamSlot: s.teamSlot,
          replacedPlayerId: s.replacedPlayerId,
          replacedPlayerNick: nick,
        };
      })
    );
    slots = enriched;
  } else {
    if (!parsed.data.neededRole) {
      return NextResponse.json({ error: "Укажите neededRole или массив slots" }, { status: 400 });
    }
    let replacedPlayer: { id: string; nick: string; mmr: number } | null = null;
    if (parsed.data.replacedPlayerId) {
      replacedPlayer = await prisma.player.findUnique({
        where: { id: parsed.data.replacedPlayerId },
        select: { id: true, nick: true, mmr: true },
      });
    }
    slots = [{
      slotIndex: 0,
      neededRole: parsed.data.neededRole,
      teamSlot: 1,
      replacedPlayerId: replacedPlayer?.id,
      replacedPlayerNick: replacedPlayer?.nick,
    }];
  }

  let replacedPlayerMmr = 0;
  const firstSlotWithPlayer = slots.find((s) => s.replacedPlayerId);
  if (firstSlotWithPlayer?.replacedPlayerId) {
    const p = await prisma.player.findUnique({
      where: { id: firstSlotWithPlayer.replacedPlayerId },
      select: { mmr: true },
    });
    replacedPlayerMmr = p?.mmr ?? 0;
  }

  try {
    const session = await createSearchSession({
      teamId: team.id,
      teamName: team.name,
      neededRole: slots[0].neededRole,
      replacedPlayerId: slots[0].replacedPlayerId,
      replacedPlayerNick: slots[0].replacedPlayerNick,
      replacedPlayerMmr,
      currentPlayerCount,
      currentTeamAvgMmr,
      targetAvgMmr,
      maxDeviation,
      triggeredBy: `web:${judgeName}`,
      guildId,
      channelId,
      activeMatchId,
      slots,
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
