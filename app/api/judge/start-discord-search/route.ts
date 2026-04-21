import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSearchSession } from "@/services/search-session.service";
import { z } from "zod";

const SlotSchema = z.object({
  replacedPlayerId: z.string().optional(),
  replacedPlayerNick: z.string().optional(),
  neededRole: z.number().int().min(1).max(5),
  teamSlot: z.number().int().min(1).max(5),
});

const Schema = z.object({
  teamId: z.string(),
  judgeName: z.string().min(1),
  targetAvgMmr: z.number(),
  maxDeviation: z.number().default(800),
  activeMatchId: z.string().optional(),
  // Multi-slot (new format)
  slots: z.array(SlotSchema).min(1).optional(),
  // Single-slot backward-compat fields
  replacedPlayerId: z.string().optional(),
  neededRole: z.number().int().min(1).max(5).optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Неверные параметры", details: parsed.error.flatten() }, { status: 400 });
  }

  const { teamId, judgeName, targetAvgMmr, maxDeviation, activeMatchId } = parsed.data;

  const guildId = process.env.DISCORD_GUILD_ID ?? "";
  const channelId = process.env.REPLACEMENTS_CHANNEL_ID ?? "";
  if (!channelId) {
    return NextResponse.json({ error: "REPLACEMENTS_CHANNEL_ID не настроен" }, { status: 500 });
  }

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) return NextResponse.json({ error: "Команда не найдена" }, { status: 404 });

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

  // Build slots array
  let slots: Array<{ slotIndex: number; neededRole: number; teamSlot: number; replacedPlayerId?: string; replacedPlayerNick?: string }>;

  if (parsed.data.slots && parsed.data.slots.length > 0) {
    // New multi-slot format
    const rawSlots = parsed.data.slots;

    // Enrich with replacedPlayerNick if only ID was passed
    const enriched = await Promise.all(
      rawSlots.map(async (s, i) => {
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
    // Backward-compat: single slot from old fields
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

  // Derive session-level replacedPlayerMmr from first slot if applicable
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
