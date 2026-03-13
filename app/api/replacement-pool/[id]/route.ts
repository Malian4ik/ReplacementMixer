import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const UpdateEntrySchema = z.object({
  status: z.enum(["Active", "Picked", "Inactive"]).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await req.json();
    const data = UpdateEntrySchema.parse(body);
    const entry = await prisma.replacementPoolEntry.update({
      where: { id },
      data,
      include: { player: true },
    });
    return NextResponse.json(entry);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Bad request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await prisma.replacementPoolEntry.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Not found";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
