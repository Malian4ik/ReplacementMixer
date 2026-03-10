import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const CreateLogSchema = z.object({
  actionType: z.enum(["Assign", "Return", "AddToPool"]),
  matchId: z.string().optional(),
  teamId: z.string().optional(),
  teamName: z.string().optional(),
  neededRole: z.number().int().min(1).max(5).optional(),
  replacedPlayerId: z.string().optional(),
  replacedPlayerNick: z.string().optional(),
  replacedPlayerMmr: z.number().optional(),
  replacementPlayerId: z.string().optional(),
  replacementPlayerNick: z.string().optional(),
  replacementPlayerMmr: z.number().optional(),
  judgeName: z.string().optional(),
  comment: z.string().optional(),
  resultStatus: z.string(),
  poolEntryId: z.string().optional(),
});

export async function DELETE() {
  try {
    await prisma.matchReplacementLog.deleteMany({});
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  const logs = await prisma.matchReplacementLog.findMany({
    orderBy: { timestamp: "desc" },
    take: 200,
  });
  return NextResponse.json(logs);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = CreateLogSchema.parse(body);
    const log = await prisma.matchReplacementLog.create({ data });
    return NextResponse.json(log, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Bad request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
