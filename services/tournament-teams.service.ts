import { prisma } from "@/lib/prisma";
import { adminLogin, fetchTournamentTeams } from "./admin-source.service";

const rosterCache = new Map<string, { expiresAt: number; names: Promise<string[]> }>();

export async function currentTournamentTeamFilter() {
  const tournament =
    (await prisma.adminTournament.findFirst({
      where: { isActive: true },
      select: { externalId: true },
    })) ??
    (await prisma.adminTournament.findFirst({
      where: { lastSyncedAt: { not: null } },
      orderBy: { lastSyncedAt: "desc" },
      select: { externalId: true },
    }));
  if (!tournament) return undefined;

  const id = tournament.externalId;
  let entry = rosterCache.get(id);
  if (!entry || entry.expiresAt <= Date.now()) {
    const names = (async () => {
      await adminLogin();
      const teams = await fetchTournamentTeams(id);
      if (!teams.length) throw new Error("Не удалось подтвердить команды текущего турнира");
      return teams.map(team => team.name);
    })();
    entry = { expiresAt: Date.now() + 60_000, names };
    rosterCache.set(id, entry);
    const pending = entry;
    void names.catch(() => {
      if (rosterCache.get(id) === pending) rosterCache.delete(id);
    });
  }
  return { name: { in: await entry.names } };
}
