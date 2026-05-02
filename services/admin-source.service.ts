/**
 * Клиент для работы с Django-админкой турнира (HTML scraping).
 * Env vars:
 *   ADMIN_SOURCE_URL      — базовый URL (напр. https://admin.mixer-cup.gg)
 *   ADMIN_SOURCE_USERNAME — логин
 *   ADMIN_SOURCE_PASSWORD — пароль
 */

const BASE = process.env.ADMIN_SOURCE_URL ?? "";
const USERNAME = process.env.ADMIN_SOURCE_USERNAME ?? "";
const PASSWORD = process.env.ADMIN_SOURCE_PASSWORD ?? "";

let sessionCookie: string | null = null;

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function adminLogin(): Promise<void> {
  if (!BASE) throw new Error("ADMIN_SOURCE_URL not configured");

  // 1. GET login page → CSRF token + csrftoken cookie
  const loginPageRes = await fetch(`${BASE}/admin/login/`);
  const loginHtml = await loginPageRes.text();

  const csrfMatch = loginHtml.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/);
  if (!csrfMatch) throw new Error("CSRF token not found on login page");
  const csrfToken = csrfMatch[1];

  const setCookieHeader = loginPageRes.headers.get("set-cookie") ?? "";
  const csrfCookieMatch = setCookieHeader.match(/csrftoken=([^;]+)/);
  const csrfCookie = csrfCookieMatch?.[1] ?? "";

  // 2. POST login form — Django returns 302 with sessionid
  const loginRes = await fetch(`${BASE}/admin/login/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Referer": `${BASE}/admin/login/`,
      "Cookie": `csrftoken=${csrfCookie}`,
    },
    body: new URLSearchParams({
      csrfmiddlewaretoken: csrfToken,
      username: USERNAME,
      password: PASSWORD,
      next: "/admin/",
    }).toString(),
    redirect: "manual",
  });

  const respCookies = loginRes.headers.get("set-cookie") ?? "";
  const sessionMatch = respCookies.match(/sessionid=([^;]+)/);
  if (!sessionMatch) {
    throw new Error(`ADMIN_LOGIN_FAILED: status=${loginRes.status}, no sessionid cookie returned`);
  }

  sessionCookie = `sessionid=${sessionMatch[1]}; csrftoken=${csrfCookie}`;
}

function makeHeaders(): HeadersInit {
  const h: Record<string, string> = {
    Accept: "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
  };
  if (sessionCookie) h["Cookie"] = sessionCookie;
  return h;
}

/** Returns auth headers for the current admin session (login first if needed). */
export function getAdminHeaders(): HeadersInit {
  return makeHeaders();
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AdminTournamentInfo {
  id: string | number;
  name: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  participantCount?: number;
}

export interface AdminParticipant {
  nick: string;
  mmr?: number;
  mainRole?: number;
  wallet?: string;
  telegramId?: string;
  discordId?: string;
  tournamentStatus?: string;
  queuePosition?: number;
  qualifyRating?: number;
  bidSize?: number;
  balance?: number;
  team?: string;
}

export interface AdminTeamInfo {
  id: string;
  name: string;
  modelSlug?: string;
}

// ─── Tournament list ──────────────────────────────────────────────────────────

export async function fetchTournaments(): Promise<AdminTournamentInfo[]> {
  const res = await fetch(`${BASE}/admin/tournaments/tournament/`, { headers: makeHeaders() });
  if (!res.ok) throw new Error(`fetchTournaments failed: ${res.status}`);
  return parseTournamentList(await res.text());
}

/** Extract text from a field-{name} cell (handles plain text and <a>-wrapped text) */
function fieldText(row: string, fieldName: string): string {
  const cellMatch = row.match(
    new RegExp(`class="field-${fieldName}[^"]*"[^>]*>([\\s\\S]*?)<\\/(?:td|th)>`)
  );
  if (!cellMatch) return "";
  // Strip all HTML tags, collapse whitespace
  return cellMatch[1].replace(/<[^>]+>/g, "").trim().replace(/\s+/g, " ");
}

function parseTournamentList(html: string): AdminTournamentInfo[] {
  const listMatch = html.match(/id="result_list"[^>]*>([\s\S]*)/);
  if (!listMatch) return [];

  const tournaments: AdminTournamentInfo[] = [];
  for (const [, row] of [...listMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]) {
    // ID from the detail page href
    const idMatch = row.match(/\/admin\/tournaments\/tournament\/(\d+)\/change\//);
    if (!idMatch) continue;

    tournaments.push({
      id: idMatch[1],
      name: fieldText(row, "name"),
      status: fieldText(row, "status") || undefined,
      startDate: fieldText(row, "start_time") || undefined,
      endDate: fieldText(row, "end_time") || undefined,
    });
  }
  return tournaments;
}

// ─── Participant list (paginated) ─────────────────────────────────────────────

interface RawListParticipant {
  nick: string;
  uuid: string;
  tournamentStatus: string;
  bidSize: number | undefined;
  balance: number | undefined;
  queuePosition: number | undefined;
  team: string | undefined;
}

async function fetchParticipantPage(
  tournamentId: string | number,
  page: number
): Promise<{ items: RawListParticipant[]; hasMore: boolean }> {
  const url = `${BASE}/admin/tournaments/participant/?tournament__id__exact=${tournamentId}&p=${page}`;
  const res = await fetch(url, { headers: makeHeaders() });
  if (!res.ok) throw new Error(`fetchParticipants page=${page} failed: ${res.status}`);
  const html = await res.text();

  const listMatch = html.match(/id="result_list"[^>]*>([\s\S]*)/);
  if (!listMatch) return { items: [], hasMore: false };

  const items: RawListParticipant[] = [];
  for (const [, row] of [...listMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]) {
    // Nickname is in <th class="field-nickname"> data-label="Nickname"><a>TEXT</a></th>
    const nickMatch = row.match(
      /class="field-nickname[^"]*"[^>]*data-label="Nickname"[^>]*><a[^>]*>([^<]*)<\/a><\/th>/
    );
    if (!nickMatch) continue;
    const nick = nickMatch[1].trim();

    const uuidMatch = row.match(/\/admin\/tournaments\/participant\/([0-9a-f-]{36})\//);
    if (!uuidMatch) continue;

    // Status is field-colored_status in this Django admin theme
    const statusText = fieldText(row, "colored_status") || fieldText(row, "status");
    const queueStr = fieldText(row, "queue_position");
    const bidStr = fieldText(row, "bid_size");
    const balStr = fieldText(row, "balance");
    const teamText = fieldText(row, "team") || fieldText(row, "team_name") || fieldText(row, "team__name");

    items.push({
      nick,
      uuid: uuidMatch[1],
      tournamentStatus: statusText || "",
      bidSize: bidStr ? parseFloat(bidStr) : undefined,
      balance: balStr ? parseFloat(balStr) : undefined,
      queuePosition: queueStr && queueStr !== "-" ? parseInt(queueStr, 10) : undefined,
      team: teamText || undefined,
    });
  }

  // Next page link: Django uses ?p=N params; check if there's a link for p=(page+1)
  const nextPage = page + 1;
  const hasMore =
    new RegExp(`[?&]p=${nextPage}[&"]`).test(html) ||
    (new RegExp(`[?&]p=${nextPage}&amp;`).test(html));

  return { items, hasMore };
}

// ─── Participant detail (qualifyRating + user UUID) ───────────────────────────

interface ParticipantDetail {
  qualifyRating: number | undefined;
  userUuid: string | undefined;
  wallet: string | undefined;
  mainRole: number | undefined;
}

async function fetchParticipantDetail(uuid: string): Promise<ParticipantDetail> {
  const res = await fetch(
    `${BASE}/admin/tournaments/participant/${uuid}/change/`,
    { headers: makeHeaders() }
  );
  if (!res.ok) return { qualifyRating: undefined, userUuid: undefined, wallet: undefined, mainRole: undefined };
  const html = await res.text();

  const qrMatch = html.match(/name="qualify_rating"[^>]*value="([^"]*)"/);
  const userMatch = html.match(/href="\/admin\/users\/user\/([0-9a-f-]{36})\/change\/"/);

  // Try to find wallet on participant page
  const walletMatch =
    html.match(/name="wallet"[^>]*value="([^"]+)"/) ??
    html.match(/name="wallet_address"[^>]*value="([^"]+)"/) ??
    html.match(/name="ton_wallet"[^>]*value="([^"]+)"/) ??
    html.match(/name="crypto_wallet"[^>]*value="([^"]+)"/);

  // Extract preferred_roles from participant page (checkbox, select, or FilteredSelectMultiple)
  let roleValue: string | undefined;
  for (const m of html.matchAll(/<input[^>]*>/gi)) {
    const tag = m[0];
    if (/name="preferred_roles"/i.test(tag) && /\bchecked\b/i.test(tag)) {
      roleValue = tag.match(/value="([^"]*)"/i)?.[1];
      if (roleValue) break;
    }
  }
  if (!roleValue) {
    const selectMatch = html.match(/<select[^>]*name="preferred_roles"[^>]*>([\s\S]*?)<\/select>/i);
    if (selectMatch) {
      const optMatch =
        selectMatch[1].match(/<option[^>]*value="([^"]*)"[^>]*\bselected\b/i) ??
        selectMatch[1].match(/<option[^>]*\bselected\b[^>]*value="([^"]*)"/i);
      roleValue = optMatch?.[1];
    }
  }
  if (!roleValue) {
    const toSelectMatch = html.match(/<select[^>]*name="preferred_roles_to"[^>]*>([\s\S]*?)<\/select>/i);
    if (toSelectMatch) {
      roleValue = toSelectMatch[1].match(/<option[^>]*value="([^"]*)"/i)?.[1];
    }
  }

  const userUuid = userMatch?.[1];

  // Debug: log all field-* CSS classes for first 1 participant miss
  if (!roleValue && _debugRoleMissCount < 1) {
    _debugRoleMissCount++;
    const fieldClasses = [...new Set([...html.matchAll(/class="[^"]*field-([a-z0-9_]+)[^"]*"/gi)].map(m => m[1]))];
    console.log(`[fetchParticipantDetail] field-* classes:`, JSON.stringify(fieldClasses.slice(0, 60)));
  }

  return {
    qualifyRating: qrMatch?.[1] ? parseFloat(qrMatch[1]) : undefined,
    userUuid,
    wallet: walletMatch?.[1]?.trim() || undefined,
    mainRole: roleValue ? ROLE_MAP[roleValue] : undefined,
  };
}

// ─── User detail (mmr, role, telegram, discord) ───────────────────────────────

let _debugRoleMissCount = 0;
let _debugUserFieldsCount = 0;

const ROLE_MAP: Record<string, number> = {
  CARRY: 1,
  MIDLANER: 2,
  OFFLANER: 3,
  SOFT_SUPPORT: 4,
  HARD_SUPPORT: 5,
};

interface UserDetail {
  mmr: number | undefined;
  mainRole: number | undefined;
  telegramId: string | undefined;
  discordId: string | undefined;
  wallet: string | undefined;
}

async function fetchUserDetail(userUuid: string): Promise<UserDetail> {
  const res = await fetch(
    `${BASE}/admin/users/user/${userUuid}/change/`,
    { headers: makeHeaders() }
  );
  if (!res.ok) return { mmr: undefined, mainRole: undefined, telegramId: undefined, discordId: undefined, wallet: undefined };
  const html = await res.text();

  const ratingMatch = html.match(/name="rating"[^>]*value="([^"]*)"/);

  // preferred_roles is a checkbox group — find the first checked one
  // Robust parsing: scan all <input> tags, check both attribute orderings
  let checkedRoleValue: string | undefined;

  // Try 1: <input type="checkbox" name="preferred_roles" value="X" checked>
  for (const m of html.matchAll(/<input[^>]*>/gi)) {
    const tag = m[0];
    if (/name="preferred_roles"/i.test(tag) && /\bchecked\b/i.test(tag)) {
      checkedRoleValue = tag.match(/value="([^"]*)"/i)?.[1];
      if (checkedRoleValue) break;
    }
  }

  // Try 2: <select name="preferred_roles"><option value="X" selected>
  if (!checkedRoleValue) {
    const selectMatch = html.match(/<select[^>]*name="preferred_roles"[^>]*>([\s\S]*?)<\/select>/i);
    if (selectMatch) {
      const optMatch =
        selectMatch[1].match(/<option[^>]*value="([^"]*)"[^>]*\bselected\b/i) ??
        selectMatch[1].match(/<option[^>]*\bselected\b[^>]*value="([^"]*)"/i);
      checkedRoleValue = optMatch?.[1];
    }
  }

  // Try 3: Django FilteredSelectMultiple — selected values appear in the "_to" select
  if (!checkedRoleValue) {
    const toSelectMatch = html.match(/<select[^>]*name="preferred_roles_to"[^>]*>([\s\S]*?)<\/select>/i);
    if (toSelectMatch) {
      const firstOption = toSelectMatch[1].match(/<option[^>]*value="([^"]*)"/i);
      checkedRoleValue = firstOption?.[1];
    }
  }

  // Try 4: readonly display — <div class="field-preferred_roles">...<div class="readonly">CARRY</div>
  if (!checkedRoleValue) {
    const fieldBlock = html.match(/class="[^"]*field-preferred_roles[^"]*"[\s\S]{0,400}?(?:<div[^>]*class="[^"]*readonly[^"]*"[^>]*>([\s\S]*?)<\/div>|<p[^>]*>([\s\S]*?)<\/p>)/i);
    if (fieldBlock) {
      const raw = (fieldBlock[1] ?? fieldBlock[2] ?? "").replace(/<[^>]+>/g, "").trim();
      checkedRoleValue = raw.split(/[,\s]+/)[0].toUpperCase() || undefined;
    }
  }

  // Try 5: role value appears anywhere in HTML as standalone word
  if (!checkedRoleValue) {
    for (const roleKey of Object.keys(ROLE_MAP)) {
      const ctx = html.match(new RegExp(`.{0,80}\\b${roleKey}\\b.{0,80}`, "i"))?.[0]?.replace(/\s+/g, " ");
      if (ctx) {
        checkedRoleValue = roleKey;
        break;
      }
    }
  }

  // Debug: first 1 user miss — log where each ROLE_MAP key appears in HTML
  if (!checkedRoleValue && _debugUserFieldsCount < 1) {
    _debugUserFieldsCount++;
    for (const roleKey of Object.keys(ROLE_MAP)) {
      const ctx = html.match(new RegExp(`.{0,80}\\b${roleKey}\\b.{0,80}`, "i"))?.[0]?.replace(/\s+/g, " ");
      if (ctx) { console.log(`[fetchUserDetail] found "${roleKey}" in HTML:`, ctx); }
    }
    if (!Object.keys(ROLE_MAP).some(k => new RegExp(`\\b${k}\\b`, "i").test(html))) {
      console.log(`[fetchUserDetail] NONE of ROLE_MAP keys found in HTML`);
    }
  }

  const checkedRoleMatch = checkedRoleValue ? [null, checkedRoleValue] : null;
  const telegramMatch = html.match(/name="telegram"\s+[^>]*value="([^"]*)"/);
  const discordMatch = html.match(/name="discord_id"[^>]*value="([^"]*)"/);
  // eos_account is used as the player wallet in this platform
  const eosMatch = html.match(/name="eos_account"[^>]*value="([^"]+)"/);

  return {
    mmr: ratingMatch?.[1] ? parseInt(ratingMatch[1], 10) : undefined,
    mainRole: checkedRoleMatch?.[1] ? ROLE_MAP[checkedRoleMatch[1]] : undefined,
    telegramId: telegramMatch?.[1]?.trim() || undefined,
    discordId: discordMatch?.[1]?.trim() || undefined,
    wallet: eosMatch?.[1]?.trim() || undefined,
  };
}

// ─── Concurrent batch helper ──────────────────────────────────────────────────

async function batchMap<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>
): Promise<(R | null)[]> {
  const results: (R | null)[] = new Array(items.length).fill(null);
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const settled = await Promise.allSettled(batch.map(fn));
    for (let j = 0; j < settled.length; j++) {
      const s = settled[j];
      results[i + j] = s.status === "fulfilled" ? s.value : null;
    }
  }
  return results;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/** Получить всех участников турнира с полными данными */
export async function fetchAllParticipants(
  tournamentId: string | number
): Promise<AdminParticipant[]> {
  _debugRoleMissCount = 0; // reset per-import
  _debugUserFieldsCount = 0;
  // 1. Collect all pages of participant list
  const rawList: RawListParticipant[] = [];
  let page = 1;
  while (true) {
    const { items, hasMore } = await fetchParticipantPage(tournamentId, page);
    rawList.push(...items);
    if (!hasMore || page >= 50) break;
    page++;
  }

  // 2. Fetch participant details (qualifyRating + userUuid) in batches of 8
  const details = await batchMap(rawList, 8, (p) => fetchParticipantDetail(p.uuid));

  // 3. Fetch user details (mmr, role, telegram, discord) in batches of 8
  const userUuids = details.map((d) => d?.userUuid ?? null);
  const uniqueUuids = [...new Set(userUuids.filter(Boolean) as string[])];
  const userDetailMap = new Map<string, UserDetail>();

  const userDetails = await batchMap(uniqueUuids, 8, (uuid) => fetchUserDetail(uuid));
  for (let i = 0; i < uniqueUuids.length; i++) {
    const ud = userDetails[i];
    if (ud) userDetailMap.set(uniqueUuids[i], ud);
  }

  // 4. Merge everything
  const withRole = rawList.filter((_, i) => {
    const detail = details[i];
    const userUuid = detail?.userUuid;
    return (userUuid ? userDetailMap.get(userUuid)?.mainRole : undefined) != null
      || detail?.mainRole != null;
  }).length;
  console.log(`[fetchAllParticipants] total=${rawList.length} withUserUuid=${userUuids.filter(Boolean).length} withRole=${withRole}`);

  return rawList.map((raw, i) => {
    const detail = details[i];
    const userUuid = detail?.userUuid;
    const user = userUuid ? userDetailMap.get(userUuid) : undefined;

    return {
      nick: raw.nick,
      tournamentStatus: raw.tournamentStatus || undefined,
      bidSize: raw.bidSize,
      balance: raw.balance,
      queuePosition: raw.queuePosition,
      qualifyRating: detail?.qualifyRating,
      mmr: user?.mmr ?? detail?.qualifyRating, // fallback: use qualifyRating as mmr
      mainRole: user?.mainRole ?? detail?.mainRole,
      telegramId: user?.telegramId,
      discordId: user?.discordId,
      wallet: user?.wallet || detail?.wallet,
      team: raw.team,
    };
  });
}

// ─── Participant UUID→nick map (for team member resolution) ──────────────────

/** Build a uuid→nick map from participant list pages (no detail fetches). */
export async function buildParticipantUuidNickMap(
  tournamentId: string | number
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let page = 1;
  while (true) {
    const { items, hasMore } = await fetchParticipantPage(tournamentId, page);
    for (const p of items) map.set(p.uuid, p.nick);
    if (!hasMore || page >= 50) break;
    page++;
  }
  return map;
}

// ─── Participant statuses (lightweight — list pages only, no detail fetches) ──

/** Returns nick + tournamentStatus for every participant in a tournament.
 *  Much faster than fetchAllParticipants — only reads list pages. */
export async function fetchParticipantStatuses(
  tournamentId: string | number
): Promise<{ nick: string; tournamentStatus: string }[]> {
  const result: { nick: string; tournamentStatus: string }[] = [];
  let page = 1;
  while (true) {
    const { items, hasMore } = await fetchParticipantPage(tournamentId, page);
    result.push(...items.map((p) => ({ nick: p.nick, tournamentStatus: p.tournamentStatus })));
    if (!hasMore || page >= 50) break;
    page++;
  }
  return result;
}

// ─── Waiting list (Bid participants ordered by queue position) ────────────────

/** Returns nick + queuePosition for all "Bid" status participants, sorted by queue position. */
export async function fetchWaitingList(
  tournamentId: string | number
): Promise<{ nick: string; queuePosition: number | null }[]> {
  const all: RawListParticipant[] = [];
  let page = 1;
  while (true) {
    const { items, hasMore } = await fetchParticipantPage(tournamentId, page);
    all.push(...items);
    if (!hasMore || page >= 50) break;
    page++;
  }
  return all
    .filter(p => /bid/i.test(p.tournamentStatus ?? ""))
    .sort((a, b) => (a.queuePosition ?? 999999) - (b.queuePosition ?? 999999))
    .map(p => ({ nick: p.nick, queuePosition: p.queuePosition ?? null }));
}

// ─── Team list ────────────────────────────────────────────────────────────────

// Known URL patterns for team model in Django admin (tried in order)
const TEAM_URL_CANDIDATES = [
  "tournaments/team",           // confirmed URL
  "tournaments/tournamentteam",
  "tournament/team",
  "teams/team",
];

/** Discover all model URLs on the Django admin home page, looking for team-related entries. */
async function discoverTeamUrl(): Promise<string | null> {
  const res = await fetch(`${BASE}/admin/`, { headers: makeHeaders() });
  if (!res.ok) return null;
  const html = await res.text();

  // Django admin home lists models as <a href="/admin/app/model/">Name</a>
  // Find any link whose text or path contains "team" or "команд" (case-insensitive)
  const linkRe = /<a\s+href="(\/admin\/[^"]+\/)"[^>]*>([^<]*)<\/a>/gi;
  for (const [, href, label] of html.matchAll(linkRe)) {
    const lo = label.toLowerCase();
    const hlo = href.toLowerCase();
    if (
      lo.includes("команд") || lo.includes("team") ||
      hlo.includes("team") || lo.includes("group") || hlo.includes("group")
    ) {
      // Strip trailing slash + extract path without /admin/ prefix
      return href.replace(/^\/admin\//, "").replace(/\/$/, "");
    }
  }
  return null;
}

/** Scrape teams from the Django admin for a specific tournament.
 *  Step 1: fetch page 1 without filter to discover the Django tournament ID from row links.
 *  Step 2: re-fetch with ?tournament__id__exact={djangoId} to get only that tournament's teams.
 *  Fallback: filter client-side by tournament name if Django ID can't be determined. */
export async function fetchTournamentTeams(
  _tournamentId: string | number,
  tournamentName?: string
): Promise<AdminTeamInfo[]> {
  const discovered = await discoverTeamUrl();
  const candidates = discovered
    ? [discovered, ...TEAM_URL_CANDIDATES.filter(c => c !== discovered)]
    : TEAM_URL_CANDIDATES;

  for (const path of candidates) {
    const modelSlug = path.split("/").pop()!;
    const baseUrl = `${BASE}/admin/${path}/`;

    // Step 1: fetch first page to discover Django tournament ID from field-tournament link
    const firstRes = await fetch(baseUrl, { headers: makeHeaders() });
    if (!firstRes.ok) continue;
    const firstHtml = await firstRes.text();

    // Extract Django tournament ID from a row whose tournament name matches
    let djangoTournamentId: string | null = null;
    const listMatch = firstHtml.match(/id="result_list"[^>]*>([\s\S]*)/);
    if (listMatch && tournamentName) {
      for (const [, row] of [...listMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]) {
        const rowTournamentText = fieldText(row, "tournament");
        if (tournamentName && !rowTournamentText.toLowerCase().includes(tournamentName.toLowerCase().slice(0, 15))) continue;
        // Extract Django tournament ID from the href in field-tournament cell
        const cellMatch = row.match(/class="field-tournament[^"]*"[^>]*>([\s\S]*?)<\/td>/);
        const idFromLink = cellMatch?.[1]?.match(/\/admin\/[^/]+\/tournament\/(\d+)\/change\//)?.[1];
        if (idFromLink) { djangoTournamentId = idFromLink; break; }
      }
    }

    const fetchAllPages = async (qsBase: string) => {
      const allTeams: AdminTeamInfo[] = [];
      let page = 1;
      while (true) {
        const url = `${baseUrl}${qsBase}${qsBase ? "&" : "?"}p=${page}`;
        const res = page === 1 && !qsBase ? firstRes : await fetch(
          page === 1 ? `${baseUrl}${qsBase}` : url, { headers: makeHeaders() }
        );
        const html = page === 1 && !qsBase ? firstHtml : (res.ok ? await res.text() : "");
        if (!html) break;
        const pageTeams = parseTeamList(html, modelSlug);
        allTeams.push(...pageTeams);
        const hasMore = new RegExp(`[?&]p=${page + 1}[&"]`).test(html) ||
          new RegExp(`[?&]p=${page + 1}&amp;`).test(html);
        if (!hasMore || page >= 20) break;
        page++;
      }
      return allTeams;
    };

    let allTeams: AdminTeamInfo[];

    if (djangoTournamentId) {
      // Use exact Django tournament filter
      allTeams = await fetchAllPages(`?tournament__id__exact=${djangoTournamentId}`);
    } else {
      // Fetch all and filter client-side by tournament name
      allTeams = await fetchAllPages("");
      if (tournamentName) {
        // We need tournament text per team — re-parse with tournament field
        allTeams = filterTeamsByTournamentName(firstHtml, modelSlug, tournamentName);
        // TODO: handle multiple pages if needed
      }
    }

    if (allTeams.length > 0) return allTeams;
  }
  return [];
}

function filterTeamsByTournamentName(html: string, modelSlug: string, tournamentName: string): AdminTeamInfo[] {
  const listMatch = html.match(/id="result_list"[^>]*>([\s\S]*)/);
  if (!listMatch) return [];
  const HEADER_LABELS = new Set(["name of the team", "название", "name", "команда"]);
  const needle = tournamentName.toLowerCase().slice(0, 20);
  const teams: AdminTeamInfo[] = [];
  let idx = 0;
  for (const [, row] of [...listMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]) {
    const rowTournament = fieldText(row, "tournament").toLowerCase();
    if (!rowTournament.includes(needle)) continue;
    const name = fieldText(row, "name") || fieldText(row, "title") || fieldText(row, "team_name");
    if (!name || HEADER_LABELS.has(name.toLowerCase())) continue;
    const slugPattern = new RegExp(`/admin/[^/]+/${modelSlug}/([0-9a-f-]{8,}|\\d+)/change/`);
    const idMatch = row.match(slugPattern) ?? row.match(ADMIN_ID_RE);
    const id = idMatch?.[1] ?? `__idx_${idx++}`;
    teams.push({ id, name, modelSlug });
  }
  return teams;
}

// Matches both numeric IDs and UUIDs in Django admin URLs
const ADMIN_ID_RE = /\/admin\/[^/]+\/[^/]+\/([0-9a-f-]{8,}|\d+)\/change\//;

function parseTeamList(html: string, modelSlug: string): AdminTeamInfo[] {
  const listMatch = html.match(/id="result_list"[^>]*>([\s\S]*)/);
  if (!listMatch) return [];

  const HEADER_LABELS = new Set(["name of the team", "название", "name", "команда"]);

  const teams: AdminTeamInfo[] = [];
  let idx = 0;
  for (const [, row] of [...listMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]) {
    // Team name comes from field-name cell (confirmed by probe)
    const name = fieldText(row, "name") || fieldText(row, "title") || fieldText(row, "team_name");
    if (!name) continue;
    // Skip column-header rows
    if (HEADER_LABELS.has(name.toLowerCase())) continue;

    // Try to get ID from a change link (may not exist if Django admin has no list_display_links)
    const slugPattern = new RegExp(`/admin/[^/]+/${modelSlug}/([0-9a-f-]{8,}|\\d+)/change/`);
    const idMatch = row.match(slugPattern) ?? row.match(ADMIN_ID_RE);
    // Use extracted ID or fall back to an index (members won't be fetched but name will be saved)
    const id = idMatch?.[1] ?? `__idx_${idx++}`;

    teams.push({ id, name, modelSlug });
  }
  return teams;
}

/** Scrape member nicks from a team's detail page.
 *  Tries two methods:
 *  1. Inline text "Участник {nick} in «...»" (Russian Django admin inline)
 *  2. Participant UUID links resolved via uuidToNick map */
export async function fetchTeamMemberNicks(
  teamId: string,
  uuidToNick: Map<string, string>,
  modelSlug = "team"
): Promise<string[]> {
  // Try candidate detail URLs
  const urlCandidates = [
    `${BASE}/admin/tournaments/${modelSlug}/${teamId}/change/`,
    `${BASE}/admin/tournaments/tournamentteam/${teamId}/change/`,
    `${BASE}/admin/tournaments/team/${teamId}/change/`,
  ];

  // Deduplicate candidates
  const seenUrls = new Set<string>();
  const uniqueCandidates = urlCandidates.filter(u => seenUrls.has(u) ? false : (seenUrls.add(u), true));

  let html = "";
  for (const url of uniqueCandidates) {
    const res = await fetch(url, { headers: makeHeaders() });
    if (res.ok) { html = await res.text(); break; }
  }
  if (!html) return [];

  const nicks: string[] = [];
  const seen = new Set<string>();

  // Method 1: inline Russian text "Участник {nick} in «…»"
  for (const [, nick] of html.matchAll(/Участник\s+(\S+)\s+in\s+/g)) {
    if (!seen.has(nick)) { seen.add(nick); nicks.push(nick); }
  }
  if (nicks.length > 0) return nicks;

  // Method 2: participant UUID href links → resolve via map
  for (const [, uuid] of html.matchAll(/\/admin\/tournaments\/participant\/([0-9a-f-]{36})\//g)) {
    if (seen.has(uuid)) continue;
    seen.add(uuid);
    const nick = uuidToNick.get(uuid);
    if (nick) nicks.push(nick);
  }
  return nicks;
}

// ─── Match schedule ───────────────────────────────────────────────────────────

export interface AdminMatchInfo {
  round: number;
  homeTeam: string;
  awayTeam: string;
  scheduledAt: Date | null;
  endsAt: Date | null;
  adminStatus?: string;
}

function parseRoundNumber(s: string): number {
  if (!s) return 0;
  const m = s.match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

const EN_MONTHS: Record<string, number> = {
  January: 0, February: 1, March: 2, April: 3, May: 4, June: 5,
  July: 6, August: 7, September: 8, October: 9, November: 10, December: 11,
};

/** Parse a datetime string from Django admin display (multiple formats). */
function parseAdminDateTime(s: string): Date | null {
  if (!s || s === "-" || s.trim() === "") return null;
  s = s.trim().replace(/\s+/g, " ");

  // ISO-like: "2026-05-01 18:00:00" or "2026-05-01T18:00:00"
  let d = new Date(s.replace(" ", "T"));
  if (!isNaN(d.getTime())) return d;

  // English Django format: "May 1, 2026, 2 p.m." or "May 1, 2026, 2:30 p.m."
  // Admin timezone is MSK (UTC+3), so subtract 3h when storing as UTC
  const en = s.match(/(\w+)\s+(\d+),\s*(\d{4}),?\s+([\d]+)(?::(\d+))?\s*(a\.m\.|p\.m\.)/i);
  if (en) {
    const month = EN_MONTHS[en[1]];
    if (month !== undefined) {
      const day = parseInt(en[2]);
      const year = parseInt(en[3]);
      let hour = parseInt(en[4]);
      const min = parseInt(en[5] ?? "0");
      const isPM = en[6].toLowerCase().startsWith("p");
      if (isPM && hour !== 12) hour += 12;
      if (!isPM && hour === 12) hour = 0;
      // Store as UTC: MSK is UTC+3, so subtract 3 hours
      d = new Date(Date.UTC(year, month, day, hour - 3, min));
      if (!isNaN(d.getTime())) return d;
    }
  }

  // Russian format: "01.05.2026 18:00" or "01.05.2026, 18:00"
  const ru = s.match(/(\d{2})\.(\d{2})\.(\d{4})[,\s]+(\d{2}):(\d{2})/);
  if (ru) {
    const [, dd, mm, yyyy, hh, mmin] = ru;
    d = new Date(`${yyyy}-${mm}-${dd}T${hh}:${mmin}:00`);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

async function fetchMatchPage(
  _tournamentId: string | number,
  page: number,
  baseUrl: string
): Promise<{ items: AdminMatchInfo[]; hasMore: boolean }> {
  // No tournament filter — filter param names vary and the stored externalId may differ from Django's PK
  const url = page === 1 ? baseUrl : `${baseUrl}?p=${page}`;
  const res = await fetch(url, { headers: makeHeaders() });
  if (!res.ok) return { items: [], hasMore: false };
  const html = await res.text();

  const listMatch = html.match(/id="result_list"[^>]*>([\s\S]*)/);
  if (!listMatch) return { items: [], hasMore: false };

  const items: AdminMatchInfo[] = [];
  for (const [, row] of [...listMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]) {
    // Round number — try common field names
    const roundStr =
      fieldText(row, "round") ||
      fieldText(row, "round__number") ||
      fieldText(row, "round_number") ||
      fieldText(row, "tour");
    const round = parseRoundNumber(roundStr);

    // Home team — confirmed: field-team_1_name; also try legacy names
    const homeTeam =
      fieldText(row, "team_1_name") ||
      fieldText(row, "home_team") ||
      fieldText(row, "home_team__name") ||
      fieldText(row, "team1") ||
      fieldText(row, "team1__name") ||
      fieldText(row, "home");

    // Away team — confirmed: field-team_2_name
    const awayTeam =
      fieldText(row, "team_2_name") ||
      fieldText(row, "away_team") ||
      fieldText(row, "away_team__name") ||
      fieldText(row, "team2") ||
      fieldText(row, "team2__name") ||
      fieldText(row, "away");

    // Start time — confirmed: field-planned_time
    const startStr =
      fieldText(row, "planned_time") ||
      fieldText(row, "start_time") ||
      fieldText(row, "scheduled_at") ||
      fieldText(row, "begin_time") ||
      fieldText(row, "start");

    // End time
    const endStr =
      fieldText(row, "end_time") ||
      fieldText(row, "ends_at") ||
      fieldText(row, "finish_time") ||
      fieldText(row, "end");

    if (!homeTeam && !awayTeam) continue; // skip header/empty rows

    const adminStatus = fieldText(row, "status") || fieldText(row, "colored_status") || "";

    items.push({
      round,
      homeTeam,
      awayTeam,
      scheduledAt: parseAdminDateTime(startStr),
      endsAt: parseAdminDateTime(endStr),
      adminStatus,
    });
  }

  const nextPage = page + 1;
  const hasMore =
    new RegExp(`[?&]p=${nextPage}[&"]`).test(html) ||
    new RegExp(`[?&]p=${nextPage}&amp;`).test(html);

  return { items, hasMore };
}

const SCHEDULE_URL_CANDIDATES = [
  `${BASE}/admin/tournaments/game/`,      // confirmed URL
  `${BASE}/admin/tournaments/match/`,
  `${BASE}/admin/tournaments/matchup/`,
  `${BASE}/admin/tournaments/round/`,
  `${BASE}/admin/tournaments/schedule/`,
];

/** Discover schedule/match model URL from the Django admin home page. */
async function discoverScheduleUrl(): Promise<string | null> {
  const res = await fetch(`${BASE}/admin/`, { headers: makeHeaders() });
  if (!res.ok) return null;
  const html = await res.text();
  const linkRe = /<a\s+href="(\/admin\/[^"]+\/)"[^>]*>([^<]*)<\/a>/gi;
  for (const [, href, label] of html.matchAll(linkRe)) {
    const lo = label.toLowerCase();
    const hlo = href.toLowerCase();
    if (
      lo.includes("матч") || lo.includes("match") || lo.includes("расписан") ||
      lo.includes("schedule") || lo.includes("игр") || lo.includes("game") ||
      hlo.includes("match") || hlo.includes("game") || hlo.includes("schedule")
    ) {
      return `${BASE}${href}`;
    }
  }
  return null;
}

/** Fetch all match schedule rows for a tournament.
 *  Auto-discovers the URL from /admin/ home, then tries known patterns. */
export async function fetchTournamentScheduleData(
  tournamentId: string | number
): Promise<AdminMatchInfo[]> {
  const discovered = await discoverScheduleUrl();
  const candidates = discovered
    ? [discovered, ...SCHEDULE_URL_CANDIDATES.filter(u => u !== discovered)]
    : SCHEDULE_URL_CANDIDATES;

  for (const baseUrl of candidates) {
    const all: AdminMatchInfo[] = [];
    let page = 1;
    while (true) {
      const { items, hasMore } = await fetchMatchPage(tournamentId, page, baseUrl);
      all.push(...items);
      if (!hasMore || page >= 100) break;
      page++;
    }
    if (all.length > 0) return all;
  }
  return [];
}
