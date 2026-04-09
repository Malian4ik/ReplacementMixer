import { NextResponse } from "next/server";
import { ensureJudgeAccess } from "@/app/api/discord/replacement-search/shared";
import { cancelReplacementSearch } from "@/services/replacement-search-confirmation.service";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await ensureJudgeAccess();
    if (authError) return authError;

    const { id } = await params;
    await cancelReplacementSearch(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
