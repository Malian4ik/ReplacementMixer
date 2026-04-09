import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";

const JUDGE_ROLES = new Set(["OWNER", "JUDGE"]);

export async function requireJudgeSession() {
  const session = await getSessionFromCookies();

  if (!session) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }),
    };
  }

  if (!JUDGE_ROLES.has(session.role)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    session,
  };
}

export async function requireOwnerSession() {
  const session = await getSessionFromCookies();

  if (!session) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }),
    };
  }

  if (session.role !== "OWNER") {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    session,
  };
}
