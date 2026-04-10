"use client";

import { useState, type CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CandidateScore, ReplacementPoolEntry, Team } from "@/types";
import { useUser } from "@/components/UserContext";

const MAX_DEVIATION = 1000;
const EMPTY_SLOT = "__empty__";

function rfColor(rf: number) {
  if (rf >= 1) return "#34d399";
  if (rf >= 0.8) return "#fbbf24";
  return "#f87171";
}

function roleFitLabel(rf: number) {
  if (rf >= 1) return "Основная роль";
  if (rf >= 0.8) return "Флекс";
  return "Слабое совпадение";
}

function searchStatusLabel(status: string) {
  switch (status) {
    case "IN_PROGRESS":
      return "Идет поиск";
    case "WAITING_CONFIRMATION":
      return "Ждет подтверждения";
    case "COMPLETED":
      return "Завершен";
    case "FAILED":
      return "Ошибка";
    case "CANCELLED":
      return "Отменен";
    default:
      return status;
  }
}

interface ActiveSearchSession {
  id: string;
  status: string;
  currentWaveNumber: number;
  recommendedPlayerId: string | null;
  recommendedPoolEntryId: string | null;
  recommendationRank: number | null;
  recommendationScore: number | null;
  recommendedPlayer?: {
    id: string;
    nick: string;
    mmr: number;
    mainRole: number;
    flexRole: number | null;
  } | null;
  waves?: {
    id: string;
    waveNumber: number;
    status: string;
    expiresAt: string;
    responses?: { id: string }[];
    candidates?: { id: string; respondedReady: boolean }[];
  }[];
}

export default function JudgePage() {
  const qc = useQueryClient();
  const { user } = useUser();
  const canEdit = user?.role === "OWNER" || user?.role === "JUDGE";

  const [matchId, setMatchId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [replacedPlayerId, setReplacedPlayerId] = useState("");
  const [emptySlotRole, setEmptySlotRole] = useState<number>(1);
  const [judgeName, setJudgeName] = useState("");
  const [comment, setComment] = useState("");
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [candidatePage, setCandidatePage] = useState(1);

  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ["teams"],
    queryFn: () => fetch("/api/teams").then((r) => r.json()),
  });

  const { data: poolEntries = [] } = useQuery<ReplacementPoolEntry[]>({
    queryKey: ["pool", "Active"],
    queryFn: () => fetch("/api/replacement-pool?status=Active").then((r) => r.json()),
  });

  const { data: stats } = useQuery<{ targetAvgMmr: number }>({
    queryKey: ["stats"],
    queryFn: () => fetch("/api/stats").then((r) => r.json()),
  });

  const { data: activeSearchSession } = useQuery<ActiveSearchSession | null>({
    queryKey: ["discord-replacement-search", teamId],
    queryFn: async () => {
      if (!teamId) return null;
      const res = await fetch(`/api/discord/replacement-search?teamId=${encodeURIComponent(teamId)}`);
      if (!res.ok) throw new Error((await res.json()).error ?? "SEARCH_LOAD_FAILED");
      return res.json();
    },
    enabled: !!teamId,
    refetchInterval: 5000,
  });

  const targetAvgMmr = stats?.targetAvgMmr ?? 9000;
  const selectedTeam = teams.find((t) => t.id === teamId);
  const teamPlayers = selectedTeam?.players ?? [];
  const activePlayerCount = teamPlayers.filter(Boolean).length;
  const replacedPlayer = teamPlayers.find((p) => p?.id === replacedPlayerId) ?? null;
  const isEmptySlot = replacedPlayerId === EMPTY_SLOT;
  const neededRole = isEmptySlot ? emptySlotRole : (replacedPlayer?.mainRole ?? 1);
  const currentTeamAvgMmr = selectedTeam?.avgMmr ?? targetAvgMmr;

  const { data: queueData, isLoading: loadingCandidates } = useQuery({
    queryKey: ["queue-judge", { teamId, replacedPlayerId, neededRole, targetAvgMmr, candidatePage }],
    queryFn: () => {
      if (!teamId || !replacedPlayerId) {
        return Promise.resolve({ candidates: [], totalPages: 1, total: 0, page: 1 });
      }

      const sp = new URLSearchParams({
        teamId,
        replacedPlayerId: isEmptySlot ? "" : replacedPlayerId,
        neededRole: String(neededRole),
        targetAvgMmr: String(targetAvgMmr),
        maxDeviation: String(MAX_DEVIATION),
        page: String(candidatePage),
      });
      return fetch(`/api/replacement-queue?${sp}`).then((r) => r.json());
    },
    enabled: !!teamId && !!replacedPlayerId && !!stats,
  });

  const candidates: CandidateScore[] = queueData?.candidates ?? [];
  const candidateTotalPages = queueData?.totalPages ?? 1;
  const selectedCandidate = candidates.find((candidate) => candidate.poolEntryId === selectedCandidateId) ?? null;
  const focusCandidate = selectedCandidate ?? candidates[0] ?? null;
  const currentWave = activeSearchSession?.waves?.find((wave) => wave.waveNumber === activeSearchSession.currentWaveNumber) ?? null;
  const readyCount = currentWave?.candidates?.filter((candidate) => candidate.respondedReady).length ?? currentWave?.responses?.length ?? 0;
  const waveEndsAt = currentWave?.expiresAt ? new Date(currentWave.expiresAt) : null;
  const waitingForWaveClosure = activeSearchSession?.status === "IN_PROGRESS" && Boolean(currentWave);

  const assignMutation = useMutation({
    mutationFn: async (poolEntryId: string) => {
      if (!selectedTeam) throw new Error("Выберите команду");
      if (!judgeName.trim()) throw new Error("Укажите имя судьи");
      if (!replacedPlayerId) throw new Error("Выберите игрока или пустой слот");

      const res = await fetch(`/api/replacement-pool/${poolEntryId}/assign`, {
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

  const searchMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTeam) throw new Error("Выберите команду");
      if (!judgeName.trim()) throw new Error("Укажите имя судьи");
      if (!replacedPlayerId && !isEmptySlot) throw new Error("Выберите игрока или пустой слот");

      const res = await fetch("/api/discord/replacement-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          replacedPlayerId: isEmptySlot ? undefined : replacedPlayerId || undefined,
          neededRole,
          matchId: matchId || undefined,
          comment: comment || undefined,
          judgeName: judgeName.trim(),
        }),
      });

      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["discord-replacement-search", teamId] });
    },
  });

  const confirmSearchMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await fetch(`/api/discord/replacement-search/${sessionId}/confirm`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["discord-replacement-search", teamId] });
      qc.invalidateQueries({ queryKey: ["pool"] });
      qc.invalidateQueries({ queryKey: ["teams"] });
      qc.invalidateQueries({ queryKey: ["logs"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      setSelectedCandidateId(null);
      setReplacedPlayerId("");
    },
  });

  const nextCandidateMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await fetch(`/api/discord/replacement-search/${sessionId}/next`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["discord-replacement-search", teamId] });
    },
  });

  const cancelSearchMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await fetch(`/api/discord/replacement-search/${sessionId}/cancel`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["discord-replacement-search", teamId] });
    },
  });

  const closeWaveNowMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await fetch(`/api/discord/replacement-search/${sessionId}/close-now`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["discord-replacement-search", teamId] });
    },
  });

  const col: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    overflow: "hidden",
    minWidth: 0,
  };

  const colHeader: CSSProperties = {
    padding: "10px 14px",
    borderBottom: "1px solid var(--border)",
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    color: "var(--text-secondary)",
    flexShrink: 0,
  };

  const colBody: CSSProperties = { flex: 1, overflow: "auto", padding: "12px 14px" };
  const field: CSSProperties = { marginBottom: 10 };

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
      <div className="page-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div className="page-title">Панель судьи</div>
          <div className="page-subtitle">Быстрый выбор замены, Discord-поиск и финальное подтверждение в одном экране</div>
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
              {[1, 2, 3, 4, 5].map((role) => {
                const active = replacedPlayer ? replacedPlayer.mainRole === role : emptySlotRole === role;
                const current = neededRole === role;
                return (
                  <button
                    key={role}
                    onClick={() => {
                      if (!replacedPlayer) setEmptySlotRole(role);
                    }}
                    style={{
                      padding: "3px 8px",
                      borderRadius: 4,
                      fontSize: 11,
                      cursor: replacedPlayer ? "default" : "pointer",
                      background: current ? "var(--accent)" : "rgba(255,255,255,0.06)",
                      border: `1px solid ${current ? "var(--accent)" : "var(--border)"}`,
                      color: current ? "#000" : "var(--text-secondary)",
                      fontWeight: current ? 700 : 400,
                      opacity: replacedPlayer && !active ? 0.4 : 1,
                    }}
                  >
                    R{role}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="judge-cols" style={{ flex: 1, overflow: "hidden", display: "grid", gridTemplateColumns: "300px minmax(620px,1fr) 260px", gap: 12, padding: "12px 16px" }}>
        <div style={col}>
          <div style={colHeader}>Контекст матча</div>
          <div style={colBody}>
            <div style={field}>
              <div className="lbl">Match ID</div>
              <input className="form-input" value={matchId} onChange={(e) => setMatchId(e.target.value)} placeholder="Опционально" />
            </div>

            <div style={field}>
              <div className="lbl">Команда</div>
              <select
                className="form-select"
                value={teamId}
                onChange={(e) => {
                  setTeamId(e.target.value);
                  setReplacedPlayerId("");
                  setSelectedCandidateId(null);
                  setCandidatePage(1);
                }}
              >
                <option value="">— выбрать —</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name} · {team.avgMmr} MMR
                  </option>
                ))}
              </select>
            </div>

            {selectedTeam && (
              <div style={field}>
                <div className="lbl">Состав ({activePlayerCount}/5) — выбери игрока или пустой слот</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {teamPlayers.map((player, index) => {
                    if (player) {
                      const isSelected = replacedPlayerId === player.id;
                      return (
                        <button
                          key={player.id}
                          className={`player-row ${isSelected ? "selected" : ""}`}
                          onClick={() => {
                            setReplacedPlayerId(isSelected ? "" : player.id);
                            setSelectedCandidateId(null);
                            setCandidatePage(1);
                          }}
                          style={{ justifyContent: "space-between", textAlign: "left" }}
                        >
                          <span style={{ display: "flex", gap: 7, alignItems: "center", minWidth: 0 }}>
                            <span style={{ color: "var(--text-muted)", fontSize: 10, minWidth: 10 }}>{index + 1}</span>
                            <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{player.nick}</span>
                          </span>
                          <span style={{ color: "var(--text-secondary)", fontSize: 11, fontFamily: "monospace" }}>
                            {player.mmr} · R{player.mainRole}
                          </span>
                        </button>
                      );
                    }

                    const isSelected = replacedPlayerId === EMPTY_SLOT;
                    return (
                      <button
                        key={`empty-${index}`}
                        onClick={() => {
                          setReplacedPlayerId(isSelected ? "" : EMPTY_SLOT);
                          setSelectedCandidateId(null);
                          setCandidatePage(1);
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "8px 10px",
                          borderRadius: 6,
                          cursor: "pointer",
                          background: isSelected ? "rgba(16,185,129,0.12)" : "rgba(0,0,0,0.08)",
                          border: `1px dashed ${isSelected ? "#34d399" : "rgba(255,255,255,0.15)"}`,
                          color: isSelected ? "#34d399" : "var(--text-muted)",
                          fontSize: 12,
                          textAlign: "left",
                        }}
                      >
                        <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <span style={{ fontSize: 10, minWidth: 10 }}>{index + 1}</span>
                          <span>пустой слот</span>
                        </span>
                        <span style={{ fontSize: 10 }}>+ добавить</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {replacedPlayer && (
              <div className="judge-alert judge-alert-danger">
                <div className="judge-alert-title">Заменяемый: {replacedPlayer.nick}</div>
                <div className="judge-alert-copy">MMR: {replacedPlayer.mmr.toLocaleString()} · Роль: R{replacedPlayer.mainRole}</div>
                <div className="judge-alert-copy">Avg MMR команды: {currentTeamAvgMmr.toLocaleString()}</div>
              </div>
            )}

            {isEmptySlot && (
              <div className="judge-alert judge-alert-success">
                <div className="judge-alert-title">Заполнение пустого слота · R{emptySlotRole}</div>
                <div className="judge-alert-copy">Игроков в команде: {activePlayerCount}/5</div>
              </div>
            )}

            <div style={field}>
              <div className="lbl">Судья <span style={{ color: "#f87171" }}>*</span></div>
              <input
                className="form-input"
                value={judgeName}
                onChange={(e) => setJudgeName(e.target.value)}
                placeholder="Обязательно"
                style={!judgeName.trim() ? { borderColor: "rgba(239,68,68,0.5)" } : {}}
              />
              {!judgeName.trim() && <div style={{ fontSize: 10, color: "#f87171", marginTop: 3 }}>Укажите имя судьи для назначения замены</div>}
            </div>

            <div style={field}>
              <div className="lbl">Комментарий</div>
              <textarea className="form-input" value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Опционально" style={{ resize: "none" }} />
            </div>

            <div className="judge-ops-card">
              <div className="judge-mini-label">Discord-поиск замены</div>
              {!activeSearchSession ? (
                <>
                  <div className="judge-mini-copy" style={{ marginBottom: 10 }}>
                    Судья запускает поиск с сайта, игроки отвечают в Discord, а финальное подтверждение замены остается здесь.
                  </div>
                  <button
                    className="btn btn-blue"
                    style={{ width: "100%", justifyContent: "center" }}
                    disabled={!teamId || (!replacedPlayerId && !isEmptySlot) || !judgeName.trim() || searchMutation.isPending}
                    onClick={() => searchMutation.mutate()}
                  >
                    {searchMutation.isPending ? "Запускаю поиск..." : "Запустить поиск в Discord"}
                  </button>
                  {searchMutation.isError && <div style={{ color: "#f87171", fontSize: 12, marginTop: 6 }}>Ошибка: {(searchMutation.error as Error).message}</div>}
                </>
              ) : (
                <>
                  <div className="judge-analysis-row">
                    <span>Статус</span>
                    <strong style={{ color: activeSearchSession.status === "WAITING_CONFIRMATION" ? "#34d399" : "var(--accent)" }}>
                      {searchStatusLabel(activeSearchSession.status)}
                    </strong>
                  </div>
                  <div className="judge-analysis-row" style={{ marginBottom: 10 }}>
                    <span>Текущая волна</span>
                    <strong>#{activeSearchSession.currentWaveNumber}</strong>
                  </div>
                  {waitingForWaveClosure && (
                    <>
                      <div className="judge-analysis-row">
                        <span>Откликов получено</span>
                        <strong>{readyCount}</strong>
                      </div>
                      <div className="judge-focus-tip" style={{ marginBottom: 10 }}>
                        Отклики уже собираются. Рекомендация появится после завершения окна волны
                        {waveEndsAt ? ` в ${waveEndsAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}` : ""}.
                      </div>
                      {readyCount > 0 && (
                        <button
                          className="btn btn-success"
                          style={{ width: "100%", justifyContent: "center", marginBottom: 10 }}
                          disabled={closeWaveNowMutation.isPending}
                          onClick={() => closeWaveNowMutation.mutate(activeSearchSession.id)}
                        >
                          {closeWaveNowMutation.isPending ? "Завершаю волну..." : "Завершить волну сейчас"}
                        </button>
                      )}
                    </>
                  )}

                  {activeSearchSession.status === "WAITING_CONFIRMATION" && activeSearchSession.recommendedPlayer && (
                    <div className="judge-alert judge-alert-success">
                      <div className="judge-alert-title">Рекомендован кандидат: {activeSearchSession.recommendedPlayer.nick}</div>
                      <div className="judge-alert-copy">
                        MMR: {activeSearchSession.recommendedPlayer.mmr.toLocaleString()} · R{activeSearchSession.recommendedPlayer.mainRole}
                        {activeSearchSession.recommendedPlayer.flexRole ? `/R${activeSearchSession.recommendedPlayer.flexRole}` : ""}
                      </div>
                      <div className="judge-alert-copy">
                        Rank: #{activeSearchSession.recommendationRank ?? "—"} · SubScore: {(activeSearchSession.recommendationScore ?? 0).toFixed(4)}
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {activeSearchSession.status === "WAITING_CONFIRMATION" && (
                      <>
                        <button className="btn btn-success" style={{ flex: 1, justifyContent: "center" }} disabled={confirmSearchMutation.isPending} onClick={() => confirmSearchMutation.mutate(activeSearchSession.id)}>
                          {confirmSearchMutation.isPending ? "Подтверждаю..." : "Подтвердить замену"}
                        </button>
                        <button className="btn btn-ghost" style={{ flex: 1, justifyContent: "center" }} disabled={nextCandidateMutation.isPending} onClick={() => nextCandidateMutation.mutate(activeSearchSession.id)}>
                          {nextCandidateMutation.isPending ? "Ищу дальше..." : "Следующий кандидат"}
                        </button>
                      </>
                    )}
                    <button className="btn btn-danger" style={{ width: "100%", justifyContent: "center" }} disabled={cancelSearchMutation.isPending} onClick={() => cancelSearchMutation.mutate(activeSearchSession.id)}>
                      {cancelSearchMutation.isPending ? "Отменяю..." : "Отменить поиск"}
                    </button>
                  </div>

                  {(confirmSearchMutation.isError || nextCandidateMutation.isError || cancelSearchMutation.isError || closeWaveNowMutation.isError) && (
                    <div style={{ color: "#f87171", fontSize: 12, marginTop: 6 }}>
                      Ошибка: {((confirmSearchMutation.error || nextCandidateMutation.error || cancelSearchMutation.error || closeWaveNowMutation.error) as Error)?.message}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div style={col}>
          <div style={{ ...colHeader, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Кандидаты · стр. {candidatePage}/{candidateTotalPages}</span>
            {replacedPlayerId && <span style={{ color: "var(--text-muted)", fontSize: 10, fontWeight: 400, textTransform: "none" }}>Нужная роль: R{neededRole}</span>}
          </div>
          <div style={{ ...colBody, padding: 0 }}>
            <div className="judge-candidates-layout">
              <div className="judge-shortlist">
                <div className="judge-shortlist-header">
                  <div>
                    <div className="judge-mini-label">Шортлист</div>
                    <div className="judge-mini-copy">Короткий список лучших вариантов без лишней прокрутки.</div>
                  </div>
                  {candidateTotalPages > 1 && (
                    <div className="judge-pagination">
                      <button className="btn btn-ghost btn-sm" disabled={candidatePage === 1} onClick={() => setCandidatePage((p) => p - 1)}>←</button>
                      <span>{candidatePage}/{candidateTotalPages}</span>
                      <button className="btn btn-ghost btn-sm" disabled={candidatePage === candidateTotalPages} onClick={() => setCandidatePage((p) => p + 1)}>→</button>
                    </div>
                  )}
                </div>

                {!replacedPlayerId ? (
                  <div className="judge-empty-state">
                    <div className="judge-empty-icon">👈</div>
                    <div className="judge-empty-title">Сначала выбери игрока или пустой слот</div>
                    <div className="judge-empty-copy">После выбора система посчитает SubScore и соберет короткий список кандидатов.</div>
                  </div>
                ) : loadingCandidates ? (
                  <div className="judge-empty-state">
                    <div className="judge-empty-title">Считаю SubScore...</div>
                  </div>
                ) : candidates.length === 0 ? (
                  <div className="judge-empty-state">
                    <div className="judge-empty-title">Нет активных кандидатов</div>
                    <div className="judge-empty-copy">Пул замен пуст или нет подходящих игроков под выбранную роль и MMR.</div>
                  </div>
                ) : (
                  <div className="judge-shortlist-list">
                    {candidates.map((candidate, index) => {
                      const isSelected = selectedCandidateId === candidate.poolEntryId;

                      return (
                        <button
                          key={candidate.poolEntryId}
                          onClick={() => setSelectedCandidateId(isSelected ? null : candidate.poolEntryId)}
                          className={`judge-candidate-tile ${isSelected ? "selected" : ""} ${index === 0 ? "top" : ""}`}
                        >
                          <div className="judge-candidate-topline">
                            <span className="judge-rank-pill">{index + 1}</span>
                            <span className="judge-candidate-name">{candidate.nick}</span>
                            {index === 0 && <span className="judge-best-pill">Лучший</span>}
                            <span className="judge-score">{candidate.subScore.toFixed(4)}</span>
                          </div>
                          <div className="judge-candidate-meta">
                            <span>{candidate.mmr.toLocaleString()} MMR</span>
                            <span>Stake {candidate.stake}</span>
                            <span>R{candidate.mainRole}{candidate.flexRole ? `/R${candidate.flexRole}` : ""}</span>
                          </div>
                          <div className="judge-candidate-meta judge-candidate-meta-secondary">
                            <span style={{ color: rfColor(candidate.roleFit) }}>RF: {candidate.roleFit >= 1 ? "Осн" : candidate.roleFit >= 0.8 ? "Флекс" : "Нет"}</span>
                            <span>BF: {candidate.balanceFactor.toFixed(2)}</span>
                            <span>→ {Math.round(candidate.teamMmrAfter).toLocaleString()}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="judge-decision-pane">
                {!replacedPlayerId ? (
                  <div className="judge-empty-state judge-empty-panel">
                    <div className="judge-mini-label">Decision pane</div>
                    <div className="judge-empty-title">Здесь будет финальное решение</div>
                    <div className="judge-empty-copy">Когда слева появятся кандидаты, эта панель покажет полную карточку игрока и главный CTA на назначение.</div>
                  </div>
                ) : loadingCandidates ? (
                  <div className="judge-empty-state judge-empty-panel">
                    <div className="judge-empty-title">Обновляю рекомендации...</div>
                  </div>
                ) : !focusCandidate ? (
                  <div className="judge-empty-state judge-empty-panel">
                    <div className="judge-empty-title">Подходящая замена не найдена</div>
                    <div className="judge-empty-copy">Запусти Discord-поиск или дождись пополнения активного пула замен.</div>
                  </div>
                ) : (
                  <div className="judge-focus-card">
                    <div className="judge-focus-hero">
                      <div>
                        <div className="judge-mini-label">{selectedCandidate ? "Выбранный кандидат" : "Рекомендация системы"}</div>
                        <div className="judge-focus-name">{focusCandidate.nick}</div>
                        <div className="judge-focus-copy">
                          {isEmptySlot ? "Добавление в пустой слот" : `Замена для ${replacedPlayer?.nick ?? "выбранного игрока"}`}
                        </div>
                      </div>
                      <div className="judge-focus-scorebox">
                        <span>SubScore</span>
                        <strong>{focusCandidate.subScore.toFixed(4)}</strong>
                      </div>
                    </div>

                    <div className="judge-focus-grid">
                      <div className="judge-focus-metric">
                        <span>MMR</span>
                        <strong>{focusCandidate.mmr.toLocaleString()}</strong>
                      </div>
                      <div className="judge-focus-metric">
                        <span>Stake</span>
                        <strong>{focusCandidate.stake}</strong>
                      </div>
                      <div className="judge-focus-metric">
                        <span>Роли</span>
                        <strong>R{focusCandidate.mainRole}{focusCandidate.flexRole ? `/R${focusCandidate.flexRole}` : ""}</strong>
                      </div>
                      <div className="judge-focus-metric">
                        <span>MMR после замены</span>
                        <strong>{Math.round(focusCandidate.teamMmrAfter).toLocaleString()}</strong>
                      </div>
                    </div>

                    <div className="judge-focus-analysis">
                      <div className="judge-analysis-row">
                        <span>Role Fit</span>
                        <strong style={{ color: rfColor(focusCandidate.roleFit) }}>{roleFitLabel(focusCandidate.roleFit)}</strong>
                      </div>
                      <div className="judge-analysis-row">
                        <span>Balance Factor</span>
                        <strong>{focusCandidate.balanceFactor.toFixed(2)}</strong>
                      </div>
                      {focusCandidate.wallet && (
                        <div className="judge-analysis-row">
                          <span>Кошелек</span>
                          <strong className="judge-wallet">{focusCandidate.wallet}</strong>
                        </div>
                      )}
                    </div>

                    {!selectedCandidate && (
                      <div className="judge-focus-tip">
                        Сейчас в фокусе лучший кандидат по SubScore. Подтверди выбор, если хочешь назначить именно его.
                      </div>
                    )}

                    <div className="judge-focus-actions">
                      {!selectedCandidate && (
                        <button className="btn btn-ghost" onClick={() => setSelectedCandidateId(focusCandidate.poolEntryId)}>
                          Выбрать кандидата
                        </button>
                      )}
                      {canEdit && (
                        <button
                          className="btn btn-accent"
                          style={{ justifyContent: "center", padding: "10px 16px", fontSize: 13 }}
                          disabled={!selectedCandidateId || !replacedPlayerId || !judgeName.trim() || assignMutation.isPending}
                          onClick={() => selectedCandidateId && assignMutation.mutate(selectedCandidateId)}
                        >
                          {assignMutation.isPending ? "Назначаю..." : isEmptySlot ? "+ Добавить в команду" : "✓ Назначить замену"}
                        </button>
                      )}
                    </div>

                    {assignMutation.isSuccess && <div style={{ color: "#34d399", fontSize: 12 }}>{isEmptySlot ? "Игрок добавлен!" : "Замена назначена!"}</div>}
                    {assignMutation.isError && <div style={{ color: "#f87171", fontSize: 12 }}>Ошибка: {(assignMutation.error as Error).message}</div>}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={col}>
          <div style={colHeader}>Оперативная сводка · пул {poolEntries.length}</div>
          <div style={colBody}>
            <div className="judge-ops-card" style={{ marginBottom: 10 }}>
              <div className="judge-mini-label">Текущее состояние</div>
              <div className="judge-analysis-row">
                <span>Команда</span>
                <strong>{selectedTeam?.name ?? "Не выбрана"}</strong>
              </div>
              <div className="judge-analysis-row">
                <span>Слот</span>
                <strong>{replacedPlayer?.nick ?? (isEmptySlot ? "Пустой слот" : "Не выбран")}</strong>
              </div>
              <div className="judge-analysis-row">
                <span>Нужная роль</span>
                <strong>R{neededRole}</strong>
              </div>
              <div className="judge-analysis-row">
                <span>Discord</span>
                <strong style={{ color: activeSearchSession ? "var(--accent)" : "var(--text-secondary)" }}>
                  {activeSearchSession ? searchStatusLabel(activeSearchSession.status) : "Не запущен"}
                </strong>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {poolEntries.length === 0 && <div style={{ color: "var(--text-muted)", fontSize: 12, textAlign: "center", padding: 24 }}>Пул пуст</div>}
              {poolEntries.map((entry, index) => (
                <div
                  key={entry.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    padding: "7px 9px",
                    borderRadius: 6,
                    background: index === 0 ? "rgba(16,185,129,0.06)" : "rgba(0,0,0,0.15)",
                    border: `1px solid ${index === 0 ? "rgba(16,185,129,0.2)" : "var(--border)"}`,
                    fontSize: 11,
                  }}
                >
                  <span style={{ fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.player.nick}</span>
                  <span style={{ color: "var(--text-secondary)", fontFamily: "monospace", whiteSpace: "nowrap" }}>
                    {entry.player.mmr.toLocaleString()} · S{entry.player.stake}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
