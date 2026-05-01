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

  // Step 1: get first participant UUID
  const listRes = await fetch(`${BASE}/admin/tournaments/participant/?tournament__id__exact=${tournamentId}&p=1`, { headers });
  if (!listRes.ok) return NextResponse.json({ error: `participant list ${listRes.status}` }, { status: 500 });
  const listHtml = await listRes.text();

  // Extract first participant change link
  const uuidMatch = listHtml.match(/\/admin\/tournaments\/participant\/([0-9a-f-]{8,})\/change\//);
  if (!uuidMatch) return NextResponse.json({ error: "no participant UUID found" }, { status: 500 });
  const participantUuid = uuidMatch[1];

  // Step 2: get participant detail to find user UUID
  const partRes = await fetch(`${BASE}/admin/tournaments/participant/${participantUuid}/change/`, { headers });
  if (!partRes.ok) return NextResponse.json({ error: `participant detail ${partRes.status}` }, { status: 500 });
  const partHtml = await partRes.text();

  const userUuidMatch = partHtml.match(/\/admin\/users\/user\/([0-9a-f-]{8,})\/change\//);
  if (!userUuidMatch) return NextResponse.json({ error: "no user UUID found in participant detail", partHtmlSnippet: partHtml.slice(0, 2000) }, { status: 500 });
  const userUuid = userUuidMatch[1];

  // Step 3: fetch user detail page and extract all input field names + values
  const userRes = await fetch(`${BASE}/admin/users/user/${userUuid}/change/`, { headers });
  if (!userRes.ok) return NextResponse.json({ error: `user detail ${userRes.status}` }, { status: 500 });
  const userHtml = await userRes.text();

  // Extract all input/select/textarea field names and their values
  const fields: { name: string; type: string; value: string }[] = [];
  for (const [, type, name, rest] of [...userHtml.matchAll(/<(input|select|textarea)[^>]*name="([^"]+)"([^>]*)/g)]) {
    const valueMatch = rest.match(/value="([^"]*)"/);
    fields.push({ name, type, value: valueMatch?.[1] ?? "(no value attr)" });
  }

  // Also look for any field with "wallet" in its name or nearby text
  const walletContext = [...userHtml.matchAll(/wallet[^<]{0,300}/gi)].map(m => m[0].slice(0, 200));

  return NextResponse.json({
    participantUuid,
    userUuid,
    fields,
    walletContext,
  });
}
