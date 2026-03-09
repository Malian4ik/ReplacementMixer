"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Team, Player } from "@/types";

export default function TeamsPage() {
  const qc = useQueryClient();
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState<{
    name: string;
    player1Id: string; player2Id: string; player3Id: string;
    player4Id: string; player5Id: string;
  } | null>(null);

  const { data: teams = [], isLoading } = useQuery<Team[]>({
    queryKey: ["teams"],
    queryFn: () => fetch("/api/teams").then(r => r.json()),
  });

  const { data: stats } = useQuery<{ targetAvgMmr: number }>({
    queryKey: ["stats"],
    queryFn: () => fetch("/api/stats").then(r => r.json()),
  });

  const { data: allPlayers = [] } = useQuery<Player[]>({
    queryKey: ["players"],
    queryFn: () => fetch("/api/players").then(r => r.json()),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) =>
      fetch(`/api/teams/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teams"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      setEditId(null);
    },
  });

  const targetAvgMmr = stats?.targetAvgMmr ?? 0;
  const avgOfTeams = teams.length
    ? Math.round(teams.reduce((s, t) => s + t.avgMmr, 0) / teams.length)
    : 0;

  const mmrValues = teams.map(t => t.avgMmr);
  const minMmr = mmrValues.length ? Math.min(...mmrValues) : 0;
  const maxMmr = mmrValues.length ? Math.max(...mmrValues) : 0;

  function mmrGradientColor(mmr: number): string {
    if (maxMmr === minMmr) return "#fbbf24";
    const ratio = (mmr - minMmr) / (maxMmr - minMmr);
    if (ratio >= 0.5) {
      const t = (ratio - 0.5) * 2;
      const r = Math.round(251 + (52 - 251) * t);
      const g = Math.round(191 + (211 - 191) * t);
      const b = Math.round(36 + (153 - 36) * t);
      return `rgb(${r},${g},${b})`;
    } else {
      const t = ratio * 2;
      const r = Math.round(248 + (251 - 248) * t);
      const g = Math.round(113 + (191 - 113) * t);
      const b = Math.round(113 + (36 - 113) * t);
      return `rgb(${r},${g},${b})`;
    }
  }

  function startEdit(t: Team) {
    setEditId(t.id);
    setEditData({
      name: t.name,
      player1Id: t.player1Id,
      player2Id: t.player2Id,
      player3Id: t.player3Id,
      player4Id: t.player4Id,
      player5Id: t.player5Id,
    });
  }

  const selStyle: React.CSSProperties = {
    background: "rgba(0,0,0,0.5)",
    border: "1px solid var(--border-light)",
    color: "var(--text-primary)",
    borderRadius: 4,
    padding: "3px 6px",
    fontSize: 12,
    width: "100%",
    outline: "none",
  };

  const sortedPlayers = allPlayers.slice().sort((a, b) => a.nick.localeCompare(b.nick));

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div className="page-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div className="page-title">Команды</div>
          <div className="page-subtitle">{teams.length} команд · Avg MMR всех: {avgOfTeams.toLocaleString()}</div>
        </div>
        {targetAvgMmr > 0 && (
          <div style={{
            padding: "6px 16px",
            background: "rgba(240,165,0,0.1)",
            border: "1px solid rgba(240,165,0,0.3)",
            borderRadius: 6,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}>
            <span style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Target MMR</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: "var(--accent)" }}>{targetAvgMmr.toLocaleString()}</span>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "16px 24px" }}>
        {isLoading ? (
          <div style={{ color: "var(--text-secondary)", padding: 40, textAlign: "center" }}>Загрузка...</div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 12,
          }}>
            {teams.map(t => {
              const isEditing = editId === t.id;
              return (
                <div key={t.id} className="card" style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    {isEditing && editData ? (
                      <input
                        style={{ ...selStyle, width: 120 }}
                        value={editData.name}
                        onChange={e => setEditData(d => d ? { ...d, name: e.target.value } : d)}
                      />
                    ) : (
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{t.name}</span>
                    )}
                    <span style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: mmrGradientColor(t.avgMmr),
                      padding: "2px 8px",
                      background: "rgba(255,255,255,0.05)",
                      borderRadius: 4,
                    }}>
                      {t.avgMmr.toLocaleString()} MMR
                    </span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {isEditing && editData ? (
                      (["player1Id", "player2Id", "player3Id", "player4Id", "player5Id"] as const).map((slot, i) => (
                        <div key={slot} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ color: "var(--text-muted)", fontSize: 10, minWidth: 14 }}>{i + 1}</span>
                          <select
                            style={selStyle}
                            value={editData[slot]}
                            onChange={e => setEditData(d => d ? { ...d, [slot]: e.target.value } : d)}
                          >
                            {sortedPlayers.map(p => (
                              <option key={p.id} value={p.id}>
                                {p.nick} ({p.mmr.toLocaleString()}) R{p.mainRole}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))
                    ) : (
                      (t.players ?? []).map((p, i) => p && (
                        <div key={p.id} style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "4px 8px",
                          borderRadius: 4,
                          background: "rgba(0,0,0,0.2)",
                          fontSize: 12,
                        }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ color: "var(--text-muted)", fontSize: 10, minWidth: 12 }}>{i + 1}</span>
                            <span style={{ fontWeight: 500 }}>{p.nick}</span>
                          </span>
                          <span style={{ color: "var(--text-secondary)", fontFamily: "monospace", fontSize: 11 }}>
                            {p.mmr.toLocaleString()} · R{p.mainRole}
                            {p.flexRole ? <span style={{ opacity: 0.6 }}>/R{p.flexRole}</span> : null}
                          </span>
                        </div>
                      ))
                    )}
                  </div>

                  <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
                    {isEditing && editData ? (
                      <>
                        <button
                          className="btn btn-sm btn-success"
                          style={{ flex: 1 }}
                          onClick={() => updateMutation.mutate({ id: t.id, data: editData })}
                          disabled={updateMutation.isPending}
                        >
                          Сохранить
                        </button>
                        <button className="btn btn-sm btn-ghost" onClick={() => setEditId(null)}>
                          Отмена
                        </button>
                      </>
                    ) : (
                      <button
                        className="btn btn-sm btn-ghost"
                        style={{ width: "100%" }}
                        onClick={() => startEdit(t)}
                      >
                        Изменить
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
