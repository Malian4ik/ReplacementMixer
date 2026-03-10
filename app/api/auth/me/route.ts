import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";
import { findUserById } from "@/lib/db-user";

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json(null);
  const user = await findUserById(session.userId);
  if (!user) return NextResponse.json(null);
  return NextResponse.json({ id: user.id, email: user.email, name: user.name, role: user.role });
}
