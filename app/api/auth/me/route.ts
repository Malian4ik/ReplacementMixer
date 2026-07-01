import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";
import { findUserByEmail, findUserById } from "@/lib/db-user";

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json(null);

  // Older cookies can contain a stale userId after DB restores/imports.
  // Keep the signed session usable by falling back to the stable email.
  const email = typeof session.email === "string" ? session.email.toLowerCase().trim() : "";
  const user = (await findUserById(session.userId)) ?? (email ? await findUserByEmail(email) : null);
  if (!user) {
    const allowedRoles = new Set(["OWNER", "JUDGE", "MARKETING", "VIEWER"]);
    const role = typeof session.role === "string" ? session.role : "";
    if (!allowedRoles.has(role)) return NextResponse.json(null);

    return NextResponse.json({
      id: session.userId,
      email,
      name: typeof session.name === "string" && session.name.trim() ? session.name : email || "User",
      role,
    });
  }

  return NextResponse.json({ id: user.id, email: user.email, name: user.name, role: user.role });
}
