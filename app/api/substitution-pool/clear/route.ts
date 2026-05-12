import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/substitution-pool/clear
// Marks all Active pool entries as Inactive (full reset before reimport).
export async function POST() {
  const result = await prisma.substitutionPoolEntry.updateMany({
    where: { status: "Active" },
    data: { status: "Inactive" },
  });
  return NextResponse.json({ cleared: result.count });
}
