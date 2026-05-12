import { NextResponse } from "next/server";
import { adminLogin, getAdminHeaders } from "@/services/admin-source.service";

const BASE = process.env.ADMIN_SOURCE_URL ?? "";
const MAY1 = new Date("2026-05-01T00:00:00Z");

function fieldText(row: string, fieldName: string): string {
  const cellMatch = row.match(
    new RegExp(`class="field-${fieldName}[^"]*"[^>]*>([\\s\\S]*?)<\\/(?:td|th)>`)
  );
  if (!cellMatch) return "";
  return cellMatch[1].replace(/<[^>]+>/g, "").trim().replace(/\s+/g, " ");
}

interface GameRow {
  matchId:    string;
  homeTeam:   string;
  awayTeam:   string;
  status:     string;
  result:     string;
  plannedTime: string;
}

function parseGamesPage(html: string): GameRow[] {
  const listMatch = html.match(/id="result_list"[^>]*>([\s\S]*)/);
  if (!listMatch) return [];
  const rows: GameRow[] = [];
  for (const [, row] of [...listMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]) {
    const homeTeam = fieldText(row, "team_1_name");
    const awayTeam = fieldText(row, "team_2_name");
    if (!homeTeam && !awayTeam) continue;
    rows.push({
      matchId:    fieldText(row, "match_id"),
      homeTeam,
      awayTeam,
      status:     fieldText(row, "status"),
      result:     fieldText(row, "result"),
      plannedTime: fieldText(row, "planned_time"),
    });
  }
  return rows;
}

export async function GET() {
  try {
    await adminLogin();
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }

  const headers = getAdminHeaders() as HeadersInit;
  const baseUrl = `${BASE}/admin/tournaments/game/`;
  const all: GameRow[] = [];
  let page = 1;

  while (page <= 50) {
    const url = page === 1 ? baseUrl : `${baseUrl}?p=${page}`;
    const res = await fetch(url, { headers });
    if (!res.ok) break;
    const html = await res.text();
    const rows = parseGamesPage(html);
    if (rows.length === 0) break;
    all.push(...rows);
    const hasMore =
      new RegExp(`[?&]p=${page + 1}[&"]`).test(html) ||
      new RegExp(`[?&]p=${page + 1}&amp;`).test(html);
    if (!hasMore) break;
    page++;
  }

  // Filter: only completed matches since May 1 with actual result
  const completed = all.filter(r => {
    const status = r.status.toLowerCase();
    const hasMay = r.plannedTime.includes("2026") && (
      r.plannedTime.includes("May") ||
      r.plannedTime.includes("June") ||
      r.plannedTime.match(/0[5-9]\.2026|1[0-2]\.2026/)
    );
    return status !== "pending" && status !== "scheduled" && r.result && r.result !== "-";
  });

  return NextResponse.json({ total: all.length, completed: completed.length, games: all });
}
