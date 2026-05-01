import { NextRequest, NextResponse } from "next/server";
import { adminLogin, getAdminHeaders } from "@/services/admin-source.service";

const BASE = process.env.ADMIN_SOURCE_URL ?? "";

function extractFields(html: string) {
  const fields: { name: string; type: string; value: string }[] = [];
  for (const [, type, name, rest] of [...html.matchAll(/<(input|select|textarea)[^>]*name="([^"]+)"([^>]*)/g)]) {
    const valueMatch = rest.match(/value="([^"]*)"/);
    fields.push({ name, type, value: valueMatch?.[1] ?? "" });
  }
  return fields;
}

export async function POST(req: NextRequest) {
  const { tournamentId } = await req.json().catch(() => ({}));
  if (!tournamentId) return NextResponse.json({ error: "tournamentId required" }, { status: 400 });

  try { await adminLogin(); } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }

  const headers = getAdminHeaders() as HeadersInit;

  // Step 1: get first participant UUID from list page
  const listRes = await fetch(`${BASE}/admin/tournaments/participant/?tournament__id__exact=${tournamentId}&p=1`, { headers });
  if (!listRes.ok) return NextResponse.json({ error: `participant list ${listRes.status}` }, { status: 500 });
  const listHtml = await listRes.text();

  const uuidMatch = listHtml.match(/\/admin\/tournaments\/participant\/([0-9a-f-]{8,})\/change\//);
  if (!uuidMatch) return NextResponse.json({ error: "no participant UUID found" }, { status: 500 });
  const participantUuid = uuidMatch[1];

  // Step 2: participant detail page — look for wallet fields + user UUID link
  const partRes = await fetch(`${BASE}/admin/tournaments/participant/${participantUuid}/change/`, { headers });
  if (!partRes.ok) return NextResponse.json({ error: `participant detail ${partRes.status}` }, { status: 500 });
  const partHtml = await partRes.text();

  const participantFields = extractFields(partHtml);
  const participantWalletCtx = [...partHtml.matchAll(/wallet[^<]{0,200}/gi)].map(m => m[0].slice(0, 150));

  const userUuidMatch = partHtml.match(/\/admin\/users\/user\/([0-9a-f-]{8,})\/change\//);
  const userUuid = userUuidMatch?.[1];

  // Step 3: user detail page (if user UUID found)
  let userFields: typeof participantFields = [];
  let userWalletCtx: string[] = [];

  if (userUuid) {
    const userRes = await fetch(`${BASE}/admin/users/user/${userUuid}/change/`, { headers });
    if (userRes.ok) {
      const userHtml = await userRes.text();
      userFields = extractFields(userHtml);
      userWalletCtx = [...userHtml.matchAll(/wallet[^<]{0,200}/gi)].map(m => m[0].slice(0, 150));
    }
  }

  return NextResponse.json({
    participantUuid,
    userUuid,
    participant: { fields: participantFields, walletCtx: participantWalletCtx },
    user: { fields: userFields, walletCtx: userWalletCtx },
  });
}
