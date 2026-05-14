import { NextResponse } from "next/server";
import { adminLogin, getAdminHeaders } from "@/services/admin-source.service";

const BASE = process.env.ADMIN_SOURCE_URL ?? "";

function fieldText(row: string, fieldName: string): string {
  const m = row.match(new RegExp(`class="field-${fieldName}[^"]*"[^>]*>([\\s\\S]*?)<\\/(?:td|th)>`));
  if (!m) return "";
  return m[1].replace(/<[^>]+>/g, "").trim().replace(/\s+/g, " ");
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tournamentId = searchParams.get("tournament") ?? "23";

  await adminLogin();

  let page = 1;
  let total = 0;
  let moreThan1 = 0;
  const bids: number[] = [];

  while (true) {
    const url = `${BASE}/admin/tournaments/participant/?status=BID&tournament=${tournamentId}&p=${page}`;
    const res = await fetch(url, { headers: getAdminHeaders() });
    if (!res.ok) break;
    const html = await res.text();

    const listMatch = html.match(/id="result_list"[^>]*>([\s\S]*)/);
    if (!listMatch) break;

    let pageCount = 0;
    for (const [, row] of [...listMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]) {
      const nickMatch = row.match(/class="field-nickname[^"]*"[^>]*data-label="Nickname"[^>]*><a[^>]*>([^<]*)<\/a>/);
      if (!nickMatch) continue;

      const bidStr = fieldText(row, "bid_size");
      const bid = bidStr ? parseFloat(bidStr) : 0;
      bids.push(bid);
      if (bid > 1) moreThan1++;
      pageCount++;
    }

    total += pageCount;

    const hasMore = new RegExp(`[?&]p=${page + 1}[&"]`).test(html)
      || new RegExp(`[?&]p=${page + 1}&amp;`).test(html);
    if (!hasMore || page >= 50) break;
    page++;
  }

  return NextResponse.json({ tournament: tournamentId, total, moreThan1, bids: bids.sort((a, b) => b - a) });
}
