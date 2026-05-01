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

  // Fetch first few pages of completed games
  const allGames: { id: string; fields: Record<string, string> }[] = [];

  for (let page = 1; page <= 5; page++) {
    const url = `${BASE}/admin/tournaments/game/?o=4&p=${page}`;
    let res: Response;
    try { res = await fetch(url, { headers: getAdminHeaders() as HeadersInit }); }
    catch { break; }
    if (!res.ok) break;

    const html = await res.text();
    const listMatch = html.match(/id="result_list"[^>]*>([\s\S]*)/);
    if (!listMatch) break;

    const rows = [...listMatch[1].matchAll(/<tr[^>]*class="[^"]*row[^"]*"[^>]*>([\s\S]*?)<\/tr>/g)];
    if (rows.length === 0) break;

    for (const [, row] of rows) {
      const status = extractField(row, "status");
      if (!/завершен|completed|finished|done/i.test(status)) continue;

      // Collect all field values
      const fieldNames = [...row.matchAll(/class="field-([^"\s]+)/g)].map(m => m[1]);
      const fields: Record<string, string> = { status };
      for (const f of fieldNames) {
        const val = extractField(row, f);
        if (val) fields[f] = val;
      }
      // Also try to get game detail link
      const idMatch = row.match(/\/admin\/tournaments\/game\/([\w-]+)\/change\//);
      if (idMatch) allGames.push({ id: idMatch[1], fields });
    }
  }

  if (allGames.length === 0) {
    return NextResponse.json({ message: "No completed games found", hint: "Fetched first 5 pages sorted by status" });
  }

  // Show first game's fields to understand what's available
  return NextResponse.json({
    count: allGames.length,
    sampleFields: allGames[0]?.fields ?? {},
    games: allGames.slice(0, 5),
  });
}
