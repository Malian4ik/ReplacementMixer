"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useUser } from "@/components/UserContext";

type Player = {
  id: string; nick: string; mmr: number; mainRole: number; flexRole: number | null;
  stake: number; wallet: string | null; telegramId: string | null;
  nightMatches: number; isActiveInDatabase: boolean;
};

type Team = {
  id: string; name: string; avgMmr: number;
  captainId: string | null;
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

// Inline swap picker component
function SwapPicker({
  currentTeamId,
  currentPlayerId,
  allTeams,
  onSwap,
  onClose,
}: {
  currentTeamId: string;
  currentPlayerId: string;
  allTeams: Team[];
  onSwap: (targetTeamId: string, targetPlayerId: string) => void;
  onClose: () => void;
}) {
  const [targetTeamId, setTargetTeamId] = useState("");
  const targetTeam = allTeams.find(t => t.id === targetTeamId);
  const targetPlayers = (targetTeam?.players ?? []).filter(
    (p): p is Player => p !== null && p.id !== currentPlayerId
  );

  return (
    <div style={{
      position: "absolute", zIndex: 100, right: 0, top: "100%", marginTop: 4,
      background: "var(--bg-card)", border: "1px solid var(--border)",
      borderRadius: 8, padding: 12, minWidth: 260, boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Поменять местами с...
      </div>

      <select
        className="form-select"
        value={targetTeamId}
        onChange={e => setTargetTeamId(e.target.value)}
        style={{ marginBottom: 8, fontSize: 12 }}
      >
        <option value="">— Выберите команду —</option>
        {allTeams
          .filter(t => t.id !== currentTeamId || t.players.some(p => p && p.id !== currentPlayerId))
          .map(t => <option key={t.id} value={t.id}>{t.name}</option>)
        }
      </select>

      {targetTeamId && targetPlayers.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>Нет доступных игроков</div>
      )}

      {targetPlayers.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 220, overflow: "auto" }}>
          {targetPlayers.map(p => (
            <button
              key={p.id}
              onClick={() => onSwap(targetTeamId, p.id)}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "6px 10px", borderRadius: 5, cursor: "pointer",
                background: "rgba(0,0,0,0.2)", border: "1px solid var(--border)",
                color: "var(--text-primary)", fontSize: 12, textAlign: "left",
                transition: "all 0.1s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,212,232,0.1)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(0,0,0,0.2)")}
            >
              <span style={{ fontWeight: 600 }}>{p.nick}</span>
              <span style={{ color: "var(--text-muted)", fontSize: 11, fontFamily: "monospace" }}>{p.mmr.toLocaleString()} · R{p.mainRole}</span>
            </button>
          ))}
        </div>
      )}

      <button
        onClick={onClose}
        style={{ ...btnBase, marginTop: 8, width: "100%", justifyContent: "center", padding: "4px 0", color: "var(--text-muted)", fontSize: 11 }}
      >
        Отмена
      </button>
    </div>
  );
}

export default function TeamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useUser();
  const canEdit = user?.role === "OWNER" || user?.role === "JUDGE";

  const [swapOpenFor, setSwapOpenFor] = useState<string | null>(null);
  const [nightAllPending, setNightAllPending] = useState(false);

  const { data: team, isLoading } = useQuery<Team>({
    queryKey: ["team", id],
    queryFn: () => fetch(`/api/teams/${id}`).then(r => r.json()),
  });

  const { data: allTeams = [] } = useQuery<Team[]>({
    queryKey: ["teams"],
    queryFn: () => fetch("/api/teams").then(r => r.json()),
    enabled: canEdit,
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

  const nightMutation = useMutation({
    mutationFn: ({ playerId, nightMatches }: { playerId: string; nightMatches: number }) =>
      fetch(`/api/players/${playerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nightMatches }),
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team", id] }),
  });

  const captainMutation = useMutation({
    mutationFn: (captainId: string | null) =>
      fetch(`/api/teams/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ captainId }),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team", id] });
      qc.invalidateQueries({ queryKey: ["teams"] });
    },
  });

  const swapMutation = useMutation({
    mutationFn: ({ targetTeamId, targetPlayerId, sourcePlayerId }: { targetTeamId: string; targetPlayerId: string; sourcePlayerId: string }) =>
      fetch("/api/teams/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerAId: sourcePlayerId,
          teamAId: id,
          playerBId: targetPlayerId,
          teamBId: targetTeamId,
        }),
      }).then(async r => {
        if (!r.ok) throw new Error((await r.json()).error);
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team", id] });
      qc.invalidateQueries({ queryKey: ["teams"] });
      setSwapOpenFor(null);
    },
  });

  async function giveNightStreakToAll() {
    const activePlayers = players.filter((p): p is Player => p !== null);
    if (!activePlayers.length) return;
    setNightAllPending(true);
    await Promise.all(
      activePlayers.map(p =>
        fetch(`/api/players/${p.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nightMatches: p.nightMatches + 1 }),
        })
      )
    );
    await qc.invalidateQueries({ queryKey: ["team", id] });
    setNightAllPending(false);
  }

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
        <div style={{ flex: 1 }}>
          <div className="page-title">{team.name}</div>
          <div className="page-subtitle">{players.filter(Boolean).length} игроков · Avg MMR: {team.avgMmr.toLocaleString()}</div>
        </div>
        {canEdit && (
          <button
            style={{
              ...btnBase,
              padding: "6px 14px",
              fontSize: 13,
              background: nightAllPending ? "rgba(0,212,232,0.1)" : "rgba(0,0,0,0.3)",
              color: nightAllPending ? "var(--accent)" : "var(--text-secondary)",
              borderColor: "rgba(0,212,232,0.3)",
              borderRadius: 6,
            }}
            onClick={giveNightStreakToAll}
            disabled={nightAllPending || players.filter(Boolean).length === 0}
          >
            {nightAllPending ? "..." : "🌙 +1 всем"}
          </button>
        )}
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
                {canEdit && <th>Капитан</th>}
                {canEdit && <th>Обмен</th>}
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
                      <td style={{ textAlign: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                          <button
                            style={{ ...btnBase, padding: "1px 7px", fontSize: 14 }}
                            onClick={() => nightMutation.mutate({ playerId: p.id, nightMatches: Math.max(0, p.nightMatches - 1) })}
                            disabled={p.nightMatches <= 0}
                          >−</button>
                          <span style={{ minWidth: 20, fontWeight: 600 }}>{p.nightMatches}</span>
                          <button
                            style={{ ...btnBase, padding: "1px 7px", fontSize: 14 }}
                            onClick={() => nightMutation.mutate({ playerId: p.id, nightMatches: p.nightMatches + 1 })}
                          >+</button>
                        </div>
                      </td>
                      <td>
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 4,
                          background: p.isActiveInDatabase ? "rgba(52,211,153,0.15)" : "rgba(248,113,113,0.15)",
                          color: p.isActiveInDatabase ? "#34d399" : "#f87171",
                        }}>
                          {p.isActiveInDatabase ? "Активен" : "Неактивен"}
                        </span>
                      </td>
                      {canEdit && (
                        <td>
                          {team.captainId === p.id ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b" }}>★ Капитан</span>
                              <button
                                style={{ ...btnBase, fontSize: 10, color: "#f87171", borderColor: "rgba(248,113,113,0.3)" }}
                                onClick={() => captainMutation.mutate(null)}
                              >Снять</button>
                            </div>
                          ) : (
                            <button
                              style={{ ...btnBase }}
                              onClick={() => captainMutation.mutate(p.id)}
                            >Назначить</button>
                          )}
                        </td>
                      )}
                      {canEdit && (
                        <td style={{ position: "relative" }}>
                          <button
                            style={{
                              ...btnBase,
                              background: swapOpenFor === p.id ? "rgba(0,212,232,0.12)" : "transparent",
                              color: swapOpenFor === p.id ? "var(--accent)" : "var(--text-secondary)",
                              borderColor: swapOpenFor === p.id ? "var(--accent)" : "rgba(0,212,232,0.25)",
                              whiteSpace: "nowrap",
                            }}
                            onClick={() => setSwapOpenFor(swapOpenFor === p.id ? null : p.id)}
                          >
                            ⇄ Обменять
                          </button>
                          {swapOpenFor === p.id && (
                            <SwapPicker
                              currentTeamId={id}
                              currentPlayerId={p.id}
                              allTeams={allTeams}
                              onSwap={(targetTeamId, targetPlayerId) =>
                                swapMutation.mutate({ targetTeamId, targetPlayerId, sourcePlayerId: p.id })
                              }
                              onClose={() => setSwapOpenFor(null)}
                            />
                          )}
                          {swapMutation.isPending && swapOpenFor === p.id && (
                            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>Меняю...</div>
                          )}
                        </td>
                      )}
                    </>
                  ) : (
                    <td colSpan={canEdit ? 12 : 10} style={{ color: "var(--text-muted)", fontStyle: "italic", fontSize: 12 }}>
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
