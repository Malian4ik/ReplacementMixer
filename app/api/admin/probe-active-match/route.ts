import { NextResponse } from "next/server";
import { adminLogin, getAdminHeaders } from "@/services/admin-source.service";

const BASE = process.env.ADMIN_SOURCE_URL ?? "";

function extractField(row: string, fieldName: string): string {
  const m = row.match(new RegExp(`class="field-${fieldName}[^"]*"[^>]*>([\\s\\S]*?)<\\/(?:td|th)>`));
  if (!m) return "";
  return m[1].replace(/<[^>]+>/g, "").trim().replace(/\s+/g, " ");
}

export async function GET() {
  if (!BASE) return NextResponse.json({ error: "ADMIN_SOURCE_URL not set" }, { status: 500 });

  try { await adminLogin(); } catch (e) {
    return NextResponse.json({ error: `Login failed: ${e}` }, { status: 500 });
  }

  const candidates = [
    `${BASE}/admin/tournaments/game/?status=active`,
    `${BASE}/admin/tournaments/game/?status=Active`,
    `${BASE}/admin/tournaments/game/?status=in_progress`,
    `${BASE}/admin/tournaments/game/`,
  ];

  const results = [];

  for (const url of candidates) {
    let res: Response;
    try { res = await fetch(url, { headers: getAdminHeaders() as HeadersInit }); }
    catch (e) { results.push({ url, error: String(e) }); continue; }
    if (!res.ok) { results.push({ url, httpStatus: res.status }); continue; }

    const html = await res.text();
    const listMatch = html.match(/id="result_list"[^>]*>([\s\S]*)/);
    if (!listMatch) { results.push({ url, error: "no result_list found", htmlSnippet: html.slice(0, 300) }); continue; }

    const rows = [...listMatch[1].matchAll(/<tr[^>]*class="[^"]*row[^"]*"[^>]*>([\s\S]*?)<\/tr>/g)];
    const rowData = rows.slice(0, 10).map(([, row]) => {
      const idMatch = row.match(/\/admin\/tournaments\/game\/(\d+)\/change\//);
      // Collect ALL field-* classes in this row
      const fieldMatches = [...row.matchAll(/class="field-([^"\s]+)/g)].map(m => m[1]);
      return {
        gameId: idMatch?.[1] ?? null,
        fields: fieldMatches,
        colored_status: extractField(row, "colored_status"),
        status: extractField(row, "status"),
        get_status_display: extractField(row, "get_status_display"),
        team_1_name: extractField(row, "team_1_name"),
        team_2_name: extractField(row, "team_2_name"),
        home_team: extractField(row, "home_team"),
        away_team: extractField(row, "away_team"),
        round: extractField(row, "round"),
        slot: extractField(row, "slot"),
      };
    });

    results.push({ url, httpStatus: res.status, rowCount: rows.length, rows: rowData });

    // Stop after first URL that returns rows
    if (rows.length > 0) break;
  }

  return NextResponse.json({ base: BASE, results });
}
