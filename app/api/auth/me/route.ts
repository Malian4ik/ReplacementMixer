import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";
import { findUserByEmail, findUserById } from "@/lib/db-user";

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json(null);

  // Older cookies can contain a stale userId after DB restores/imports.
  // Keep the signed session usable by falling back to the stable email.
  const user = (await findUserById(session.userId)) ?? (await findUserByEmail(session.email.toLowerCase().trim()));
  if (!user) return NextResponse.json(null);
  return NextResponse.json({ id: user.id, email: user.email, name: user.name, role: user.role });
}
