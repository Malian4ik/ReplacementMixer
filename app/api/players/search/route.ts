import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (!q.trim()) return NextResponse.json([]);

  const players = await prisma.player.findMany({
    where: {
      nick: { contains: q },
      isActiveInDatabase: true,
    },
    take: 20,
    orderBy: { mmr: "desc" },
  });
  return NextResponse.json(players);
}
