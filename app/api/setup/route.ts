import { NextRequest, NextResponse } from "next/server";
import { initUserTable, countUsers, createUser } from "@/lib/db-user";
import { hashPassword, createSessionToken } from "@/lib/auth";
import { randomUUID } from "crypto";

export async function GET() {
  await initUserTable();
  const count = await countUsers();
  return NextResponse.json({ hasOwner: count > 0 });
}

export async function POST(req: NextRequest) {
  try {
    await initUserTable();
    const count = await countUsers();
    if (count > 0) return NextResponse.json({ error: "Владелец уже создан" }, { status: 409 });

    const { email, password, name } = await req.json();
    if (!email || !password || !name) return NextResponse.json({ error: "Все поля обязательны" }, { status: 400 });
    if (password.length < 6) return NextResponse.json({ error: "Минимум 6 символов" }, { status: 400 });

    const passwordHash = await hashPassword(password);
    const id = randomUUID();
    await createUser({ id, email: email.toLowerCase().trim(), passwordHash, name, role: "OWNER", isApproved: 1 });

    const token = await createSessionToken({ userId: id, email: email.toLowerCase().trim(), name, role: "OWNER" });
    const res = NextResponse.json({ ok: true });
    res.cookies.set("mc_session", token, { httpOnly: true, sameSite: "lax", maxAge: 30 * 24 * 3600, path: "/" });
    return res;
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
