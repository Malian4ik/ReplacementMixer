import { NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/route-auth";
import { listAdminTournaments } from "@/services/admin-tournament-import.service";

export async function GET() {
  const auth = await requireOwnerSession();
  if (!auth.ok) return auth.response;

  try {
    const tournaments = await listAdminTournaments();
    return NextResponse.json(tournaments);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
