import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureJudgeAccess } from "@/app/api/discord/replacement-search/shared";
import { assignReadyCandidate } from "@/services/replacement-search-confirmation.service";

const AssignReadySchema = z.object({
  candidateId: z.string().min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await ensureJudgeAccess();
    if (authError) return authError;

    const body = AssignReadySchema.parse(await req.json());
    const { id } = await params;
    const session = await assignReadyCandidate(id, body.candidateId);
    return NextResponse.json(session);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
