import { NextResponse } from "next/server";
import { ensureJudgeAccess } from "@/app/api/discord/replacement-search/shared";
import { getSearchSessionWithRelations } from "@/services/replacement-search.repository";
import { processWaveCompletion } from "@/services/wave-orchestrator.service";

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
    const session = await getSearchSessionWithRelations(id);
    if (!session) {
      return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
    }

    const activeWave = session.waves.find((wave) => wave.status === "ACTIVE");
    if (!activeWave) {
      return NextResponse.json({ error: "ACTIVE_WAVE_NOT_FOUND" }, { status: 400 });
    }

    await processWaveCompletion(activeWave.id, fallbackTransport, { autoCreateNextWave: false });
    const updatedSession = await getSearchSessionWithRelations(id);
    return NextResponse.json(updatedSession);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
