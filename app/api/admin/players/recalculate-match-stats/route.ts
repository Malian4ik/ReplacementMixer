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
    // Return field class names found on the page
    const fieldClasses = [...new Set([...html.matchAll(/class="field-([^"\s]+)/g)].map(m => m[1]))];
    const hasResultList = html.includes('id="result_list"');
    const rowCount = [...html.matchAll(/<tr[^>]*class="[^"]*row[^"]*"/g)].length;
    const participantLinks = [...html.matchAll(/\/admin\/tournaments\/participant\/([0-9a-f-]{36})\//g)].length;
    const userLinks = [...html.matchAll(/\/admin\/users\/user\/([0-9a-f-]{36})\//g)].slice(0, 5).map(m => m[1]);
    // Extract first 3 data rows HTML
    const listMatch = html.match(/id="result_list"[^>]*>([\s\S]*)/);
    const rows: string[] = [];
    if (listMatch) {
      for (const [, row] of [...listMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].slice(0, 3)) {
        rows.push(row.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
      }
    }
    return NextResponse.json({ url, status: res.status, hasResultList, rowCount, fieldClasses, participantLinks, userLinks, firstRows: rows });
  }

  const { totalMatches, playersUpdated } = await recalculateMatchStats();
  return NextResponse.json({ ok: true, totalMatches, playersUpdated });
}
