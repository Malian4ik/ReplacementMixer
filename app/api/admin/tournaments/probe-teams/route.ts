import { NextRequest, NextResponse } from "next/server";
import { adminLogin, getAdminHeaders } from "@/services/admin-source.service";

const BASE = process.env.ADMIN_SOURCE_URL ?? "";

export async function POST(req: NextRequest) {
  const { tournamentId } = await req.json().catch(() => ({}));
  if (!tournamentId) return NextResponse.json({ error: "tournamentId required" }, { status: 400 });

  try { await adminLogin(); } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }

  const headers = getAdminHeaders() as HeadersInit;
  const url = `${BASE}/admin/tournaments/team/`;
  const res = await fetch(url, { headers });
  if (!res.ok) return NextResponse.json({ status: res.status, error: "not ok" }, { status: 500 });

  const html = await res.text();

  // All field-* classes
  const fields = [...new Set([...html.matchAll(/class="field-([^"\s]+)/g)].map(m => m[1]))];

  // Action checkboxes (most reliable ID source)
  const checkboxIds = [...html.matchAll(/name="action-select"\s+value="([^"]+)"/g)].map(m => m[1]).slice(0, 5);

  // First 3 row texts (stripped HTML)
  const listMatch = html.match(/id="result_list"[\s\S]*/)?.[0] ?? "";
  const rows = [...listMatch.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].slice(0, 4).map(([, r]) =>
    r.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300)
  );

  // Count rows in tbody
  const tbodyMatch = listMatch.match(/<tbody>([\s\S]*?)<\/tbody>/);
  const rowCount = (tbodyMatch?.[1]?.match(/<tr/g) ?? []).length;

  return NextResponse.json({ url, status: res.status, fields, checkboxIds, rowCount, rows });
}
