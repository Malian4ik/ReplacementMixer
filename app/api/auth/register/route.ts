import { NextRequest, NextResponse } from "next/server";
import { initUserTable, findUserByEmail, createUser } from "@/lib/db-user";
import { hashPassword } from "@/lib/auth";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  try {
    await initUserTable();
    const { email, password, name } = await req.json();
    if (!email || !password || !name) return NextResponse.json({ error: "Все поля обязательны" }, { status: 400 });
    if (password.length < 6) return NextResponse.json({ error: "Минимум 6 символов" }, { status: 400 });

    const existing = await findUserByEmail(email.toLowerCase().trim());
    if (existing) return NextResponse.json({ error: "Email уже зарегистрирован" }, { status: 409 });

    const passwordHash = await hashPassword(password);
    await createUser({ id: randomUUID(), email: email.toLowerCase().trim(), passwordHash, name, role: "PENDING", isApproved: 0 });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
