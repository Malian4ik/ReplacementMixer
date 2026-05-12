import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/substitution-pool/dedup
// For each player with multiple Active pool entries, keep the best one and delete the rest.
// "Best" = lowest adminQueuePosition (null treated as last), then latest joinTime.
export async function POST() {
  const allActive = await prisma.substitutionPoolEntry.findMany({
    where: { status: "Active" },
    orderBy: [{ joinTime: "asc" }],
  });

  // Group by playerId
  const byPlayer = new Map<string, typeof allActive>();
  for (const e of allActive) {
    if (!byPlayer.has(e.playerId)) byPlayer.set(e.playerId, []);
    byPlayer.get(e.playerId)!.push(e);
  }

  const toDelete: string[] = [];
  for (const [, entries] of byPlayer) {
    if (entries.length <= 1) continue;

    // Sort: lowest adminQueuePosition first (null = worst), then latest joinTime
    entries.sort((a, b) => {
      const aq = a.adminQueuePosition ?? 999999;
      const bq = b.adminQueuePosition ?? 999999;
      if (aq !== bq) return aq - bq;
      return b.joinTime.getTime() - a.joinTime.getTime();
    });

    // Keep first, delete the rest
    for (const dup of entries.slice(1)) {
      toDelete.push(dup.id);
    }
  }

  if (toDelete.length > 0) {
    await prisma.substitutionPoolEntry.deleteMany({ where: { id: { in: toDelete } } });
  }

  return NextResponse.json({
    uniquePlayers: byPlayer.size,
    duplicatesRemoved: toDelete.length,
    remaining: allActive.length - toDelete.length,
  });
}
