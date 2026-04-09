import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ensureJudgeAccess } from "@/app/api/discord/replacement-search/shared";
import { getSearchSessionWithRelations } from "@/services/replacement-search.repository";
import { startReplacementSearch } from "@/services/replacement-search.service";

const StartSchema = z.object({
  teamId: z.string(),
  replacedPlayerId: z.string().optional(),
  neededRole: z.number().int().min(1).max(5).optional(),
  matchId: z.string().optional(),
  comment: z.string().optional(),
  judgeName: z.string().min(1),
});

export async function GET(req: NextRequest) {
  const authError = await ensureJudgeAccess();
  if (authError) return authError;

  const teamId = req.nextUrl.searchParams.get("teamId");
  const sessionId = req.nextUrl.searchParams.get("sessionId");

  if (!teamId && !sessionId) {
    return NextResponse.json({ error: "teamId or sessionId is required" }, { status: 400 });
  }

  const session = sessionId
    ? await getSearchSessionWithRelations(sessionId)
    : teamId
      ? await prisma.replacementSearchSession.findFirst({
          where: {
            teamId,
            status: { in: ["IN_PROGRESS", "WAITING_CONFIRMATION"] },
          },
          orderBy: { startedAt: "desc" },
          include: {
            team: true,
            recommendedPlayer: true,
            selectedPlayer: true,
            waves: {
              include: {
                candidates: true,
                responses: true,
              },
              orderBy: { waveNumber: "asc" },
            },
          },
        })
      : null;

  return NextResponse.json(session);
}

export async function POST(req: NextRequest) {
  try {
    const authError = await ensureJudgeAccess();
    if (authError) return authError;

    const body = StartSchema.parse(await req.json());
    const replacementsChannelId = process.env.DISCORD_REPLACEMENTS_CHANNEL_ID;
    if (!replacementsChannelId) {
      return NextResponse.json({ error: "DISCORD_REPLACEMENTS_CHANNEL_ID is not configured" }, { status: 500 });
    }

    const session = await startReplacementSearch(
      {
        teamQuery: body.teamId,
        replacedPlayerQuery: body.replacedPlayerId,
        neededRole: body.neededRole,
        matchId: body.matchId,
        comment: body.comment,
        triggeredByDiscordUserId: "website",
        triggeredByName: body.judgeName,
        replacementsChannelId,
      }
    );

    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
