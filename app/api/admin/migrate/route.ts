import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const results: string[] = [];

  const migrations = [
    { sql: `ALTER TABLE "Player" ADD COLUMN "steamAccountId" TEXT`, label: "Player.steamAccountId" },
    { sql: `ALTER TABLE "TournamentMatch" ADD COLUMN "winnerTeam" TEXT`, label: "TournamentMatch.winnerTeam" },
  ];

  for (const m of migrations) {
    try {
      await prisma.$executeRawUnsafe(m.sql);
      results.push(`${m.label} — добавлен`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes("duplicate column") || msg.includes("already exists")) {
        results.push(`${m.label} — уже существует`);
      } else {
        results.push(`${m.label} — ошибка: ${msg}`);
      }
    }
  }

  return NextResponse.json({ ok: true, results });
}
