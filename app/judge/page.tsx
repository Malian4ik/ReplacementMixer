"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Team, Player, CandidateScore, ReplacementPoolEntry } from "@/types";
import { useUser } from "@/components/UserContext";

const MAX_DEVIATION = 800;

function rowClass(i: number, total: number): string {
  if (total <= 1) return "row-top";
  const norm = i / (total - 1);
  if (norm < 0.4) return "row-top";
  if (norm < 0.7) return "row-mid";
  return "row-low";
}

function rfColor(rf: number) {
  if (rf >= 1) return "#34d399";
  if (rf >= 0.8) return "#fbbf24";
  return "#f87171";
}

export default function JudgePage() {
  const qc = useQueryClient();
  const { user } = useUser();
  const canEdit = user?.role === "OWNER" || user?.role === "JUDGE";

  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ["teams"],
    queryFn: () => fetch("/api/teams").then(r => r.json()),
  });

  const { data: poolEntries = [] } = useQuery<ReplacementPoolEntry[]>({
    queryKey: ["pool", "Active"],
    queryFn: () => fetch("/api/replacement-pool?status=Active").then(r => r.json()),
  });

  const { data: stats } = useQuery<{ targetAvgMmr: number }>({
    queryKey: ["stats"],
    queryFn: () => fetch("/api/stats").then(r => r.json()),
  });

  const targetAvgMmr = stats?.targetAvgMmr ?? 9000;

  const [matchId, setMatchId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [replacedPlayerId, setReplacedPlayerId] = useState("");
  const [judgeName, setJudgeName] = useState("");
  const [comment, setComment] = useState("");
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<Player[]>([]);

  const selectedTeam = teams.find(t => t.id === teamId);
  const teamPlayers = selectedTeam?.players ?? [];
  const replacedPlayer = teamPlayers.find(p => p?.id === replacedPlayerId);
  const neededRole = replacedPlayer?.mainRole ?? 1;
  const currentTeamAvgMmr = selectedTeam?.avgMmr ?? targetAvgMmr;

  const { data: candidates = [], isLoading: loadingCandidates } = useQuery<CandidateScore[]>({
    queryKey: ["queue-judge", { teamId, replacedPlayerId, neededRole, targetAvgMmr }],
    queryFn: () => {
      if (!teamId || !replacedPlayerId) return Promise.resolve([]);
      const sp = new URLSearchParams({
        teamId, replacedPlayerId,
        neededRole: String(neededRole),
        targetAvgMmr: String(targetAvgMmr),
        maxDeviation: String(MAX_DEVIATION),
      });
      return fetch(`/api/replacement-queue?${sp}`).then(r => r.json());
    },
    enabled: !!teamId && !!replacedPlayerId && !!stats,
  });

  const selectedCandidate = candidates.find(c => c.poolEntryId === selectedCandidateId);

  const assignMutation = useMutation({
    mutationFn: async (poolEntryId: string) => {
      if (!selectedTeam || !replacedPlayer) throw new Error("Не выбран контекст");
      const res = await fetch(`/api/replacement-pool/${poolEntryId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: matchId || undefined,
          teamId, teamName: selectedTeam.name, neededRole,
          replacedPlayerId,
          replacedPlayerNick: replacedPlayer.nick,
          replacedPlayerMmr: replacedPlayer.mmr,
          targetAvgMmr, maxDeviation: MAX_DEVIATION,
          judgeName: judgeName || undefined,
          comment: comment || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pool"] });
      qc.invalidateQueries({ queryKey: ["queue-judge"] });
      qc.invalidateQueries({ queryKey: ["teams"] });
      qc.invalidateQueries({ queryKey: ["logs"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      setSelectedCandidateId(null);
      setReplacedPlayerId("");
    },
  });

  const addToPoolMutation = useMutation({
    mutationFn: async (playerId: string) => {
      const res = await fetch("/api/replacement-pool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, source: "manual_add", judgeName: judgeName || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pool"] });
      qc.invalidateQueries({ queryKey: ["queue-judge"] });
      setSearchQ("");
      setSearchResults([]);
    },
    onError: (e: Error) => alert(e.message),
  });

  async function handleSearch(q: string) {
    setSearchQ(q);
    if (!q.trim()) { setSearchResults([]); return; }
    const r = await fetch(`/api/players/search?q=${encodeURIComponent(q)}`);
    setSearchResults(await r.json());
  }

  const col: React.CSSProperties = {
    display: "flex", flexDirection: "column",
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden",
    minWidth: 0,
  };
  const colHeader: React.CSSProperties = {
    padding: "10px 14px",
    borderBottom: "1px solid var(--border)",
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    color: "var(--text-secondary)",
    flexShrink: 0,
  };
  const colBody: React.CSSProperties = {
    flex: 1, overflow: "auto", padding: "12px 14px",
  };
  const field: React.CSSProperties = { marginBottom: 10 };

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div className="page-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div className="page-title">Панель судьи</div>
          <div className="page-subtitle">Назначение замен для команд</div>
        </div>
        <div style={{
          display: "flex", gap: 16, alignItems: "center",
          padding: "6px 14px",
          background: "rgba(240,165,0,0.08)",
          border: "1px solid rgba(240,165,0,0.2)",
          borderRadius: 6,
        }}>
          <div>
            <div style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Target MMR</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "var(--accent)" }}>{targetAvgMmr.toLocaleString()}</div>
          </div>
          <div style={{ width: 1, height: 30, background: "var(--border)" }} />
          <div>
            <div style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Max Deviation</div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>±{MAX_DEVIATION}</div>
          </div>
          <div style={{ width: 1, height: 30, background: "var(--border)" }} />
          <div>
            <div style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>В пуле</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: poolEntries.length > 0 ? "#34d399" : "#f87171" }}>
              {poolEntries.length}
            </div>
          </div>
        </div>
      </div>

      {/* 3 columns */}
      <div className="judge-cols" style={{
        flex: 1, overflow: "hidden",
        display: "grid",
        gridTemplateColumns: "280px 1fr 260px",
        gap: 12,
        padding: "12px 16px",
      }}>

        {/* Col 1: Match context */}
        <div style={col}>
          <div style={colHeader}>Контекст матча</div>
          <div style={colBody}>
            <div style={field}>
              <div className="lbl">Match ID</div>
              <input className="form-input" value={matchId} onChange={e => setMatchId(e.target.value)} placeholder="Опционально" />
            </div>

            <div style={field}>
              <div className="lbl">Команда</div>
              <select className="form-select" value={teamId}
                onChange={e => { setTeamId(e.target.value); setReplacedPlayerId(""); setSelectedCandidateId(null); }}>
                <option value="">— выбрать —</option>
                {teams.map(t => (
                  <option key={t.id} value={t.id}>{t.name} · {t.avgMmr} MMR</option>
                ))}
              </select>
            </div>

            {selectedTeam && (
              <div style={field}>
                <div className="lbl">Состав — выбери заменяемого</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {teamPlayers.map((p, i) => p && (
                    <button
                      key={p.id}
                      onClick={() => { setReplacedPlayerId(p.id); setSelectedCandidateId(null); }}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "7px 10px", borderRadius: 5, cursor: "pointer",
                        background: replacedPlayerId === p.id ? "rgba(239,68,68,0.12)" : "rgba(0,0,0,0.2)",
                        border: `1px solid ${replacedPlayerId === p.id ? "#ef4444" : "var(--border)"}`,
                        color: "var(--text-primary)", fontSize: 12,
                        transition: "all 0.1s", textAlign: "left",
                      }}
                    >
                      <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <span style={{ color: "var(--text-muted)", fontSize: 10, minWidth: 10 }}>{i + 1}</span>
                        <span style={{ fontWeight: 500 }}>{p.nick}</span>
                      </span>
                      <span style={{ color: "var(--text-secondary)", fontSize: 11, fontFamily: "monospace" }}>
                        {p.mmr} · R{p.mainRole}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {replacedPlayer && (
              <div style={{
                padding: "8px 10px",
                background: "rgba(239,68,68,0.07)",
                border: "1px solid rgba(239,68,68,0.25)",
                borderRadius: 6, marginBottom: 10,
                fontSize: 12,
              }}>
                <div style={{ fontWeight: 600, color: "#f87171", marginBottom: 4 }}>
                  Заменяемый: {replacedPlayer.nick}
                </div>
                <div style={{ color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: 2 }}>
                  <span>MMR: {replacedPlayer.mmr.toLocaleString()} · Роль: R{replacedPlayer.mainRole}</span>
                  <span>Avg MMR команды: {currentTeamAvgMmr.toLocaleString()}</span>
                </div>
              </div>
            )}

            <div style={field}>
              <div className="lbl">Судья</div>
              <input className="form-input" value={judgeName} onChange={e => setJudgeName(e.target.value)} placeholder="Имя судьи" />
            </div>

            <div style={field}>
              <div className="lbl">Комментарий</div>
              <textarea
                className="form-input"
                value={comment}
                onChange={e => setComment(e.target.value)}
                rows={2}
                placeholder="Опционально"
                style={{ resize: "none" }}
              />
            </div>

            {selectedCandidate && (
              <div style={{
                padding: "8px 10px",
                background: "rgba(16,185,129,0.07)",
                border: "1px solid rgba(16,185,129,0.25)",
                borderRadius: 6, marginBottom: 10, fontSize: 12,
              }}>
                <div style={{ fontWeight: 600, color: "#34d399", marginBottom: 2 }}>
                  Выбрана замена: {selectedCandidate.nick}
                </div>
                <div style={{ color: "var(--text-secondary)" }}>
                  SubScore: <span style={{ fontFamily: "monospace", color: "#34d399" }}>{selectedCandidate.subScore.toFixed(4)}</span>
                  {" "}· MMR: {selectedCandidate.mmr.toLocaleString()}
                </div>
              </div>
            )}

            {canEdit && (
              <button
                className="btn btn-accent"
                style={{ width: "100%", justifyContent: "center", padding: "10px 0", fontSize: 13 }}
                disabled={!selectedCandidateId || !replacedPlayerId || assignMutation.isPending}
                onClick={() => selectedCandidateId && assignMutation.mutate(selectedCandidateId)}
              >
                {assignMutation.isPending ? "Назначаю..." : "✓ Назначить замену"}
              </button>
            )}

            {assignMutation.isSuccess && (
              <div style={{ color: "#34d399", fontSize: 12, marginTop: 6, textAlign: "center" }}>
                Замена назначена!
              </div>
            )}
            {assignMutation.isError && (
              <div style={{ color: "#f87171", fontSize: 12, marginTop: 6 }}>
                Ошибка: {(assignMutation.error as Error).message}
              </div>
            )}
          </div>
        </div>

        {/* Col 2: TOP-10 candidates */}
        <div style={col}>
          <div style={{ ...colHeader, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>ТОП-10 кандидатов</span>
            {replacedPlayer && (
              <span style={{ color: "var(--text-muted)", fontSize: 10, fontWeight: 400, textTransform: "none" }}>
                Нужная роль: R{neededRole}
              </span>
            )}
          </div>
          <div style={colBody}>
            {!replacedPlayerId ? (
              <div style={{ color: "var(--text-secondary)", textAlign: "center", paddingTop: 40, fontSize: 13 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>👆</div>
                Выберите заменяемого игрока слева
              </div>
            ) : loadingCandidates ? (
              <div style={{ color: "var(--text-secondary)", textAlign: "center", paddingTop: 40 }}>Расчёт SubScore...</div>
            ) : candidates.length === 0 ? (
              <div style={{ color: "var(--text-secondary)", textAlign: "center", paddingTop: 40 }}>Нет активных кандидатов в пуле</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {candidates.map((c, i) => {
                  const isSelected = selectedCandidateId === c.poolEntryId;
                  return (
                    <button
                      key={c.poolEntryId}
                      onClick={() => setSelectedCandidateId(isSelected ? null : c.poolEntryId)}
                      className={rowClass(i, candidates.length)}
                      style={{
                        display: "block", width: "100%", textAlign: "left",
                        padding: "10px 12px", borderRadius: 6, cursor: "pointer",
                        border: isSelected ? "1px solid var(--accent)" : "1px solid transparent",
                        outline: isSelected ? "1px solid var(--accent)" : "none",
                        transition: "all 0.1s",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            width: 20, height: 20, borderRadius: "50%", fontSize: 10, fontWeight: 700,
                            background: i === 0 ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.08)",
                            color: i === 0 ? "#34d399" : "var(--text-secondary)",
                          }}>{i + 1}</span>
                          <span style={{ fontWeight: 700, fontSize: 14 }}>{c.nick}</span>
                          {i === 0 && <span style={{ fontSize: 10, color: "#34d399", fontWeight: 600 }}>ЛУЧШИЙ</span>}
                        </span>
                        <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 13,
                          color: i === 0 ? "#34d399" : "var(--text-primary)" }}>
                          {c.subScore.toFixed(4)}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 10, fontSize: 11, color: "var(--text-secondary)" }}>
                        <span>{c.mmr.toLocaleString()} MMR</span>
                        <span>Stake: {c.stake}</span>
                        <span>R{c.mainRole}{c.flexRole ? `/R${c.flexRole}` : ""}</span>
                        <span style={{ color: rfColor(c.roleFit) }}>
                          RF: {c.roleFit >= 1 ? "Осн" : c.roleFit >= 0.8 ? "Флекс" : "Нет"}
                        </span>
                        <span>BF: {c.balanceFactor.toFixed(2)}</span>
                        <span>→ {Math.round(c.teamMmrAfter).toLocaleString()}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Col 3: Search + pool */}
        <div style={col}>
          <div style={colHeader}>Поиск и пул</div>
          <div style={colBody}>
            <div style={field}>
              <div className="lbl">Поиск игрока</div>
              <input
                className="form-input"
                value={searchQ}
                onChange={e => handleSearch(e.target.value)}
                placeholder="Введите ник..."
              />
            </div>

            {searchResults.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
                {searchResults.map(p => {
                  const inPool = poolEntries.some(e => e.playerId === p.id);
                  return (
                    <div key={p.id} style={{
                      padding: "8px 10px", borderRadius: 5,
                      background: "rgba(0,0,0,0.2)", border: "1px solid var(--border)", fontSize: 12,
                    }}>
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>{p.nick}</div>
                      <div style={{ color: "var(--text-secondary)", display: "flex", gap: 8, marginBottom: 6 }}>
                        <span>{p.mmr.toLocaleString()} MMR</span>
                        <span>S{p.stake}</span>
                        <span>R{p.mainRole}{p.flexRole ? `/R${p.flexRole}` : ""}</span>
                      </div>
                      {canEdit && (
                        <button
                          className={`btn btn-sm ${inPool ? "btn-ghost" : "btn-blue"}`}
                          disabled={inPool || addToPoolMutation.isPending}
                          onClick={() => addToPoolMutation.mutate(p.id)}
                        >
                          {inPool ? "Уже в пуле" : "+ В пул"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
              <div className="lbl" style={{ marginBottom: 8 }}>
                Активный пул замен · {poolEntries.length} игроков
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {poolEntries.length === 0 && (
                  <div style={{ color: "var(--text-muted)", fontSize: 12, textAlign: "center", padding: 12 }}>
                    Пул пуст
                  </div>
                )}
                {poolEntries.map((e, i) => (
                  <div key={e.id} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "5px 8px", borderRadius: 4,
                    background: i === 0 ? "rgba(16,185,129,0.06)" : "rgba(0,0,0,0.15)",
                    border: `1px solid ${i === 0 ? "rgba(16,185,129,0.2)" : "var(--border)"}`,
                    fontSize: 11,
                  }}>
                    <span style={{ fontWeight: 500 }}>{e.player.nick}</span>
                    <span style={{ color: "var(--text-secondary)", fontFamily: "monospace" }}>
                      {e.player.mmr.toLocaleString()} · S{e.player.stake}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
