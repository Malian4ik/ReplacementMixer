import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const UpdatePlayerSchema = z.object({
  nick: z.string().min(1).optional(),
  mmr: z.number().int().min(0).optional(),
  stake: z.number().int().min(0).optional(),
  mainRole: z.number().int().min(1).max(5).optional(),
  flexRole: z.number().int().min(1).max(5).nullable().optional(),
  telegramId: z.string().nullable().optional(),
  wallet: z.string().nullable().optional(),
  nightMatches: z.number().int().min(0).optional(),
  isActiveInDatabase: z.boolean().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const player = await prisma.player.findUnique({ where: { id } });
  if (!player) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(player);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await req.json();
    const data = UpdatePlayerSchema.parse(body);
    const player = await prisma.player.update({ where: { id }, data });
    return NextResponse.json(player);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Bad request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await prisma.player.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Bad request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
