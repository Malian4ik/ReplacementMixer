import { prisma } from "./lib/prisma";

async function main() {
  const matches = await prisma.tournamentMatch.findMany({
    where: {
      status: { in: ["Completed", "TechLoss", "Live", "Scheduled"] },
    },
    orderBy: { scheduledAt: "asc" },
  });

  // Filter night matches: 21:00-23:59 UTC (00:00-02:59 MSK) or 00:00-03:59 UTC (03:00-06:59 MSK)
  const night = matches.filter(m => {
    const h = m.scheduledAt.getUTCHours();
    return h >= 21 || h < 4;
  });

  console.log("Night matches:", night.length);
  night.forEach(m => {
    const msk = new Date(m.scheduledAt.getTime() + 3 * 60 * 60 * 1000);
    const hh = String(msk.getUTCHours()).padStart(2, "0");
    const mm = String(msk.getUTCMinutes()).padStart(2, "0");
    const dd = String(msk.getUTCDate()).padStart(2, "0");
    const mo = String(msk.getUTCMonth() + 1).padStart(2, "0");
    console.log(`${dd}.${mo} ${hh}:${mm} MSK | ${m.homeTeam} vs ${m.awayTeam} | ${m.status}`);
  });
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
