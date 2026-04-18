"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Team, CandidateScore, SubstitutionPoolEntry } from "@/types";
import { useUser } from "@/components/UserContext";

interface WaveResponder {
  id: string;
  clickedAt: string;
  subScore: number | null;
  player: { id: string; nick: string; mmr: number; mainRole: number; flexRole: number | null; wallet: string | null };
}

interface ActiveSession {
  id: string;
  teamName: string;
  neededRole: number;
  replacedPlayerNick: string | null;
  currentWave: number;
  status: string;
  waves: Array<{
    id: string;
    waveNumber: number;
    status: string;
    endsAt: string;
    responses: WaveResponder[];
    candidates: Array<{ player: { nick: string } }>;
  }>;
}

const MAX_DEVIATION = 1000;
const EMPTY_SLOT = "__empty__";

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

function rfLabel(rf: number) {
  if (rf >= 1) return "Основная";
  if (rf >= 0.8) return "Флекс";
  return "Слабая";
}

export default function JudgePage() {
  const qc = useQueryClient();
  const { user } = useUser();
  const canEdit = user?.role === "OWNER" || user?.role === "JUDGE";

  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ["teams"],
    queryFn: () => fetch("/api/teams").then(r => r.json()),
  });

  const { data: poolEntries = [] } = useQuery<SubstitutionPoolEntry[]>({
    queryKey: ["pool", "Active"],
    queryFn: () => fetch("/api/substitution-pool?status=Active").then(r => r.json()),
  });

  const { data: stats } = useQuery<{ targetAvgMmr: number }>({
    queryKey: ["stats"],
    queryFn: () => fetch("/api/stats").then(r => r.json()),
  });

  const targetAvgMmr = stats?.targetAvgMmr ?? 9000;

  const [matchId, setMatchId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [replacedPlayerId, setReplacedPlayerId] = useState("");
  const [emptySlotRole, setEmptySlotRole] = useState<number>(1);
  const [judgeName, setJudgeName] = useState("");
  const [comment, setComment] = useState("");
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [candidatePage, setCandidatePage] = useState(1);
  const [walletSearch, setWalletSearch] = useState("");
  const [walletSearchResult, setWalletSearchResult] = useState<{ found: boolean; position: number | null; page: number | null; poolEntryId: string | null } | null>(null);
  const [highlightedEntryId, setHighlightedEntryId] = useState<string | null>(null);
  const [discordPending, setDiscordPending] = useState(false);
  const [discordResult, setDiscordResult] = useState<{ sessionId: string; teamName: string } | null>(null);
  const [discordError, setDiscordError] = useState<string | null>(null);
  const [cancelPending, setCancelPending] = useState(false);

  const selectedTeam = teams.find(t => t.id === teamId);
  const teamPlayers = selectedTeam?.players ?? [];
  const activePlayerCount = teamPlayers.filter(Boolean).length;
  const replacedPlayer = teamPlayers.find(p => p?.id === replacedPlayerId) ?? null;
  const isEmptySlot = replacedPlayerId === EMPTY_SLOT;
  const neededRole = isEmptySlot ? emptySlotRole : (replacedPlayer?.mainRole ?? 1);
  const currentTeamAvgMmr = selectedTeam?.avgMmr ?? targetAvgMmr;

  async function handleWalletSearch() {
    if (!walletSearch.trim()) return;
    const res = await fetch(`/api/substitution-queue?searchWallet=${encodeURIComponent(walletSearch.trim())}`);
    const data = await res.json();
    const result = data.walletSearchResult;
    setWalletSearchResult(result);
    if (result?.found && result.page) {
      setCandidatePage(result.page);
      setHighlightedEntryId(result.poolEntryId);
      setTimeout(() => setHighlightedEntryId(null), 4000);
    }
  }

  const { data: queueData, isLoading: loadingCandidates } = useQuery({
    queryKey: ["queue-judge", { teamId, replacedPlayerId, neededRole, targetAvgMmr, candidatePage }],
    queryFn: () => {
      if (!teamId || !replacedPlayerId) return Promise.resolve({ candidates: [], totalPages: 1, total: 0, page: 1 });
      const sp = new URLSearchParams({
        teamId,
        replacedPlayerId: isEmptySlot ? "" : replacedPlayerId,
        neededRole: String(neededRole),
        targetAvgMmr: String(targetAvgMmr),
        maxDeviation: String(MAX_DEVIATION),
        page: String(candidatePage),
      });
      return fetch(`/api/substitution-queue?${sp}`).then(r => r.json());
    },
    enabled: !!teamId && !!replacedPlayerId && !!stats,
  });

  const candidates: CandidateScore[] = queueData?.candidates ?? [];
  const candidateTotalPages: number = queueData?.totalPages ?? 1;
  const selectedCandidate = candidates.find(c => c.poolEntryId === selectedCandidateId);
  const focusedCandidate = selectedCandidate ?? (candidates.length > 0 ? candidates[0] : null);

  const { data: activeSessionData, refetch: refetchActiveSession } = useQuery<{ session: ActiveSession | null }>({
    queryKey: ["active-session", teamId],
    queryFn: () => teamId
      ? fetch(`/api/judge/active-session?teamId=${teamId}`).then(r => r.json())
      : Promise.resolve({ session: null }),
    enabled: !!teamId,
    refetchInterval: 4000,
  });
  const activeSession = activeSessionData?.session ?? null;
  const activeWave = activeSession?.waves?.[0] ?? null;

  const pickResponderMutation = useMutation({
    mutationFn: ({ sessionId, playerId }: { sessionId: string; playerId: string }) =>
      fetch("/api/judge/pick-responder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, playerId, judgeName: judgeName.trim(), comment }),
      }).then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Ошибка");
        return d;
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pool"] });
      qc.invalidateQueries({ queryKey: ["queue-judge"] });
      qc.invalidateQueries({ queryKey: ["teams"] });
      qc.invalidateQueries({ queryKey: ["logs"] });
      refetchActiveSession();
      setDiscordResult(null);
    },
  });

  async function handleCancelSession() {
    if (!teamId) return;
    setCancelPending(true);
    await fetch(`/api/judge/active-session?teamId=${teamId}`, { method: "DELETE" });
    setCancelPending(false);
    setDiscordResult(null);
    refetchActiveSession();
  }

  async function handleDiscordSearch() {
    if (!teamId || !replacedPlayerId || !judgeName.trim()) return;
    setDiscordPending(true);
    setDiscordResult(null);
    setDiscordError(null);
    try {
      const res = await fetch("/api/judge/start-discord-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          replacedPlayerId: replacedPlayerId === EMPTY_SLOT ? undefined : replacedPlayerId,
          neededRole,
          judgeName: judgeName.trim(),
          targetAvgMmr,
          maxDeviation: MAX_DEVIATION,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка сервера");
      setDiscordResult({ sessionId: data.sessionId, teamName: data.teamName });
    } catch (err: unknown) {
      setDiscordError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setDiscordPending(false);
    }
  }

  const assignMutation = useMutation({
    mutationFn: async (poolEntryId: string) => {
      if (!selectedTeam) throw new Error("Не выбрана команда");
      if (!judgeName.trim()) throw new Error("Укажите имя судьи");
      const res = await fetch(`/api/substitution-pool/${poolEntryId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: matchId || undefined,
          teamId,
          teamName: selectedTeam.name,
          neededRole,
          replacedPlayerId: isEmptySlot ? undefined : replacedPlayerId || undefined,
          replacedPlayerNick: replacedPlayer?.nick,
          replacedPlayerMmr: replacedPlayer?.mmr,
          targetAvgMmr,
          maxDeviation: MAX_DEVIATION,
          judgeName: judgeName.trim(),
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

  const col: React.CSSProperties = {
    display: "flex", flexDirection: "column",
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden",
    minWidth: 0,
  };
  const colHeader: React.CSSProperties = {
    padding: "8px 14px",
    borderBottom: "1px solid var(--border)",
    fontSize: 11, fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.07em",
    color: "var(--text-secondary)", flexShrink: 0,
  };
  const colBody: React.CSSProperties = { flex: 1, overflow: "auto", padding: "10px 14px" };
  const field: React.CSSProperties = { marginBottom: 8 };

  if (!canEdit) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 40 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>Нет доступа</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Панель судьи доступна только для JUDGE и OWNER</div>
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* ── Header ── */}
      <div className="page-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div className="page-title">Панель судьи</div>
          <div className="page-subtitle">Назначение замен для команд</div>
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center", padding: "6px 14px", background: "rgba(240,165,0,0.08)", border: "1px solid rgba(240,165,0,0.2)", borderRadius: 6, flexWrap: "wrap" }}>
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
            <div style={{ fontSize: 17, fontWeight: 700, color: poolEntries.length > 0 ? "#34d399" : "#f87171" }}>{poolEntries.length}</div>
          </div>
          <div style={{ width: 1, height: 30, background: "var(--border)" }} />
          <div>
            <div style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Нужная роль</div>
            <div style={{ display: "flex", gap: 3 }}>
              {[1, 2, 3, 4, 5].map(r => {
                const isCurrent = neededRole === r;
                return (
                  <button key={r}
                    onClick={() => { if (!replacedPlayer) setEmptySlotRole(r); }}
                    style={{
                      padding: "3px 8px", borderRadius: 4, fontSize: 11, cursor: replacedPlayer ? "default" : "pointer",
                      background: isCurrent ? "var(--accent)" : "rgba(255,255,255,0.06)",
                      border: `1px solid ${isCurrent ? "var(--accent)" : "var(--border)"}`,
                      color: isCurrent ? "#000" : "var(--text-secondary)",
                      fontWeight: isCurrent ? 700 : 400,
                      opacity: replacedPlayer && replacedPlayer.mainRole !== r ? 0.4 : 1,
                    }}>
                    R{r}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="judge-cols" style={{ flex: 1, overflow: "hidden", display: "grid", gridTemplateColumns: "260px minmax(0, 560px) 380px", gap: 12, padding: "12px 16px" }}>

        {/* ── Col 1 — Контекст ── */}
        <div style={col}>
          <div style={colHeader}>Контекст матча</div>
          <div style={colBody}>
            <div style={field}>
              <div className="lbl">Match ID</div>
              <input className="form-input" value={matchId} onChange={e => setMatchId(e.target.value)} placeholder="Опционально" />
            </div>

            <div style={field}>
              <div className="lbl">Команда</div>
              <select className="form-select" value={teamId} onChange={e => { setTeamId(e.target.value); setReplacedPlayerId(""); setSelectedCandidateId(null); setCandidatePage(1); }}>
                <option value="">— выбрать —</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name} · {t.avgMmr} MMR</option>)}
              </select>
            </div>

            {selectedTeam && (
              <div style={field}>
                <div className="lbl">Состав ({activePlayerCount}/5)</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {teamPlayers.map((p, i) => {
                    if (p) {
                      const isSel = replacedPlayerId === p.id;
                      return (
                        <button key={p.id}
                          onClick={() => { setReplacedPlayerId(isSel ? "" : p.id); setSelectedCandidateId(null); setCandidatePage(1); }}
                          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", borderRadius: 5, cursor: "pointer", background: isSel ? "rgba(239,68,68,0.12)" : "rgba(0,0,0,0.2)", border: `1px solid ${isSel ? "#ef4444" : "var(--border)"}`, color: "var(--text-primary)", fontSize: 12, transition: "all 0.1s", textAlign: "left" }}>
                          <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <span style={{ color: "var(--text-muted)", fontSize: 10, minWidth: 10 }}>{i + 1}</span>
                            <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                              <span style={{ fontWeight: 500 }}>{p.nick}</span>
                              {p.wallet && <span style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "monospace" }}>{p.wallet}</span>}
                            </span>
                          </span>
                          <span style={{ color: isSel ? "#f87171" : "var(--text-secondary)", fontSize: 11, fontFamily: "monospace" }}>{p.mmr} · R{p.mainRole}</span>
                        </button>
                      );
                    } else {
                      const isSel = replacedPlayerId === EMPTY_SLOT;
                      return (
                        <button key={`empty-${i}`}
                          onClick={() => { setReplacedPlayerId(isSel ? "" : EMPTY_SLOT); setSelectedCandidateId(null); setCandidatePage(1); }}
                          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", borderRadius: 5, cursor: "pointer", background: isSel ? "rgba(16,185,129,0.12)" : "rgba(0,0,0,0.1)", border: `1px dashed ${isSel ? "#34d399" : "rgba(255,255,255,0.15)"}`, color: isSel ? "#34d399" : "var(--text-muted)", fontSize: 12, transition: "all 0.1s", textAlign: "left" }}>
                          <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <span style={{ fontSize: 10, minWidth: 10 }}>{i + 1}</span>
                            <span>— пустое место</span>
                          </span>
                          <span style={{ fontSize: 10 }}>+ добавить</span>
                        </button>
                      );
                    }
                  })}
                </div>
              </div>
            )}

            {isEmptySlot && (
              <div style={{ padding: "6px 10px", background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 6, marginBottom: 8, fontSize: 12 }}>
                <span style={{ fontWeight: 600, color: "#34d399" }}>Пустой слот · R{emptySlotRole}</span>
                <span style={{ color: "var(--text-muted)", marginLeft: 8 }}>{activePlayerCount}/5 игроков</span>
              </div>
            )}

            <div style={field}>
              <div className="lbl">Судья <span style={{ color: "#f87171" }}>*</span></div>
              <input className="form-input" value={judgeName} onChange={e => setJudgeName(e.target.value)} placeholder="Обязательно" style={!judgeName.trim() ? { borderColor: "rgba(239,68,68,0.5)" } : {}} />
            </div>

            <div style={{ ...field, flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div className="lbl">Комментарий</div>
              <textarea className="form-input" value={comment} onChange={e => setComment(e.target.value)} placeholder="Опционально" style={{ resize: "none", flex: 1, minHeight: 60 }} />
            </div>

            {/* Active Discord session */}
            {activeSession && (
              <div style={{ marginTop: 8, padding: "10px 12px", background: "rgba(88,101,242,0.08)", border: "1px solid rgba(88,101,242,0.3)", borderRadius: 7 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#7289da", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    ⚡ Discord · Волна {activeSession.currentWave}
                  </div>
                  <button
                    style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.08)", color: "#f87171", cursor: cancelPending ? "not-allowed" : "pointer" }}
                    onClick={handleCancelSession}
                    disabled={cancelPending}
                  >
                    {cancelPending ? "..." : "Отменить"}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>
                  {activeSession.teamName} · R{activeSession.neededRole}
                  {activeSession.replacedPlayerNick ? ` · ${activeSession.replacedPlayerNick}` : ""}
                </div>

                {activeWave && (
                  <>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>
                      Откликнулись: {activeWave.responses.length}/{activeWave.candidates.length}
                      {" · до "}
                      {new Date(activeWave.endsAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </div>
                    {activeWave.responses.length === 0
                      ? <div style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>Ждём откликов...</div>
                      : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {activeWave.responses.map(r => (
                            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 8px", borderRadius: 5, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(88,101,242,0.2)" }}>
                              <div>
                                <span style={{ fontWeight: 600, fontSize: 12 }}>{r.player.nick}</span>
                                <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 6 }}>
                                  {r.player.mmr.toLocaleString()} · R{r.player.mainRole}
                                  {r.subScore != null ? ` · ${r.subScore.toFixed(3)}` : ""}
                                </span>
                              </div>
                              <button
                                style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, border: "1px solid rgba(16,185,129,0.4)", background: "rgba(16,185,129,0.1)", color: "#34d399", cursor: judgeName.trim() ? "pointer" : "not-allowed", opacity: judgeName.trim() ? 1 : 0.5 }}
                                disabled={!judgeName.trim() || pickResponderMutation.isPending}
                                onClick={() => pickResponderMutation.mutate({ sessionId: activeSession.id, playerId: r.player.id })}
                              >
                                Выбрать
                              </button>
                            </div>
                          ))}
                        </div>
                      )
                    }
                    {pickResponderMutation.isError && <div style={{ color: "#f87171", fontSize: 11, marginTop: 4 }}>{(pickResponderMutation.error as Error).message}</div>}
                    {pickResponderMutation.isSuccess && <div style={{ color: "#34d399", fontSize: 11, marginTop: 4 }}>Замена назначена!</div>}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Col 2 — Кандидаты ── */}
        <div style={col}>
          <div style={{ ...colHeader, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Кандидаты · {candidatePage}/{candidateTotalPages}</span>
            {replacedPlayerId && <span style={{ color: "var(--text-muted)", fontSize: 10, fontWeight: 400, textTransform: "none" }}>Нужная роль: R{neededRole}</span>}
          </div>

          <div style={colBody}>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <input
                className="form-input"
                value={walletSearch}
                onChange={e => { setWalletSearch(e.target.value); setWalletSearchResult(null); }}
                onKeyDown={e => e.key === "Enter" && handleWalletSearch()}
                placeholder="Поиск по кошельку..."
                style={{ flex: 1, fontSize: 12 }}
              />
              <button className="btn btn-ghost btn-sm" onClick={handleWalletSearch} style={{ flexShrink: 0 }}>Найти</button>
            </div>

            {walletSearchResult && (
              <div style={{ marginBottom: 8, padding: "5px 10px", borderRadius: 5, fontSize: 11, background: walletSearchResult.found ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)", border: `1px solid ${walletSearchResult.found ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`, color: walletSearchResult.found ? "#34d399" : "#f87171" }}>
                {walletSearchResult.found
                  ? `Найден · стр. ${walletSearchResult.page} · позиция #${walletSearchResult.position}`
                  : "Игрок не найден в пуле замен"}
              </div>
            )}

            {!replacedPlayerId ? (
              <div style={{ color: "var(--text-secondary)", textAlign: "center", paddingTop: 40, fontSize: 13 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>👆</div>
                Выберите игрока или пустой слот слева
              </div>
            ) : loadingCandidates ? (
              <div style={{ color: "var(--text-secondary)", textAlign: "center", paddingTop: 40 }}>Расчёт SubScore...</div>
            ) : candidates.length === 0 ? (
              <div style={{ color: "var(--text-secondary)", textAlign: "center", paddingTop: 40 }}>Нет активных кандидатов в пуле</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {candidateTotalPages > 1 && (
                  <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                    <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} disabled={candidatePage === 1} onClick={() => setCandidatePage(p => p - 1)}>← Назад</button>
                    {Array.from({ length: candidateTotalPages }, (_, i) => i + 1).map(p => (
                      <button key={p} onClick={() => setCandidatePage(p)} style={{ minWidth: 30, padding: "2px 6px", borderRadius: 4, border: p === candidatePage ? "1px solid var(--accent)" : "1px solid rgba(0,212,232,0.2)", background: p === candidatePage ? "rgba(0,212,232,0.15)" : "transparent", color: p === candidatePage ? "var(--accent)" : "var(--text-muted)", fontSize: 11, cursor: "pointer", fontWeight: 700 }}>{p}</button>
                    ))}
                    <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} disabled={candidatePage === candidateTotalPages} onClick={() => setCandidatePage(p => p + 1)}>Вперёд →</button>
                  </div>
                )}
                {candidates.map((c, i) => {
                  const isSelected = selectedCandidateId === c.poolEntryId;
                  const isHighlighted = highlightedEntryId === c.poolEntryId;
                  return (
                    <button key={c.poolEntryId} onClick={() => setSelectedCandidateId(isSelected ? null : c.poolEntryId)}
                      className={rowClass(i, candidates.length)}
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 10px", borderRadius: 6, cursor: "pointer", border: isHighlighted ? "2px solid #fbbf24" : isSelected ? "1px solid var(--accent)" : "1px solid transparent", outline: isSelected && !isHighlighted ? "1px solid var(--accent)" : "none", background: isHighlighted ? "rgba(251,191,36,0.08)" : undefined, transition: "all 0.1s" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: "50%", fontSize: 10, fontWeight: 700, background: i === 0 ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.08)", color: i === 0 ? "#34d399" : "var(--text-secondary)", flexShrink: 0 }}>{i + 1}</span>
                          <span style={{ fontWeight: 700, fontSize: 13 }}>{c.nick}</span>
                          {i === 0 && <span style={{ fontSize: 9, color: "#34d399", fontWeight: 600, background: "rgba(16,185,129,0.12)", padding: "1px 5px", borderRadius: 3 }}>ЛУЧШИЙ</span>}
                          {isHighlighted && <span style={{ fontSize: 9, color: "#fbbf24", fontWeight: 600 }}>НАЙДЕН</span>}
                        </span>
                        <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 12, color: i === 0 ? "#34d399" : "var(--text-primary)" }}>{c.subScore.toFixed(4)}</span>
                      </div>
                      <div style={{ display: "flex", gap: 8, fontSize: 10, color: "var(--text-secondary)", marginTop: 2, paddingLeft: 25 }}>
                        <span>{c.mmr.toLocaleString()} MMR</span>
                        <span>S:{c.stake}</span>
                        <span>R{c.mainRole}{c.flexRole ? `/R${c.flexRole}` : ""}</span>
                        <span style={{ color: rfColor(c.roleFit) }}>RF:{c.roleFit >= 1 ? "Осн" : c.roleFit >= 0.8 ? "Флекс" : "Нет"}</span>
                        <span>BF:{c.balanceFactor.toFixed(2)}</span>
                        <span>→ {Math.round(c.teamMmrAfter).toLocaleString()}</span>
                        {c.wallet && <span style={{ color: "var(--accent)", fontFamily: "monospace" }}>{c.wallet}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Col 3 — Рекомендация + действия ── */}
        <div style={col}>
          <div style={{ ...colHeader, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Рекомендация</span>
            {focusedCandidate && (
              <span style={{ fontFamily: "monospace", fontSize: 12, color: "#34d399", fontWeight: 800, background: "rgba(16,185,129,0.15)", padding: "1px 7px", borderRadius: 4, textTransform: "none" }}>
                {focusedCandidate.subScore.toFixed(4)}
              </span>
            )}
          </div>
          <div style={{ ...colBody, display: "flex", flexDirection: "column", gap: 0, padding: 0 }}>

            {/* Scrollable top: recommendation content */}
            <div style={{ flex: 1, overflow: "auto", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            {!focusedCandidate ? (
              <div style={{ color: "var(--text-muted)", fontSize: 12, textAlign: "center", paddingTop: 60 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🎯</div>
                Выберите команду и игрока<br />для получения рекомендации
              </div>
            ) : (
              <>
                {/* Name */}
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1 }}>{focusedCandidate.nick}</div>
                  {replacedPlayer && (
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
                      Замена для <span style={{ color: "#f87171" }}>{replacedPlayer.nick}</span>
                      <span style={{ marginLeft: 6, color: "var(--text-muted)" }}>{replacedPlayer.mmr.toLocaleString()} MMR · R{replacedPlayer.mainRole}</span>
                    </div>
                  )}
                  {isEmptySlot && (
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>Пустой слот · R{emptySlotRole}</div>
                  )}
                </div>

                {/* Compact stats */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {[
                    { label: "MMR", value: focusedCandidate.mmr.toLocaleString() },
                    { label: "Stake", value: String(focusedCandidate.stake) },
                    { label: "Роль", value: `R${focusedCandidate.mainRole}${focusedCandidate.flexRole ? `/R${focusedCandidate.flexRole}` : ""}` },
                    { label: "→ MMR", value: Math.round(focusedCandidate.teamMmrAfter).toLocaleString() },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ flex: "1 1 calc(50% - 3px)", background: "rgba(0,0,0,0.25)", border: "1px solid var(--border)", borderRadius: 5, padding: "5px 8px" }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "monospace", marginTop: 1 }}>{value}</div>
                    </div>
                  ))}
                </div>

                {/* Role fit + BF + Wallet row */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                    <span style={{ color: "var(--text-muted)" }}>Role Fit</span>
                    <span style={{ fontWeight: 600, color: rfColor(focusedCandidate.roleFit) }}>{rfLabel(focusedCandidate.roleFit)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                    <span style={{ color: "var(--text-muted)" }}>Balance Factor</span>
                    <span style={{ fontWeight: 600 }}>{focusedCandidate.balanceFactor.toFixed(2)}</span>
                  </div>
                  {focusedCandidate.wallet && (
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                      <span style={{ color: "var(--text-muted)" }}>Кошелёк</span>
                      <span style={{ fontFamily: "monospace", fontSize: 11, color: "var(--accent)" }}>{focusedCandidate.wallet}</span>
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ flex: 1 }}
                    onClick={() => setSelectedCandidateId(focusedCandidate.poolEntryId)}
                    disabled={selectedCandidateId === focusedCandidate.poolEntryId}
                  >
                    Выбрать
                  </button>
                  <button
                    className="btn btn-accent btn-sm"
                    style={{ flex: 1 }}
                    disabled={!replacedPlayerId || !judgeName.trim() || assignMutation.isPending}
                    onClick={() => assignMutation.mutate(focusedCandidate.poolEntryId)}
                  >
                    {assignMutation.isPending ? "..." : "✓ Назначить"}
                  </button>
                </div>
                {assignMutation.isSuccess && <div style={{ color: "#34d399", fontSize: 12, textAlign: "center" }}>{isEmptySlot ? "Игрок добавлен!" : "Замена назначена!"}</div>}
                {assignMutation.isError && <div style={{ color: "#f87171", fontSize: 12 }}>Ошибка: {(assignMutation.error as Error).message}</div>}
              </>
            )}
            </div>

            {/* Fixed bottom: Discord search + pool */}
            <div style={{ flexShrink: 0, borderTop: "1px solid var(--border)", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 10 }}>

            {/* Discord search */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
                Поиск через Discord-бот
              </div>
              <button
                style={{
                  width: "100%", padding: "9px 0", borderRadius: 6,
                  border: "1px solid rgba(88,101,242,0.4)",
                  background: discordPending ? "rgba(88,101,242,0.15)" : "rgba(88,101,242,0.08)",
                  color: discordPending ? "#7289da" : "rgba(88,101,242,0.9)",
                  fontSize: 13, fontWeight: 700,
                  cursor: (!teamId || !replacedPlayerId || !judgeName.trim() || discordPending) ? "not-allowed" : "pointer",
                  opacity: (!teamId || !replacedPlayerId || !judgeName.trim()) ? 0.5 : 1,
                  transition: "all 0.15s",
                }}
                disabled={!teamId || !replacedPlayerId || !judgeName.trim() || discordPending}
                onClick={handleDiscordSearch}
              >
                {discordPending ? "Запускаю поиск..." : "🔍 Начать поиск в Discord"}
              </button>
              {discordResult && (
                <div style={{ marginTop: 6, padding: "6px 10px", background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 5, fontSize: 11, color: "#34d399" }}>
                  ✅ Сессия создана · <b>{discordResult.teamName}</b>
                </div>
              )}
              {discordError && (
                <div style={{ marginTop: 6, padding: "6px 10px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 5, fontSize: 11, color: "#f87171" }}>
                  ❌ {discordError}
                </div>
              )}
            </div>

            {/* Pool list */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>
                Пул замен · {poolEntries.length}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 120, overflowY: "auto" }}>
                {poolEntries.length === 0 && <div style={{ color: "var(--text-muted)", fontSize: 11, padding: "6px 0" }}>Пул пуст</div>}
                {poolEntries.map((e, i) => (
                  <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 6px", borderRadius: 3, background: i === 0 ? "rgba(16,185,129,0.06)" : "rgba(0,0,0,0.15)", border: `1px solid ${i === 0 ? "rgba(16,185,129,0.2)" : "var(--border)"}`, fontSize: 10 }}>
                    <span style={{ fontWeight: 500 }}>{e.player.nick}</span>
                    <span style={{ color: "var(--text-secondary)", fontFamily: "monospace" }}>{e.player.mmr.toLocaleString()} · S{e.player.stake}</span>
                  </div>
                ))}
              </div>
            </div>

            </div>{/* end fixed bottom */}
          </div>
        </div>

      </div>
    </div>
  );
}
