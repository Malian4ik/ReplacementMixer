import { load, type CheerioAPI } from "cheerio";
import type {
  RemoteParticipantDetail,
  RemoteParticipantListItem,
  RemoteTournamentSummary,
  RemoteUserProfile,
} from "@/services/admin-source.types";

const DEFAULT_ADMIN_BASE_URL = "https://admin.mixer-cup.gg";

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

function getAdminBaseUrl() {
  return process.env.ADMIN_SOURCE_URL ?? DEFAULT_ADMIN_BASE_URL;
}

function parseCookieValue(setCookieHeader: string) {
  return setCookieHeader.split(";")[0];
}

function extractCookies(response: Response) {
  const header = response.headers.get("set-cookie");
  if (!header) return [];
  return header
    .split(/,(?=[^;]+?=)/)
    .map((part) => parseCookieValue(part.trim()))
    .filter(Boolean);
}

function upsertCookie(existingCookieHeader: string, cookie: string) {
  const [name] = cookie.split("=", 1);
  const parts = existingCookieHeader
    .split(";")
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => !value.startsWith(`${name}=`));
  parts.push(cookie);
  return parts.join("; ");
}

function parseNumber(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized || normalized === "-") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value: string | null) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function cleanText(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() || "";
}

function firstCheckedRole($: CheerioAPI) {
  return $('input[name="preferred_roles"]:checked')
    .map((_, element) => $(element).attr("value") || "")
    .get()
    .filter(Boolean);
}

function mapRoleValueToLocal(role: string) {
  const normalized = role.toUpperCase();
  const mapping: Record<string, 1 | 2 | 3 | 4 | 5> = {
    CARRY: 1,
    MIDLANER: 2,
    OFFLANER: 3,
    SOFT_SUPPORT: 4,
    HARD_SUPPORT: 5,
  };
  return mapping[normalized] ?? 1;
}

function extractFieldValueByName($: CheerioAPI, names: string[]) {
  for (const name of names) {
    const input = $(`[name="${name}"]`);
    if (input.length > 0) {
      const value = input.attr("value") ?? input.text();
      const cleaned = cleanText(value);
      if (cleaned) return cleaned;
    }
  }
  return null;
}

function extractParticipationCount($: CheerioAPI) {
  const text = cleanText($("body").text());
  const match = text.match(/(\d+)\s+\(list all participations\)/i);
  return match ? Number(match[1]) : 0;
}

export class AdminSourceClient {
  private cookieHeader = "";
  private readonly baseUrl = getAdminBaseUrl();
  private authenticated = false;

  private async request(path: string, init?: RequestInit) {
    const response = await fetch(new URL(path, this.baseUrl), {
      redirect: "manual",
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        ...(this.cookieHeader ? { Cookie: this.cookieHeader } : {}),
      },
    });

    for (const cookie of extractCookies(response)) {
      this.cookieHeader = upsertCookie(this.cookieHeader, cookie);
    }

    return response;
  }

  async authenticate() {
    if (this.authenticated) return;

    const username = getRequiredEnv("ADMIN_SOURCE_USERNAME");
    const password = getRequiredEnv("ADMIN_SOURCE_PASSWORD");
    const loginPath = "/admin/login/?next=/admin/tournaments/tournament/";

    const loginPage = await this.request(loginPath, { method: "GET" });
    const loginHtml = await loginPage.text();
    const $ = load(loginHtml);
    const csrfToken = $('input[name="csrfmiddlewaretoken"]').attr("value");

    if (!csrfToken) {
      throw new Error("ADMIN_LOGIN_CSRF_NOT_FOUND");
    }

    const body = new URLSearchParams({
      username,
      password,
      csrfmiddlewaretoken: csrfToken,
      next: "/admin/tournaments/tournament/",
    });

    const loginResponse = await this.request(loginPath, {
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: new URL(loginPath, this.baseUrl).toString(),
      },
    });

    const location = loginResponse.headers.get("location") ?? "";
    if (!location.includes("/admin/tournaments/tournament/")) {
      throw new Error("ADMIN_LOGIN_FAILED");
    }

    this.authenticated = true;
  }

  async listTournaments(): Promise<RemoteTournamentSummary[]> {
    await this.authenticate();
    const response = await this.request("/admin/tournaments/tournament/?o=-1");
    const html = await response.text();
    const $ = load(html);

    const tournaments: RemoteTournamentSummary[] = [];
    $("th.field-id").each((_, cell) => {
      const row = $(cell).closest("tr");
      const href = row.find("th.field-id a").attr("href") ?? "";
      const idMatch = href.match(/\/admin\/tournaments\/tournament\/([^/]+)\/change\//);
      if (!idMatch) return;

      tournaments.push({
        adminTournamentId: idMatch[1],
        name: cleanText(row.find("td.field-name").text()) || `Tournament ${idMatch[1]}`,
        type: cleanText(row.find("td.field-type").text()) || null,
        status: cleanText(row.find("td.field-status").text()) || null,
        applicationTime: parseDate(cleanText(row.find("td.field-application_time").text()) || null),
        startTime: parseDate(cleanText(row.find("td.field-start_time").text()) || null),
        endTime: parseDate(cleanText(row.find("td.field-end_time").text()) || null),
      });
    });

    return tournaments;
  }

  async listTournamentParticipants(adminTournamentId: string): Promise<RemoteParticipantListItem[]> {
    await this.authenticate();
    const response = await this.request(`/admin/tournaments/participant/?tournament=${encodeURIComponent(adminTournamentId)}`);
    const html = await response.text();
    const $ = load(html);

    const participants: RemoteParticipantListItem[] = [];
    $("th.field-nickname").each((_, cell) => {
      const row = $(cell).closest("tr");
      const href = row.find("th.field-nickname a").attr("href") ?? "";
      const match = href.match(/\/admin\/tournaments\/participant\/([^/]+)\/change\//);
      if (!match) return;

      participants.push({
        adminParticipantId: match[1],
        nickname: cleanText(row.find("th.field-nickname").text()),
        tournamentLabel: cleanText(row.find("td.field-tournament").text()),
        status: cleanText(row.find("td.field-colored_status").text()) || null,
        bidSize: parseNumber(cleanText(row.find("td.field-bid_size").text())),
        balance: parseNumber(cleanText(row.find("td.field-balance").text())),
        queuePosition: parseNumber(cleanText(row.find("td.field-queue_position").text())),
      });
    });

    return participants;
  }

  async getParticipantDetail(base: RemoteParticipantListItem): Promise<RemoteParticipantDetail> {
    await this.authenticate();
    const response = await this.request(`/admin/tournaments/participant/${base.adminParticipantId}/change/`);
    const html = await response.text();
    const $ = load(html);

    const userHref = $('a[href*="/admin/users/user/"]')
      .map((_, element) => $(element).attr("href") ?? "")
      .get()
      .find((href) => href.includes("/change/")) ?? "";
    const match = userHref.match(/\/admin\/users\/user\/([^/]+)\/change\//);
    if (!match) {
      throw new Error(`ADMIN_PARTICIPANT_USER_NOT_FOUND:${base.adminParticipantId}`);
    }

    return {
      ...base,
      adminUserId: match[1],
      qualifyRating: parseNumber(extractFieldValueByName($, ["qualify_rating"])),
    };
  }

  async getUserProfile(adminUserId: string): Promise<RemoteUserProfile> {
    await this.authenticate();
    const response = await this.request(`/admin/users/user/${adminUserId}/change/`);
    const html = await response.text();
    const $ = load(html);

    return {
      adminUserId,
      nickname: extractFieldValueByName($, ["nickname"]) ?? "Unknown",
      telegram: extractFieldValueByName($, ["telegram", "telegram_id", "telegram_username"]),
      discordId: extractFieldValueByName($, ["discord", "discord_id", "discordid", "discord_user_id"]),
      wallet: extractFieldValueByName($, ["eos_account", "wallet", "wallet_address"]),
      rating: parseNumber(extractFieldValueByName($, ["rating", "mmr"])),
      preferredRoles: firstCheckedRole($),
      participationCount: extractParticipationCount($),
    };
  }

  mapRemoteRolesToLocal(preferredRoles: string[]) {
    const mapped = preferredRoles.map(mapRoleValueToLocal);
    const [mainRole = 1, flexRole] = mapped;
    return {
      mainRole,
      flexRole: flexRole ?? null,
    };
  }
}
