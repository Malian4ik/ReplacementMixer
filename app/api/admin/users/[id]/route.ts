import { NextRequest, NextResponse } from "next/server";
import { updateUser } from "@/lib/db-user";
import { getSessionFromCookies } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookies();
  if (!session || session.role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();
  const updates: { role?: string; isApproved?: number } = {};
  if (body.role) updates.role = body.role;
  if (body.isApproved !== undefined) updates.isApproved = body.isApproved ? 1 : 0;
  await updateUser(id, updates);
  return NextResponse.json({ ok: true });
}
