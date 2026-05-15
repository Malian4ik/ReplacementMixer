import { NextRequest, NextResponse } from "next/server";
import { recalculateMatchStats, debugPlayerStats } from "@/services/match-stats.service";
import { adminLogin, getAdminHeaders } from "@/services/admin-source.service";

export async function POST() {
  const { totalMatches, playersUpdated } = await recalculateMatchStats();
  return NextResponse.json({ ok: true, totalMatches, playersUpdated });
}

export async function GET(req: NextRequest) {
  const nick = req.nextUrl.searchParams.get("debug");
  if (nick) {
    const info = await debugPlayerStats(nick);
    return NextResponse.json(info);
  }

  // Probe: show raw first page of any admin URL for inspection
  const probe = req.nextUrl.searchParams.get("probe");
  if (probe) {
    const base = process.env.ADMIN_SOURCE_URL ?? "";
    await adminLogin();
    const url = `${base}/admin/tournaments/${probe}/`;
    const res = await fetch(url, { headers: getAdminHeaders() });
    const html = await res.text();
    const fieldClasses = [...new Set([...html.matchAll(/class="field-([^"\s]+)/g)].map(m => m[1]))];
    const hasResultList = html.includes('id="result_list"');
    const rowCount = [...html.matchAll(/<tr[^>]*class="[^"]*row[^"]*"/g)].length;
    const listMatch = html.match(/id="result_list"[^>]*>([\s\S]*)/);
    const rows: string[] = [];
    // Raw HTML of first 2 data rows (for UUID debugging) + stripped text
    const rawRows: string[] = [];
    if (listMatch) {
      const allRows = [...listMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
      for (const [, row] of allRows.slice(0, 3)) {
        rows.push(row.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
      }
      for (const [, row] of allRows.slice(1, 3)) {
        rawRows.push(row.slice(0, 800));
      }
    }
    // Checkbox values (_selected_action) — contain model PK
    const checkboxValues = [...html.matchAll(/name="_selected_action"[^>]*value="([^"]+)"/g)].slice(0, 5).map(m => m[1]);
    // All UUIDs found anywhere on the page
    const uuidsOnPage = [...new Set([...html.matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g)].map(m => m[0]))].slice(0, 10);
    return NextResponse.json({ url, status: res.status, hasResultList, rowCount, fieldClasses, firstRows: rows, rawRows, checkboxValues, uuidsOnPage });
  }

  const { totalMatches, playersUpdated } = await recalculateMatchStats();
  return NextResponse.json({ ok: true, totalMatches, playersUpdated });
}
