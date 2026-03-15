"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";

type Player = {
  id: string; nick: string; mmr: number; mainRole: number; flexRole: number | null;
  stake: number; wallet: string | null; telegramId: string | null;
  nightMatches: number; isActiveInDatabase: boolean;
};

type Team = {
  id: string; name: string; avgMmr: number;
  players: (Player | null)[];
};

const ROLE_LABELS: Record<number, string> = { 1: "Carry", 2: "Mid", 3: "Offlane", 4: "Soft Sup", 5: "Hard Sup" };
const ROLES = [1, 2, 3, 4, 5];

const btnBase: React.CSSProperties = {
  border: "1px solid rgba(0,212,232,0.25)",
  borderRadius: 4,
  background: "transparent",
  color: "var(--text-secondary)",
  fontSize: 11,
  padding: "1px 6px",
  cursor: "pointer",
  fontWeight: 600,
  lineHeight: 1.6,
};

export default function TeamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: team, isLoading } = useQuery<Team>({
    queryKey: ["team", id],
    queryFn: () => fetch(`/api/teams/${id}`).then(r => r.json()),
  });

  const roleMutation = useMutation({
    mutationFn: ({ playerId, mainRole, flexRole }: { playerId: string; mainRole: number; flexRole: number | null }) =>
      fetch(`/api/players/${playerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mainRole, flexRole }),
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team", id] }),
  });

  if (isLoading) return (
    <div style={{ padding: 32, color: "var(--text-muted)", textAlign: "center" }}>Загрузка...</div>
  );
  if (!team) return (
    <div style={{ padding: 32, color: "var(--text-muted)", textAlign: "center" }}>Команда не найдена</div>
  );

  const players = team.players ?? [];

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div className="page-header" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => router.back()}
          style={{ fontSize: 18, padding: "0 8px", lineHeight: 1 }}
        >
          ←
        </button>
        <div>
          <div className="page-title">{team.name}</div>
          <div className="page-subtitle">{players.filter(Boolean).length} игроков · Avg MMR: {team.avgMmr.toLocaleString()}</div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "16px 24px" }}>
        <div className="card" style={{ overflow: "visible" }}>
          <table className="tbl" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>#</th>
                <th>Ник</th>
                <th>MMR</th>
                <th>Основная роль</th>
                <th>Флекс роль</th>
                <th>Ставка</th>
                <th>Кошелёк</th>
                <th>Telegram</th>
                <th>Ночные</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p, i) => (
                <tr key={i}>
                  <td style={{ color: "var(--text-muted)", fontSize: 12 }}>{i + 1}</td>
                  {p ? (
                    <>
                      <td style={{ fontWeight: 600 }}>{p.nick}</td>
                      <td style={{ fontFamily: "monospace" }}>{p.mmr.toLocaleString()}</td>

                      {/* Main role selector */}
                      <td>
                        <div style={{ display: "flex", gap: 3 }}>
                          {ROLES.map(r => (
                            <button
                              key={r}
                              style={{
                                ...btnBase,
                                background: p.mainRole === r ? "rgba(0,212,232,0.18)" : "transparent",
                                color: p.mainRole === r ? "var(--accent)" : "var(--text-muted)",
                                borderColor: p.mainRole === r ? "var(--accent)" : "rgba(0,212,232,0.2)",
                              }}
                              onClick={() => roleMutation.mutate({ playerId: p.id, mainRole: r, flexRole: p.flexRole })}
                            >
                              R{r}
                            </button>
                          ))}
                        </div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                          {ROLE_LABELS[p.mainRole] ?? ""}
                        </div>
                      </td>

                      {/* Flex role selector */}
                      <td>
                        <div style={{ display: "flex", gap: 3 }}>
                          {ROLES.map(r => (
                            <button
                              key={r}
                              style={{
                                ...btnBase,
                                background: p.flexRole === r ? "rgba(251,191,36,0.15)" : "transparent",
                                color: p.flexRole === r ? "#fbbf24" : "var(--text-muted)",
                                borderColor: p.flexRole === r ? "#fbbf24" : "rgba(0,212,232,0.2)",
                              }}
                              onClick={() => {
                                const newFlex = p.flexRole === r ? null : r;
                                roleMutation.mutate({ playerId: p.id, mainRole: p.mainRole, flexRole: newFlex });
                              }}
                            >
                              R{r}
                            </button>
                          ))}
                        </div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                          {p.flexRole ? ROLE_LABELS[p.flexRole] : "—"}
                        </div>
                      </td>

                      <td>{p.stake}</td>
                      <td style={{ fontFamily: "monospace", fontSize: 12, color: p.wallet ? "var(--text-primary)" : "var(--text-muted)" }}>
                        {p.wallet ?? "—"}
                      </td>
                      <td style={{ fontSize: 12, color: p.telegramId ? "var(--accent)" : "var(--text-muted)" }}>
                        {p.telegramId
                          ? (p.telegramId.startsWith("@") ? p.telegramId : `@${p.telegramId}`)
                          : "—"}
                      </td>
                      <td style={{ textAlign: "center" }}>{p.nightMatches}</td>
                      <td>
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 4,
                          background: p.isActiveInDatabase ? "rgba(52,211,153,0.15)" : "rgba(248,113,113,0.15)",
                          color: p.isActiveInDatabase ? "#34d399" : "#f87171",
                        }}>
                          {p.isActiveInDatabase ? "Активен" : "Неактивен"}
                        </span>
                      </td>
                    </>
                  ) : (
                    <td colSpan={9} style={{ color: "var(--text-muted)", fontStyle: "italic", fontSize: 12 }}>
                      — пусто —
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
