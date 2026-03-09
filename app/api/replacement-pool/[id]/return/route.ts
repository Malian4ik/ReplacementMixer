import { NextRequest, NextResponse } from "next/server";
import { returnReplacementToQueue } from "@/services/replacement.service";
import { z } from "zod";

const ReturnSchema = z.object({
  judgeName: z.string().optional(),
  comment: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await req.json();
    const { judgeName, comment } = ReturnSchema.parse(body);
    const entry = await returnReplacementToQueue(id, judgeName, comment);
    return NextResponse.json(entry);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Bad request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
