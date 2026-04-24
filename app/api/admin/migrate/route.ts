import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const MIGRATIONS = [
  {
    name: "player_matchesPlayed",
    sql: "ALTER TABLE Player ADD COLUMN matchesPlayed INTEGER NOT NULL DEFAULT 0",
  },
  {
    name: "session_slotsNeeded",
    sql: "ALTER TABLE ReplacementSearchSession ADD COLUMN slotsNeeded INTEGER NOT NULL DEFAULT 1",
  },
  {
    name: "session_activeMatchId",
    sql: "ALTER TABLE ReplacementSearchSession ADD COLUMN activeMatchId TEXT",
  },
  {
    name: "wave_startsAt",
    sql: "ALTER TABLE ReplacementWave ADD COLUMN startsAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP",
  },
  { name: "slot_slotTeamId", sql: "ALTER TABLE SubstitutionSlot ADD COLUMN slotTeamId TEXT" },
  { name: "slot_slotTeamName", sql: "ALTER TABLE SubstitutionSlot ADD COLUMN slotTeamName TEXT" },
  { name: "session_awayTeamId", sql: "ALTER TABLE ReplacementSearchSession ADD COLUMN awayTeamId TEXT" },
  { name: "session_awayTeamName", sql: "ALTER TABLE ReplacementSearchSession ADD COLUMN awayTeamName TEXT" },
  {
    name: "create_SubstitutionSlot",
    sql: `CREATE TABLE IF NOT EXISTS SubstitutionSlot (
      id TEXT NOT NULL PRIMARY KEY,
      sessionId TEXT NOT NULL,
      slotIndex INTEGER NOT NULL,
      replacedPlayerId TEXT,
      replacedPlayerNick TEXT,
      neededRole INTEGER NOT NULL,
      teamSlot INTEGER NOT NULL,
      assignedPlayerId TEXT,
      assignedPoolEntryId TEXT,
      assignedAt DATETIME,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sessionId) REFERENCES ReplacementSearchSession(id)
    )`,
  },
];

export async function POST() {
  const results: { name: string; status: "ok" | "skipped" | "error"; detail?: string }[] = [];

  for (const m of MIGRATIONS) {
    try {
      await prisma.$executeRawUnsafe(m.sql);
      results.push({ name: m.name, status: "ok" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // "duplicate column name" or "table already exists" → already applied
      if (
        msg.toLowerCase().includes("duplicate column") ||
        msg.toLowerCase().includes("already exists")
      ) {
        results.push({ name: m.name, status: "skipped", detail: "already applied" });
      } else {
        results.push({ name: m.name, status: "error", detail: msg });
      }
    }
  }

  const hasError = results.some((r) => r.status === "error");
  return NextResponse.json({ ok: !hasError, results }, { status: hasError ? 500 : 200 });
}
