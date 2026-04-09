import { NextResponse } from "next/server";
import { ensureJudgeAccess } from "@/app/api/discord/replacement-search/shared";
import { confirmRecommendedReplacement } from "@/services/replacement-search-confirmation.service";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await ensureJudgeAccess();
    if (authError) return authError;

    const { id } = await params;
    const session = await confirmRecommendedReplacement(id);
    return NextResponse.json(session);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
