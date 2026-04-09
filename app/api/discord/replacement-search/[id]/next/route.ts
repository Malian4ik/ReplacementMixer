import { NextResponse } from "next/server";
import { ensureJudgeAccess } from "@/app/api/discord/replacement-search/shared";
import { promoteNextRecommendation } from "@/services/replacement-search-confirmation.service";

const fallbackTransport = {
  async publishWave() {
    throw new Error("BOT_TRANSPORT_NOT_AVAILABLE");
  },
  async publishWaveResult() {
    return;
  },
};

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await ensureJudgeAccess();
    if (authError) return authError;

    const { id } = await params;
    const session = await promoteNextRecommendation(id, fallbackTransport, { rejectCurrent: true, autoCreateWave: false });
    return NextResponse.json(session);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
