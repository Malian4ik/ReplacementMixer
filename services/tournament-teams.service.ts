import { prisma } from "@/lib/prisma";
import { adminLogin, fetchTournamentTeams } from "./admin-source.service";

export async function currentTournamentTeamFilter(loadFromAdmin = false) {
  const select = { id: true, externalId: true, teamNamesJson: true } as const;
  const tournament =
    (await prisma.adminTournament.findFirst({ where: { isActive: true }, select })) ??
    (await prisma.adminTournament.findFirst({
      where: { lastSyncedAt: { not: null } },
      orderBy: { lastSyncedAt: "desc" },
      select,
    }));
  if (!tournament) return undefined;

  if (tournament.teamNamesJson) {
    const names: string[] = JSON.parse(tournament.teamNamesJson);
    return { name: { in: names } };
  }

  if (!loadFromAdmin) {
    throw new Error("Сначала импортируйте команды текущего турнира в Replacement");
  }
  await adminLogin();
  const teams = await fetchTournamentTeams(tournament.externalId);
  if (!teams.length) throw new Error("Не удалось подтвердить команды текущего турнира");
  const names = teams.map(team => team.name);
  await prisma.adminTournament.updateMany({
    where: { id: tournament.id, teamNamesJson: null },
    data: { teamNamesJson: JSON.stringify(names) },
  });
  return { name: { in: names } };
}
