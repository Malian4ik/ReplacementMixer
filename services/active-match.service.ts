/**
 * Fetches the currently active tournament match.
 *
 * Primary source: admin.mixer-cup.gg HTML scraping.
 * Fallback: local TournamentMatch table with status = "Active".
 *
 * Results are cached for 2 minutes in memory.
 */

import { adminLogin, getAdminHeaders } from "./admin-source.service";
import { prisma } from "@/lib/prisma";

const BASE = process.env.ADMIN_SOURCE_URL ?? "";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ActiveGamePlayer {
  id: string;
  nick: string;
  role: number;
  mmr: number;
  discordId: string | null;
}

export interface ActiveGameTeam {
  id: string;
  name: string;
  avgMmr: number;
  players: (ActiveGamePlayer | null)[];
}

export interface QueueEntry {
  playerId: string;
  nick: string;
  position: number;
}

export interface ActiveGame {
  id: string;
  round: number;
  slot: number;
  homeTeam: ActiveGameTeam;
  awayTeam: ActiveGameTeam;
  substituteQueue: QueueEntry[];
}

// ── In-memory cache ────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 2 * 60 * 1000;
let cacheData: ActiveGame | null = null;
let cacheFetchedAt = 0;

function cacheValid(): boolean {
  return !!cacheData && Date.now() - cacheFetchedAt < CACHE_TTL_MS;
}

export function invalidateActiveGameCache(): void {
  cacheFetchedAt = 0;
}

// ── HTML helpers ───────────────────────────────────────────────────────────────

function extractField(row: string, fieldName: string): string {
  const m = row.match(
    new RegExp(`class="field-${fieldName}[^"]*"[^>]*>([\\s\\S]*?)<\\/(?:td|th)>`)
  );
  if (!m) return "";
  return m[1].replace(/<[^>]+>/g, "").trim().replace(/\s+/g, " ");
}

// ── Admin scraping ─────────────────────────────────────────────────────────────

interface RawGame {
  id: string;
  round: number;
  slot: number;
  homeTeamName: string;
  awayTeamName: string;
}

async function fetchRawGameFromAdmin(): Promise<RawGame | null> {
  if (!BASE) return null;

  // Ensure auth. If admin returns login page, re-login.
  try {
    const probe = await fetch(`${BASE}/admin/`, { headers: getAdminHeaders(), redirect: "manual" });
    if (probe.status === 302 || probe.url?.includes("/login/")) {
      await adminLogin();
    }
  } catch {
    try { await adminLogin(); } catch { return null; }
  }

  // Try to get active games from the game list.
  // NOTE: URL and field names must match the actual Django admin structure.
  // Adjust the URL and field selectors if they differ in production.
  const url = `${BASE}/admin/tournaments/game/?status=active&o=-1`;
  let res: Response;
  try {
    res = await fetch(url, { headers: getAdminHeaders() });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const html = await res.text();
  const listMatch = html.match(/id="result_list"[^>]*>([\s\S]*)/);
  if (!listMatch) return null;

  const rowMatch = listMatch[1].match(/<tr[^>]*class="[^"]*row[^"]*"[^>]*>([\s\S]*?)<\/tr>/);
  if (!rowMatch) return null;

  const row = rowMatch[1];
  const idMatch = row.match(/\/admin\/tournaments\/game\/(\d+)\/change\//);
  if (!idMatch) return null;

  return {
    id: idMatch[1],
    round: parseInt(extractField(row, "round"), 10) || 0,
    slot: parseInt(extractField(row, "slot"), 10) || 0,
    homeTeamName: extractField(row, "home_team") || extractField(row, "home"),
    awayTeamName: extractField(row, "away_team") || extractField(row, "away"),
  };
}

// ── DB fallback ────────────────────────────────────────────────────────────────

async function fetchRawGameFromDB(): Promise<RawGame | null> {
  const match = await prisma.tournamentMatch.findFirst({
    where: { status: "Active" },
    orderBy: { scheduledAt: "desc" },
  });
  if (!match) return null;

  return {
    id: String(match.id),
    round: match.round,
    slot: match.slot,
    homeTeamName: match.homeTeam,
    awayTeamName: match.awayTeam,
  };
}

// ── Team enrichment (look up team + players in Prisma) ────────────────────────

async function buildTeam(teamName: string): Promise<ActiveGameTeam | null> {
  const team = await prisma.team.findFirst({
    where: { name: teamName },
  });
  if (!team) return null;

  const slotIds = [
    team.player1Id,
    team.player2Id,
    team.player3Id,
    team.player4Id,
    team.player5Id,
  ];
  const nonNull = slotIds.filter((id): id is string => !!id);

  const players =
    nonNull.length > 0
      ? await prisma.player.findMany({
          where: { id: { in: nonNull } },
          select: { id: true, nick: true, mainRole: true, discordId: true, mmr: true },
        })
      : [];

  const playerMap = new Map(players.map((p) => [p.id, p]));

  const slots: (ActiveGamePlayer | null)[] = slotIds.map((id) => {
    if (!id) return null;
    const p = playerMap.get(id);
    if (!p) return null;
    return { id: p.id, nick: p.nick, role: p.mainRole, discordId: p.discordId ?? null, mmr: p.mmr };
  });

  const nonNullSlots = slots.filter((p): p is ActiveGamePlayer => !!p);
  const avgMmr = nonNullSlots.length > 0
    ? Math.round(nonNullSlots.reduce((s, p) => s + p.mmr, 0) / nonNullSlots.length)
    : 0;

  return { id: team.id, name: team.name, players: slots, avgMmr };
}

// ── Substitute queue (from reserve pool, ordered by joinTime) ──────────────────

async function fetchSubstituteQueue(): Promise<QueueEntry[]> {
  const entries = await prisma.substitutionPoolEntry.findMany({
    where: {
      status: "Active",
      player: { isDisqualified: false, isActiveInDatabase: true },
    },
    include: { player: { select: { id: true, nick: true } } },
    orderBy: { joinTime: "asc" },
    take: 100,
  });

  return entries.map((e, i) => ({
    playerId: e.playerId,
    nick: e.player.nick,
    position: i + 1,
  }));
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function fetchActiveGame(): Promise<ActiveGame | null> {
  if (cacheValid()) return cacheData;

  let raw: RawGame | null = null;

  if (BASE) {
    try {
      raw = await fetchRawGameFromAdmin();
    } catch (err) {
      console.error("[active-match] admin scraping failed:", err);
    }
  }

  if (!raw) {
    try {
      raw = await fetchRawGameFromDB();
    } catch (err) {
      console.error("[active-match] DB fallback failed:", err);
    }
  }

  if (!raw) {
    cacheData = null;
    cacheFetchedAt = Date.now();
    return null;
  }

  const [homeTeam, awayTeam, substituteQueue] = await Promise.all([
    buildTeam(raw.homeTeamName),
    buildTeam(raw.awayTeamName),
    fetchSubstituteQueue(),
  ]);

  if (!homeTeam || !awayTeam) {
    // Teams not found in our DB — can't show roster
    cacheData = null;
    cacheFetchedAt = Date.now();
    return null;
  }

  cacheData = { id: raw.id, round: raw.round, slot: raw.slot, homeTeam, awayTeam, substituteQueue };
  cacheFetchedAt = Date.now();
  return cacheData;
}
