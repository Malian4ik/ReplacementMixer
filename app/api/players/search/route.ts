import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (!q.trim()) return NextResponse.json([]);

  const all = await prisma.player.findMany({
    where: { isActiveInDatabase: true },
    orderBy: { mmr: "desc" },
  });
  const players = all.filter((p) =>
    p.nick.toLowerCase().includes(q.toLowerCase())
  ).slice(0, 20);
  return NextResponse.json(players);
}
