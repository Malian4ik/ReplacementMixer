import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const results: string[] = [];

  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Player" ADD COLUMN "steamAccountId" TEXT`
    );
    results.push("Player.steamAccountId — добавлен");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.toLowerCase().includes("duplicate column") || msg.includes("already exists")) {
      results.push("Player.steamAccountId — уже существует");
    } else {
      results.push(`Player.steamAccountId — ошибка: ${msg}`);
    }
  }

  return NextResponse.json({ ok: true, results });
}
