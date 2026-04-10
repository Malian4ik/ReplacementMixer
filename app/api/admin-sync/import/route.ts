import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession } from "@/lib/route-auth";
import { importAdminTournament } from "@/services/admin-tournament-import.service";

const ImportSchema = z.object({
  adminTournamentId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const auth = await requireOwnerSession();
  if (!auth.ok) return auth.response;

  try {
    const body = ImportSchema.parse(await req.json());
    const result = await importAdminTournament(body.adminTournamentId);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[admin-sync/import]", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
