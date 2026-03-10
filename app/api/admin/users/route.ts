import { NextResponse } from "next/server";
import { getAllUsers, initUserTable } from "@/lib/db-user";
import { getSessionFromCookies } from "@/lib/auth";

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session || session.role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await initUserTable();
  const users = await getAllUsers();
  return NextResponse.json(users.map(u => ({ ...u, passwordHash: undefined })));
}
