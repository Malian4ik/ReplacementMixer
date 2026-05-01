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

    // Collect all unique statuses across all rows
    const allStatuses = new Set<string>();
    const nonPendingRows: object[] = [];

    for (const [, row] of rows) {
      const idMatch = row.match(/\/admin\/tournaments\/game\/(\w[\w-]*)\/change\//);
      // All href patterns in this row
      const hrefs = [...row.matchAll(/href="([^"]+)"/g)].map(m => m[1]).filter(h => h.includes("game"));
      const fieldMatches = [...row.matchAll(/class="field-([^"\s]+)/g)].map(m => m[1]);
      const status = extractField(row, "status");
      const coloredStatus = extractField(row, "colored_status");
      const displayStatus = extractField(row, "get_status_display");
      const anyStatus = coloredStatus || status || displayStatus;
      if (anyStatus) allStatuses.add(anyStatus);

      // Keep any row that is NOT Pending / not empty
      if (anyStatus && !/^pending$/i.test(anyStatus)) {
        nonPendingRows.push({
          gameId: idMatch?.[1] ?? null,
          hrefs,
          fields: fieldMatches,
          colored_status: coloredStatus,
          status,
          get_status_display: displayStatus,
          team_1_name: extractField(row, "team_1_name"),
          team_2_name: extractField(row, "team_2_name"),
          round: extractField(row, "round"),
          slot: extractField(row, "slot"),
        });
      }
    }

    // Also first 3 rows for field structure reference
    const sampleRows = rows.slice(0, 3).map(([, row]) => {
      const idMatch = row.match(/\/admin\/tournaments\/game\/(\w[\w-]*)\/change\//);
      const hrefs = [...row.matchAll(/href="([^"]+)"/g)].map(m => m[1]).filter(h => h.includes("game"));
      return {
        gameId: idMatch?.[1] ?? null,
        hrefs,
        status: extractField(row, "status"),
        team_1_name: extractField(row, "team_1_name"),
        team_2_name: extractField(row, "team_2_name"),
      };
    });

    results.push({
      url, httpStatus: res.status, rowCount: rows.length,
      allStatuses: [...allStatuses],
      nonPendingRows,
      sampleRows,
    });

    // Stop after first URL that returns rows
    if (rows.length > 0) break;
  }

  return NextResponse.json({ base: BASE, results });
}
