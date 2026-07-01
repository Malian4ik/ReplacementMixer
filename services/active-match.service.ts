/**
 * Fetches the currently active tournament match.
 *
 * Primary source: admin.mixer-cup.gg HTML scraping.
 * Fallback: local TournamentMatch table with status = "Active".
 *
 * Results are cached briefly in memory.
 */

import { adminLogin, getAdminHeaders } from "./admin-source.service";
import { prisma } from "@/lib/prisma";

const BASE = process.env.ADMIN_SOURCE_URL?.trim() ?? "";

// в”Ђв”Ђ Types в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

export interface ActiveGamePlayer {
  id: string;
  nick: string;
  role: number;
  flexRole: number | null;
  mmr: number;
  discordId: string | null;
  wallet: string | null;
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

// в”Ђв”Ђ In-memory cache в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

const CACHE_TTL_MS = 15 * 1000;
let cacheData: ActiveGame | null = null;
let cacheFetchedAt = 0;

function cacheValid(): boolean {
  return !!cacheData && Date.now() - cacheFetchedAt < CACHE_TTL_MS;
}

export function invalidateActiveGameCache(): void {
  cacheFetchedAt = 0;
}

// в”Ђв”Ђ HTML helpers в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

function extractField(row: string, fieldName: string): string {
  const m = row.match(
    new RegExp(`class="field-${fieldName}[^"]*"[^>]*>([\\s\\S]*?)<\\/(?:td|th)>`)
  );
  if (!m) return "";
  return m[1].replace(/<[^>]+>/g, "").trim().replace(/\s+/g, " ");
}

// в”Ђв”Ђ Admin scraping в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

interface RawGame {
  id: string;
  round: number;
  slot: number;
  homeTeamName: string;
  awayTeamName: string;
}

function parseRowToGame(row: string): RawGame | null {
  // Match both numeric IDs and UUID-style IDs
  const idMatch = row.match(/\/admin\/tournaments\/game\/([\w-]+)\/change\//);
  if (!idMatch) return null;
  const homeTeamName =
    extractField(row, "team_1_name") ||
    extractField(row, "home_team") ||
    extractField(row, "home");
  const awayTeamName =
    extractField(row, "team_2_name") ||
    extractField(row, "away_team") ||
    extractField(row, "away");
  if (!homeTeamName || !awayTeamName) return null;
  return {
    id: idMatch[1],
    round: parseInt(extractField(row, "round"), 10) || 0,
    slot: parseInt(extractField(row, "slot"), 10) || 0,
    homeTeamName,
    awayTeamName,
  };
}

function isAdminStatusActive(row: string): boolean {
  const status =
    extractField(row, "colored_status") ||
    extractField(row, "status") ||
    extractField(row, "get_status_display") || "";
  // Match both Latin and Cyrillic admin labels.
  return (
    /activ|live|in.prog/i.test(status) ||
    status.includes("Актив") ||
    status.includes("Идёт") ||
    status.includes("Идет") ||
    status.includes("В игре") ||
    status.includes("Запущ")
  );
}

async function fetchRawGameFromAdmin(): Promise<RawGame | null> {
  const games = await fetchRawGamesFromAdmin();
  return games[0] ?? null;
}

async function fetchRawGamesFromAdmin(): Promise<RawGame[]> {
  if (!BASE) return [];

  try {
    await adminLogin();
  } catch {
    return [];
  }

  // Unfiltered list sorted by status ascending (column 4) вЂ” "РђРєС‚РёРІРЅС‹Р№" sorts first in Russian alphabet
  // Also try first 3 pages in case the active match is not on page 1
  const candidates = [
    `${BASE}/admin/tournaments/game/?o=4`,      // sort by status asc в†’ РђРєС‚РёРІРЅС‹Р№ first
    `${BASE}/admin/tournaments/game/?o=4&p=2`,
    `${BASE}/admin/tournaments/game/?o=4&p=3`,
    `${BASE}/admin/tournaments/game/`,           // fallback: default ordering
    `${BASE}/admin/tournaments/game/?p=2`,
    `${BASE}/admin/tournaments/game/?p=3`,
  ];

  const activeGames: RawGame[] = [];
  const otherGames: RawGame[] = [];
  const seen = new Set<string>();

  for (const url of candidates) {
    let res: Response;
    try { res = await fetch(url, { headers: getAdminHeaders(), cache: "no-store" }); }
    catch { continue; }
    if (!res.ok) continue;

    const html = await res.text();
    const listMatch = html.match(/id="result_list"[^>]*>([\s\S]*)/);
    if (!listMatch) continue;

    for (const [, row] of [...listMatch[1].matchAll(/<tr[^>]*class="[^"]*row[^"]*"[^>]*>([\s\S]*?)<\/tr>/g)]) {
      const game = parseRowToGame(row);
      if (!game) continue;
      if (seen.has(game.id)) continue;
      seen.add(game.id);
      if (isAdminStatusActive(row)) activeGames.push(game);
      else otherGames.push(game);
    }
  }

  return [...activeGames, ...otherGames];
}

// в”Ђв”Ђ DB fallback в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

async function fetchRawGameFromDB(): Promise<RawGame | null> {
  const now = new Date();
  // Priority: explicitly marked "Live", then time-based live (within window and Scheduled)
  const match = await prisma.tournamentMatch.findFirst({
    where: {
      OR: [
        { status: "Live", endsAt: { gte: now } },
        { status: "Active", endsAt: { gte: now } },
        {
          status: "Scheduled",
          scheduledAt: { lte: now },
          endsAt: { gte: now },
        },
      ],
    },
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

// в”Ђв”Ђ Team enrichment (look up team + players in Prisma) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

async function buildTeam(teamName: string): Promise<ActiveGameTeam | null> {
  let team = await prisma.team.findFirst({
    where: { name: teamName },
  });

  // Team names in admin are usually based on captain/current nick.
  // If a captain changes nick, local imported team may still have the old name.
  if (!team && teamName.startsWith("Team ")) {
    const captainNick = teamName.slice(5).trim();
    const captain = await prisma.player.findFirst({
      where: { nick: captainNick },
      select: { id: true },
    });
    if (captain) {
      team = await prisma.team.findFirst({
        where: {
          OR: [
            { player1Id: captain.id },
            { player2Id: captain.id },
            { player3Id: captain.id },
            { player4Id: captain.id },
            { player5Id: captain.id },
          ],
        },
      });
    }
  }

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
          select: { id: true, nick: true, mainRole: true, flexRole: true, discordId: true, mmr: true, wallet: true },
        })
      : [];

  const playerMap = new Map(players.map((p) => [p.id, p]));

  const slots: (ActiveGamePlayer | null)[] = slotIds.map((id) => {
    if (!id) return null;
    const p = playerMap.get(id);
    if (!p) return null;
    return { id: p.id, nick: p.nick, role: p.mainRole, flexRole: p.flexRole ?? null, discordId: p.discordId ?? null, mmr: p.mmr, wallet: p.wallet ?? null };
  });

  const nonNullSlots = slots.filter((p): p is ActiveGamePlayer => !!p);
  const avgMmr = nonNullSlots.length > 0
    ? Math.round(nonNullSlots.reduce((s, p) => s + p.mmr, 0) / nonNullSlots.length)
    : 0;

  return { id: team.id, name: teamName, players: slots, avgMmr };
}

// в”Ђв”Ђ Substitute queue (from reserve pool, ordered by joinTime) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

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

// в”Ђв”Ђ Public API в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

export async function fetchActiveGame(): Promise<ActiveGame | null> {
  if (cacheValid()) return cacheData;

  let raw: RawGame | null = null;
  let homeTeam: ActiveGameTeam | null = null;
  let awayTeam: ActiveGameTeam | null = null;
  let substituteQueue: QueueEntry[] = [];
  let adminHadCandidates = false;

  if (BASE) {
    try {
      const adminGames = await fetchRawGamesFromAdmin();
      adminHadCandidates = adminGames.length > 0;
      for (const candidate of adminGames) {
        const [candidateHome, candidateAway, candidateQueue] = await Promise.all([
          buildTeam(candidate.homeTeamName),
          buildTeam(candidate.awayTeamName),
          fetchSubstituteQueue(),
        ]);

        if (candidateHome && candidateAway) {
          raw = candidate;
          homeTeam = candidateHome;
          awayTeam = candidateAway;
          substituteQueue = candidateQueue;
          break;
        }

        console.warn("[active-match] admin candidate teams not found", {
          homeTeamName: candidate.homeTeamName,
          awayTeamName: candidate.awayTeamName,
          homeFound: !!candidateHome,
          awayFound: !!candidateAway,
        });
      }
    } catch (err) {
      console.error("[active-match] admin scraping failed:", err);
    }
  }

  if (!raw && !adminHadCandidates) {
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

  if (!homeTeam || !awayTeam) {
    [homeTeam, awayTeam, substituteQueue] = await Promise.all([
      buildTeam(raw.homeTeamName),
      buildTeam(raw.awayTeamName),
      fetchSubstituteQueue(),
    ]);
  }

  if (!homeTeam || !awayTeam) {
    console.warn("[active-match] teams not found for active match", {
      source: "db",
      homeTeamName: raw.homeTeamName,
      awayTeamName: raw.awayTeamName,
      homeFound: !!homeTeam,
      awayFound: !!awayTeam,
    });

    if (!homeTeam || !awayTeam) {
      cacheData = null;
      cacheFetchedAt = Date.now();
      return null;
    }
  }

  cacheData = { id: raw.id, round: raw.round, slot: raw.slot, homeTeam, awayTeam, substituteQueue };
  cacheFetchedAt = Date.now();
  return cacheData;
}
