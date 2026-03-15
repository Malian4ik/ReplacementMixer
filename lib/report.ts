import { prisma } from "@/lib/prisma";
import { formatMoscow } from "@/lib/date";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function buildDailyReport(): Promise<string> {
  const now = new Date();
  const dateStr = formatMoscow(now).slice(0, 10); // DD.MM.YYYY

  // Load data in parallel
  const [teams, logs] = await Promise.all([
    prisma.team.findMany({ orderBy: { name: "asc" } }),
    prisma.matchReplacementLog.findMany({
      orderBy: { timestamp: "desc" },
      take: 100,
    }),
  ]);

  // Compute player map and team avg MMR
  const playerIds = [...new Set(teams.flatMap(t =>
    [t.player1Id, t.player2Id, t.player3Id, t.player4Id, t.player5Id].filter(Boolean) as string[]
  ))];
  const players = await prisma.player.findMany({ where: { id: { in: playerIds } } });
  const playerMap = new Map(players.map(p => [p.id, p]));

  const teamsWithAvg = teams.map(t => {
    const mmrs = ([t.player1Id, t.player2Id, t.player3Id, t.player4Id, t.player5Id].filter(Boolean) as string[])
      .map(id => playerMap.get(id)?.mmr ?? null)
      .filter((m): m is number => m !== null);
    const avgMmr = mmrs.length ? Math.round(mmrs.reduce((a, b) => a + b, 0) / mmrs.length) : 0;
    return { ...t, avgMmr };
  });

  const totalMmr = teamsWithAvg.reduce((s, t) => s + t.avgMmr, 0);
  const avgAll = teamsWithAvg.length ? Math.round(totalMmr / teamsWithAvg.length) : 0;
  const sortedByMmr = [...teamsWithAvg].sort((a, b) => b.avgMmr - a.avgMmr);

  const lines: string[] = [];

  // ── Header ──
  lines.push(`<b>📊 ОТЧЁТ MIXERCUP — ${dateStr}</b>`);
  lines.push(`<b>Target MMR: ${avgAll.toLocaleString("ru-RU")}</b>`);
  lines.push("");

  // ── Teams summary ──
  lines.push(`<b>🏆 КОМАНДЫ (${teamsWithAvg.length})</b>`);
  lines.push(`Avg MMR всех: ${avgAll.toLocaleString("ru-RU")}`);
  if (sortedByMmr.length) {
    lines.push(`Лучшая:  ${esc(sortedByMmr[0].name)} — ${sortedByMmr[0].avgMmr.toLocaleString("ru-RU")}`);
    lines.push(`Худшая:  ${esc(sortedByMmr[sortedByMmr.length - 1].name)} — ${sortedByMmr[sortedByMmr.length - 1].avgMmr.toLocaleString("ru-RU")}`);
  }
  lines.push("");


  // ── Today's logs (last 24h) ──
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const todayLogs = logs.filter(l => new Date(l.timestamp) >= yesterday);
  const ACTION_RU: Record<string, string> = { Assign: "Назначение", Return: "Возврат", AddToPool: "В пул" };

  lines.push(`<b>📝 ЖУРНАЛ ЗА ПОСЛЕДНИЕ 24Ч (${todayLogs.length} записей)</b>`);
  if (todayLogs.length === 0) {
    lines.push("Замен не было");
  } else {
    for (const l of todayLogs.slice(0, 30)) {
      const time = formatMoscow(l.timestamp).slice(11, 16);
      const action = ACTION_RU[l.actionType] ?? l.actionType;
      let detail = "";
      if (l.actionType === "Assign") {
        detail = `${esc(l.teamName ?? "?")} ← ${esc(l.replacementPlayerNick ?? "?")} (${l.replacementPlayerMmr ?? "?"})`;
        if (l.replacedPlayerNick) detail += ` вместо ${esc(l.replacedPlayerNick)}`;
      } else if (l.actionType === "Return") {
        detail = `${esc(l.replacementPlayerNick ?? "?")} → пул`;
      } else {
        detail = `${esc(l.replacementPlayerNick ?? l.replacedPlayerNick ?? "?")} → пул`;
      }
      lines.push(`• ${time} [${action}] ${detail}`);
    }
    if (todayLogs.length > 30) lines.push(`... и ещё ${todayLogs.length - 30} записей`);
  }

  return lines.join("\n");
}
