import { NextResponse } from "next/server";
import { getTargetAverageMmr } from "@/services/team-balance.service";

export async function GET() {
  const targetAvgMmr = await getTargetAverageMmr();
  return NextResponse.json({ targetAvgMmr });
}
