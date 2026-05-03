import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scoreCandidates } from "@/services/queue.service";
import type { SubstitutionPoolEntry, RoleNumber } from "@/types";

/** GET /api/judge/active-session?teamId=X
 *  Возвращает активную сессию поиска для команды (по teamId или awayTeamId).
 *  subScore для каждого откликнувшегося рассчитывается на лету (в БД хранится null во время волны).
 */
export async function GET(req: NextRequest) {
  const teamId = req.nextUrl.searchParams.get("teamId");
  if (!teamId) return NextResponse.json({ session: null });

  const session = await prisma.substitutionSearchSession.findFirst({
    where: {
      OR: [
        { teamId, status: "Active" },
        { awayTeamId: teamId, status: "Active" },
      ],
    },
    include: {
      waves: {
        where: { status: "Active" },
        orderBy: { waveNumber: "desc" },
        take: 1,
        include: {
          responses: {
            include: { player: { select: { id: true, nick: true, mmr: true, mainRole: true, flexRole: true, wallet: true } } },
            orderBy: { clickedAt: "asc" },
          },
          candidates: {
            include: { player: { select: { nick: true } } },
            orderBy: { queuePosition: "asc" },
          },
        },
      },
      slots: { orderBy: { slotIndex: "asc" } },
    },
  });

  if (!session) return NextResponse.json({ session: null });

  // Enrich active wave responses with live-computed subScores.
  // For multi-slot sessions score each candidate against every open slot and
  // use their BEST score — this accurately reflects which candidates fit
  // any of the available roles/teams.
  const activeWave = session.waves[0];
  if (activeWave && activeWave.responses.length > 0) {
    const responderIds = activeWave.responses.map((r) => r.playerId);

    const poolEntries = await prisma.substitutionPoolEntry.findMany({
      where: { playerId: { in: responderIds }, status: "Active" },
      include: { player: true },
    });

    const queuePositions = new Map(
      activeWave.candidates.map((c) => [c.playerId, c.queuePosition + 1])
    );

    const openSlots = session.slots.filter((s) => !s.assignedPlayerId);

    let scoreMap: Map<string, number>;

    if (openSlots.length <= 1) {
      // Single slot — use session-level context directly (fast path)
      const slot = openSlots[0];
      const slotTeamId = (slot as typeof slot & { slotTeamId?: string | null })?.slotTeamId ?? session.teamId;
      const replacedPlayerId = slot?.replacedPlayerId ?? session.replacedPlayerId;

      // Look up this slot's team avgMmr and replaced player MMR
      const slotTeam = await prisma.team.findUnique({
        where: { id: slotTeamId },
        select: { player1Id: true, player2Id: true, player3Id: true, player4Id: true, player5Id: true },
      });
      const slotPlayerIds = slotTeam
        ? [slotTeam.player1Id, slotTeam.player2Id, slotTeam.player3Id, slotTeam.player4Id, slotTeam.player5Id].filter(Boolean) as string[]
        : [];
      const slotPlayers = slotPlayerIds.length > 0
        ? await prisma.player.findMany({ where: { id: { in: slotPlayerIds } }, select: { mmr: true } })
        : [];
      const slotAvgMmr = slotPlayers.length > 0
        ? Math.round(slotPlayers.reduce((s, p) => s + p.mmr, 0) / slotPlayers.length)
        : session.currentTeamAvgMmr;

      const replacedPlayerMmrLookup = replacedPlayerId
        ? (await prisma.player.findUnique({ where: { id: replacedPlayerId }, select: { mmr: true } }))?.mmr ?? session.replacedPlayerMmr
        : session.replacedPlayerMmr;

      const scored = scoreCandidates(
        poolEntries as unknown as SubstitutionPoolEntry[],
        {
          neededRole: (slot?.neededRole ?? session.neededRole) as RoleNumber,
          currentTeamAvgMmr: slotAvgMmr,
          replacedPlayerMmr: replacedPlayerMmrLookup,
          currentPlayerCount: session.currentPlayerCount,
          targetAvgMmr: session.targetAvgMmr,
          maxDeviation: session.maxDeviation,
        },
        queuePositions
      );
      scoreMap = new Map(scored.map((s) => [s.playerId, s.subScore]));
    } else {
      // Multi-slot: score candidates against each slot, take best score per candidate
      scoreMap = new Map();

      for (const slot of openSlots) {
        const slotTeamId = (slot as typeof slot & { slotTeamId?: string | null })?.slotTeamId ?? session.teamId;
        const replacedPlayerId = slot.replacedPlayerId ?? session.replacedPlayerId;

        const slotTeam = await prisma.team.findUnique({
          where: { id: slotTeamId },
          select: { player1Id: true, player2Id: true, player3Id: true, player4Id: true, player5Id: true },
        });
        const slotPlayerIds = slotTeam
          ? [slotTeam.player1Id, slotTeam.player2Id, slotTeam.player3Id, slotTeam.player4Id, slotTeam.player5Id].filter(Boolean) as string[]
          : [];
        const slotPlayers = slotPlayerIds.length > 0
          ? await prisma.player.findMany({ where: { id: { in: slotPlayerIds } }, select: { mmr: true } })
          : [];
        const slotAvgMmr = slotPlayers.length > 0
          ? Math.round(slotPlayers.reduce((s, p) => s + p.mmr, 0) / slotPlayers.length)
          : session.currentTeamAvgMmr;

        const replacedPlayerMmrLookup = replacedPlayerId
          ? (await prisma.player.findUnique({ where: { id: replacedPlayerId }, select: { mmr: true } }))?.mmr ?? session.replacedPlayerMmr
          : session.replacedPlayerMmr;

        const scored = scoreCandidates(
          poolEntries as unknown as SubstitutionPoolEntry[],
          {
            neededRole: slot.neededRole as RoleNumber,
            currentTeamAvgMmr: slotAvgMmr,
            replacedPlayerMmr: replacedPlayerMmrLookup,
            currentPlayerCount: session.currentPlayerCount,
            targetAvgMmr: session.targetAvgMmr,
            maxDeviation: session.maxDeviation,
          },
          queuePositions
        );

        for (const s of scored) {
          const prev = scoreMap.get(s.playerId) ?? 0;
          if (s.subScore > prev) scoreMap.set(s.playerId, s.subScore);
        }
      }

      // Fallback: if no open slots matched, use session-level context
      if (scoreMap.size === 0) {
        const scored = scoreCandidates(
          poolEntries as unknown as SubstitutionPoolEntry[],
          {
            neededRole: session.neededRole as RoleNumber,
            currentTeamAvgMmr: session.currentTeamAvgMmr,
            replacedPlayerMmr: session.replacedPlayerMmr,
            currentPlayerCount: session.currentPlayerCount,
            targetAvgMmr: session.targetAvgMmr,
            maxDeviation: session.maxDeviation,
          },
          queuePositions
        );
        for (const s of scored) scoreMap.set(s.playerId, s.subScore);
      }
    }

    // Inject computed subScores into responses before serialisation
    for (const r of activeWave.responses) {
      (r as typeof r & { subScore: number | null }).subScore = scoreMap.get(r.playerId) ?? null;
    }
  }

  // Enrich slots with replacedPlayerMmr and slotCurrentTeamAvgMmr for client-side scoring
  for (const slot of session.slots) {
    if (slot.replacedPlayerId) {
      const rp = await prisma.player.findUnique({ where: { id: slot.replacedPlayerId }, select: { mmr: true } });
      (slot as typeof slot & { replacedPlayerMmr?: number | null }).replacedPlayerMmr = rp?.mmr ?? null;
    }
    if (!slot.assignedPlayerId) {
      const teamId = slot.slotTeamId ?? session.teamId;
      const team = await prisma.team.findUnique({
        where: { id: teamId },
        select: { player1Id: true, player2Id: true, player3Id: true, player4Id: true, player5Id: true },
      });
      const playerIds = team
        ? [team.player1Id, team.player2Id, team.player3Id, team.player4Id, team.player5Id].filter(Boolean) as string[]
        : [];
      const players = playerIds.length > 0
        ? await prisma.player.findMany({ where: { id: { in: playerIds } }, select: { mmr: true } })
        : [];
      (slot as typeof slot & { slotCurrentTeamAvgMmr?: number }).slotCurrentTeamAvgMmr = players.length > 0
        ? Math.round(players.reduce((s, p) => s + p.mmr, 0) / players.length)
        : session.currentTeamAvgMmr;
    }
  }

  return NextResponse.json({ session });
}

/** DELETE /api/judge/active-session?teamId=X  — отмена сессии */
export async function DELETE(req: NextRequest) {
  const teamId = req.nextUrl.searchParams.get("teamId");
  if (!teamId) return NextResponse.json({ error: "teamId required" }, { status: 400 });

  const session = await prisma.substitutionSearchSession.findFirst({
    where: {
      OR: [
        { teamId, status: "Active" },
        { awayTeamId: teamId, status: "Active" },
      ],
    },
  });
  if (!session) return NextResponse.json({ error: "Нет активной сессии" }, { status: 404 });

  await prisma.substitutionSearchSession.update({
    where: { id: session.id },
    data: { status: "Cancelled" },
  });
  return NextResponse.json({ ok: true, sessionId: session.id });
}
