"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/components/UserContext";
import { FileDown, RefreshCw } from "lucide-react";

const ROLES: Record<number, string> = { 1: "Carry", 2: "Mid", 3: "Offlane", 4: "Soft Sup", 5: "Hard Sup" };

interface PlayerRow {
  id: string;
  nick: string;
  mmr: number;
  stake: number;
  mainRole: number;
  matchesPlayed: number;
  nightMatches: number;
  isActiveInDatabase: boolean;
}

interface TeamRow {
  name: string;
  player1Id: string | null;
  player2Id: string | null;
  player3Id: string | null;
  player4Id: string | null;
  player5Id: string | null;
}

export default function ExportPage() {
  const { user } = useUser();
  const [downloading, setDownloading] = useState(false);

  const { data: players = [], isLoading: loadingPlayers } = useQuery<PlayerRow[]>({
    queryKey: ["export-players"],
    queryFn: () =>
      fetch("/api/players")
        .then(r => r.json())
        .then((d: PlayerRow[] | { players?: PlayerRow[] }) => Array.isArray(d) ? d : d.players ?? [])
        .then((d: PlayerRow[]) => d.filter(p => p.isActiveInDatabase)),
  });

  const { data: teams = [] } = useQuery<TeamRow[]>({
    queryKey: ["export-teams"],
    queryFn: () => fetch("/api/teams").then(r => r.json()).then((d: TeamRow[] | { teams?: TeamRow[] }) => Array.isArray(d) ? d : d.teams ?? []),
  });

  const playerTeam = new Map<string, string>();
  for (const t of teams) {
    for (const pid of [t.player1Id, t.player2Id, t.player3Id, t.player4Id, t.player5Id]) {
      if (pid) playerTeam.set(pid, t.name);
    }
  }

  const sorted = [...players].sort((a, b) => b.matchesPlayed - a.matchesPlayed || b.nightMatches - a.nightMatches);

  async function downloadCsv() {
    setDownloading(true);
    try {
      const res = await fetch("/api/cron/recalculate?export=csv");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("content-disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match?.[1] ?? `mixercup-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  if (user?.role !== "OWNER") {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <div>Только OWNER</div>
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div className="page-header">
        <div>
          <div className="page-title">Экспорт турнира</div>
          <div className="page-subtitle">Финальная статистика игроков</div>
        </div>
        <button
          className="btn btn-accent"
          onClick={downloadCsv}
          disabled={downloading}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          {downloading ? <RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} /> : <FileDown size={14} />}
          {downloading ? "Скачивание..." : "Скачать CSV"}
        </button>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "0 0 16px" }}>
        {loadingPlayers ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
            Загрузка...
          </div>
        ) : (
          <>
            <div style={{ padding: "8px 24px", fontSize: 12, color: "var(--text-muted)" }}>
              {sorted.length} игроков
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "rgba(0,0,0,0.2)" }}>
                  {["#", "Ник", "MMR", "Стейк", "Роль", "Матчей", "Ночных", "Команда"].map(h => (
                    <th key={h} style={{
                      padding: "8px 12px", textAlign: "left", fontWeight: 600,
                      color: "var(--text-muted)", letterSpacing: "0.04em", fontSize: 11,
                      whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((p, i) => (
                  <tr key={p.id} style={{
                    borderBottom: "1px solid var(--border)",
                    background: i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.1)",
                  }}>
                    <td style={{ padding: "7px 12px", color: "var(--text-muted)", width: 36 }}>{i + 1}</td>
                    <td style={{ padding: "7px 12px", fontWeight: 600, color: "var(--text-primary)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nick}</td>
                    <td style={{ padding: "7px 12px", color: "var(--accent)", fontWeight: 700 }}>{p.mmr}</td>
                    <td style={{ padding: "7px 12px", color: "var(--text-secondary)" }}>{p.stake}</td>
                    <td style={{ padding: "7px 12px", color: "var(--text-secondary)" }}>{ROLES[p.mainRole] ?? p.mainRole}</td>
                    <td style={{ padding: "7px 12px", fontWeight: 700, color: p.matchesPlayed > 0 ? "#34d399" : "var(--text-muted)" }}>{p.matchesPlayed}</td>
                    <td style={{ padding: "7px 12px", color: p.nightMatches > 0 ? "#818cf8" : "var(--text-muted)" }}>{p.nightMatches}</td>
                    <td style={{ padding: "7px 12px", color: "var(--text-secondary)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {playerTeam.get(p.id) ?? <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
