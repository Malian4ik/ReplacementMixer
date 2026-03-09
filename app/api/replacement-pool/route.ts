import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addPlayerToReplacementPool } from "@/services/pool.service";
import { z } from "zod";

const AddToPoolSchema = z.object({
  playerId: z.string(),
  source: z.enum(["reduction", "manual_add", "returned", "transferred_from_main_pool"]),
  judgeName: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const where = status ? { status } : {};

  const entries = await prisma.replacementPoolEntry.findMany({
    where,
    include: { player: true },
    orderBy: [{ status: "asc" }, { joinTime: "asc" }],
  });
  return NextResponse.json(entries);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { playerId, source, judgeName } = AddToPoolSchema.parse(body);
    const entry = await addPlayerToReplacementPool(playerId, source, judgeName);
    return NextResponse.json(entry, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Bad request";
    if (msg === "DUPLICATE") {
      return NextResponse.json({ error: "Player already active in pool" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
