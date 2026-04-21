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

    items.push({
      nick,
      uuid: uuidMatch[1],
      tournamentStatus: statusText || "",
      bidSize: bidStr ? parseFloat(bidStr) : undefined,
      balance: balStr ? parseFloat(balStr) : undefined,
      queuePosition: queueStr && queueStr !== "-" ? parseInt(queueStr, 10) : undefined,
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
}

async function fetchParticipantDetail(uuid: string): Promise<ParticipantDetail> {
  const res = await fetch(
    `${BASE}/admin/tournaments/participant/${uuid}/change/`,
    { headers: makeHeaders() }
  );
  if (!res.ok) return { qualifyRating: undefined, userUuid: undefined };
  const html = await res.text();

  const qrMatch = html.match(/name="qualify_rating"[^>]*value="([^"]*)"/);
  const userMatch = html.match(/href="\/admin\/users\/user\/([0-9a-f-]{36})\/change\/"/);

  return {
    qualifyRating: qrMatch?.[1] ? parseFloat(qrMatch[1]) : undefined,
    userUuid: userMatch?.[1],
  };
}

// ─── User detail (mmr, role, telegram, discord) ───────────────────────────────

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
}

async function fetchUserDetail(userUuid: string): Promise<UserDetail> {
  const res = await fetch(
    `${BASE}/admin/users/user/${userUuid}/change/`,
    { headers: makeHeaders() }
  );
  if (!res.ok) return { mmr: undefined, mainRole: undefined, telegramId: undefined, discordId: undefined };
  const html = await res.text();

  const ratingMatch = html.match(/name="rating"[^>]*value="([^"]*)"/);

  // preferred_roles is a checkbox group — find the first checked one
  const checkedRoleMatch = html.match(
    /name="preferred_roles"\s+value="([^"]*)"\s+[^>]*checked/
  );
  const telegramMatch = html.match(/name="telegram"\s+[^>]*value="([^"]*)"/);
  const discordMatch = html.match(/name="discord_id"[^>]*value="([^"]*)"/);

  return {
    mmr: ratingMatch?.[1] ? parseInt(ratingMatch[1], 10) : undefined,
    mainRole: checkedRoleMatch?.[1] ? ROLE_MAP[checkedRoleMatch[1]] : undefined,
    telegramId: telegramMatch?.[1]?.trim() || undefined,
    discordId: discordMatch?.[1]?.trim() || undefined,
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
      mainRole: user?.mainRole,
      telegramId: user?.telegramId,
      discordId: user?.discordId,
    };
  });
}
