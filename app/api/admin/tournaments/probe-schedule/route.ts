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
  const url = `${BASE}/admin/tournaments/game/?tournament__id__exact=${tournamentId}&p=1`;
  const urlNoFilter = `${BASE}/admin/tournaments/game/?p=1`;

  async function probe(u: string) {
    const res = await fetch(u, { headers });
    if (!res.ok) return { status: res.status, fields: [], firstRow: "" };
    const html = await res.text();
    // Extract all field-* class names from result_list
    const fields = [...new Set([...html.matchAll(/class="field-([^"\s]+)/g)].map(m => m[1]))];
    // Grab first data row raw HTML (truncated)
    const listMatch = html.match(/id="result_list"[\s\S]{0,50000}/)?.[0] ?? "";
    const rowMatch = listMatch.match(/<tbody[\s\S]*?<tr[^>]*>([\s\S]*?)<\/tr>/);
    const firstRow = rowMatch?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500) ?? "";
    const rowCount = (listMatch.match(/<tr\s/g) ?? []).length;
    return { status: res.status, fields, firstRow, rowCount };
  }

  const [withFilter, withoutFilter] = await Promise.all([probe(url), probe(urlNoFilter)]);
  return NextResponse.json({ withFilter, withoutFilter });
}
