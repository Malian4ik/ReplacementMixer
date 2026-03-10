import { NextRequest, NextResponse } from "next/server";
import { findUserByEmail, initUserTable } from "@/lib/db-user";
import { verifyPassword, createSessionToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    await initUserTable();
    const { email, password } = await req.json();
    if (!email || !password) return NextResponse.json({ error: "Email и пароль обязательны" }, { status: 400 });

    const user = await findUserByEmail(email.toLowerCase().trim());
    if (!user) return NextResponse.json({ error: "Неверный email или пароль" }, { status: 401 });
    if (!user.isApproved) return NextResponse.json({ error: "Ваш аккаунт ожидает подтверждения администратора" }, { status: 403 });

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return NextResponse.json({ error: "Неверный email или пароль" }, { status: 401 });

    const token = await createSessionToken({ userId: user.id, email: user.email, name: user.name, role: user.role });
    const res = NextResponse.json({ ok: true, role: user.role, name: user.name });
    res.cookies.set("mc_session", token, { httpOnly: true, sameSite: "lax", maxAge: 30 * 24 * 3600, path: "/" });
    return res;
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
