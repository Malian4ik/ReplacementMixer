"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Team, SubstitutionPoolEntry } from "@/types";
import { useUser } from "@/components/UserContext";
import { MatchBadge } from "@/components/MatchBadge";

// Inline types to avoid server module import in client component
interface ActiveGamePlayer {
  id: string;
  nick: string;
  role: number;
  mmr: number;
  discordId: string | null;
}

interface ActiveGameTeam {
  id: string;
  name: string;
  avgMmr: number;
  players: (ActiveGamePlayer | null)[];
}

interface ActiveGame {
  id: string;
  round: number;
  slot: number;
  homeTeam: ActiveGameTeam;
  awayTeam: ActiveGameTeam;
  substituteQueue: Array<{ playerId: string; nick: string; position: number }>;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ActiveSessionSlot {
  id: string;
  slotIndex: number;
  neededRole: number;
  replacedPlayerNick: string | null;
  slotTeamId: string | null;
  slotTeamName: string | null;
  assignedPlayerId: string | null;
}

interface ActiveSession {
  id: string;
  teamName: string;
  awayTeamName: string | null;
  neededRole: number;
  replacedPlayerNick: string | null;
  slotsNeeded: number;
  currentWave: number;
  status: string;
  slots: ActiveSessionSlot[];
  waves: Array<{
    id: string;
    waveNumber: number;
    status: string;
    endsAt: string;
    responses: Array<{
      id: string;
      clickedAt: string;
      subScore: number | null;
      player: { id: string; nick: string; mmr: number; mainRole: number; flexRole: number | null };
    }>;
    candidates: Array<{ player: { nick: string } }>;
  }>;
}

interface SearchState {
  pending: boolean;
  result: { sessionId: string; teamName: string } | null;
  error: string | null;
}

const EMPTY_SLOT = "__empty__";
const MAX_DEVIATION = 1000;

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<number, string> = {
  1: "Carry",
  2: "Mid",
  3: "Off",
  4: "SS",
  5: "HS",
};

function roleLabel(r: number) {
  return ROLE_LABELS[r] ?? `R${r}`;
}

function roleFitScore(mainRole: number, flexRole: number | null, needed: number): number {
  if (mainRole === needed) return 1.0;
  if (flexRole === needed) return 0.8;
  return 0.5;
}

function slotFitLabel(fit: number): string {
  if (fit >= 1.0) return "★";
  if (fit >= 0.8) return "~";
  return "·";
}

// ── Main component ────────────────────────────────────────────────────────────

export default function JudgePage() {
  const qc = useQueryClient();
  const { user } = useUser();
  const canEdit = user?.role === "OWNER" || user?.role === "JUDGE";

  const [judgeName, setJudgeName] = useState("");

  // ── Active match mode state ───────────────────────────────────────────────
  const [selectedHome, setSelectedHome] = useState<Set<string>>(new Set());
  const [selectedAway, setSelectedAway] = useState<Set<string>>(new Set());
  const [matchSearch, setMatchSearch] = useState<SearchState>({ pending: false, result: null, error: null });
  // slotId selected per respondent player: playerId → slotId
  const [slotPickMap, setSlotPickMap] = useState<Record<string, string>>({});

  // ── Manual mode state (fallback) ──────────────────────────────────────────
  const [teamId, setTeamId] = useState("");
  const [replacedPlayerId, setReplacedPlayerId] = useState("");
  const [emptySlotRole, setEmptySlotRole] = useState<number>(1);
  const [manualSearch, setManualSearch] = useState<SearchState>({ pending: false, result: null, error: null });
  const [cancelPending, setCancelPending] = useState(false);
  const [testMatchPending, setTestMatchPending] = useState(false);
  const [testMatchMsg, setTestMatchMsg] = useState<string | null>(null);

  // ── Queries ───────────────────────────────────────────────────────────────

  const { data: stats } = useQuery<{ targetAvgMmr: number }>({
    queryKey: ["stats"],
    queryFn: () => fetch("/api/stats").then((r) => r.json()),
  });
  const targetAvgMmr = stats?.targetAvgMmr ?? 9000;

  const { data: poolEntries = [] } = useQuery<SubstitutionPoolEntry[]>({
    queryKey: ["pool", "Active"],
    queryFn: () => fetch("/api/substitution-pool?status=Active").then((r) => r.json()),
  });

  // Active match — poll every 2 minutes
  const { data: activeMatch, isLoading: loadingMatch, refetch: refetchMatch } = useQuery<ActiveGame | null>({
    queryKey: ["active-match"],
    queryFn: () => fetch("/api/schedule/matches/active").then((r) => r.json()),
    refetchInterval: 2 * 60 * 1000,
    staleTime: 90 * 1000,
  });

  // Manual mode: team list + active session
  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ["teams"],
    queryFn: () => fetch("/api/teams").then((r) => r.json()),
  });

  const { data: activeSessionData, refetch: refetchActiveSession } = useQuery<{ session: ActiveSession | null }>({
    queryKey: ["active-session", teamId],
    queryFn: () => teamId
      ? fetch(`/api/judge/active-session?teamId=${teamId}`).then((r) => r.json())
      : Promise.resolve({ session: null }),
    enabled: !!teamId,
    refetchInterval: 4000,
  });

  // Active session for the current match (polls by homeTeam.id — backend also checks awayTeamId)
  const { data: matchSessionData, refetch: refetchMatchSession } = useQuery<{ session: ActiveSession | null }>({
    queryKey: ["active-session", activeMatch?.homeTeam?.id],
    queryFn: () => activeMatch?.homeTeam?.id
      ? fetch(`/api/judge/active-session?teamId=${activeMatch.homeTeam.id}`).then((r) => r.json())
      : Promise.resolve({ session: null }),
    enabled: !!activeMatch?.homeTeam?.id,
    refetchInterval: 4000,
  });

  // Auto-fill slotPickMap: for each new respondent pick the slot with the best roleFit
  const _matchSession = matchSessionData?.session ?? null;
  const _activeMatchWave = _matchSession?.waves?.[0] ?? null;
  useEffect(() => {
    if (!_matchSession) return;
    const openSlots = _matchSession.slots.filter((s) => !s.assignedPlayerId);
    if (openSlots.length === 0) return;
    const responses = _activeMatchWave?.responses ?? [];
    setSlotPickMap((prev) => {
      const next = { ...prev };
      responses.forEach((r) => {
        if (next[r.player.id]) return;
        const best = openSlots
          .map((slot) => ({ slot, fit: roleFitScore(r.player.mainRole, r.player.flexRole, slot.neededRole) }))
          .sort((a, b) => b.fit - a.fit)[0];
        if (best) next[r.player.id] = best.slot.id;
      });
      return next;
    });
  }, [_activeMatchWave?.responses?.length, _matchSession?.slots?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ───────────────────────────────────────────────────────────────

  async function startMatchSearch() {
    if (!activeMatch || !judgeName.trim()) return;
    if (selectedHome.size === 0 && selectedAway.size === 0) return;
    setMatchSearch({ pending: true, result: null, error: null });

    const homeSlots = Array.from(selectedHome).map((pid, i) => {
      const player = activeMatch.homeTeam.players.find((p) => p?.id === pid);
      return {
        teamId: activeMatch.homeTeam.id,
        teamName: activeMatch.homeTeam.name,
        replacedPlayerId: pid,
        replacedPlayerNick: player?.nick,
        neededRole: player?.role ?? 1,
        teamSlot: i + 1,
      };
    });
    const awaySlots = Array.from(selectedAway).map((pid, i) => {
      const player = activeMatch.awayTeam.players.find((p) => p?.id === pid);
      return {
        teamId: activeMatch.awayTeam.id,
        teamName: activeMatch.awayTeam.name,
        replacedPlayerId: pid,
        replacedPlayerNick: player?.nick,
        neededRole: player?.role ?? 1,
        teamSlot: i + 1,
      };
    });

    try {
      const res = await fetch("/api/judge/start-discord-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homeTeamId: activeMatch.homeTeam.id,
          homeTeamName: activeMatch.homeTeam.name,
          awayTeamId: activeMatch.awayTeam.id,
          awayTeamName: activeMatch.awayTeam.name,
          activeMatchId: activeMatch.id,
          judgeName: judgeName.trim(),
          targetAvgMmr,
          maxDeviation: MAX_DEVIATION,
          slots: [...homeSlots, ...awaySlots],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка сервера");
      setMatchSearch({ pending: false, result: { sessionId: data.sessionId, teamName: data.teamName }, error: null });
      refetchMatchSession();
    } catch (err: unknown) {
      setMatchSearch({ pending: false, result: null, error: err instanceof Error ? err.message : "Ошибка" });
    }
  }

  async function cancelMatchSession() {
    if (!activeMatch) return;
    await fetch(`/api/judge/active-session?teamId=${activeMatch.homeTeam.id}`, { method: "DELETE" });
    refetchMatchSession();
    qc.invalidateQueries({ queryKey: ["active-session"] });
  }

  // Manual mode discord search
  async function handleManualDiscordSearch() {
    if (!teamId || !replacedPlayerId || !judgeName.trim()) return;
    setManualSearch({ pending: true, result: null, error: null });
    const selectedTeam = teams.find((t) => t.id === teamId);
    const isEmptySlot = replacedPlayerId === EMPTY_SLOT;
    const neededRole = isEmptySlot ? emptySlotRole : (selectedTeam?.players?.find((p) => p?.id === replacedPlayerId)?.mainRole ?? 1);

    try {
      const res = await fetch("/api/judge/start-discord-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          replacedPlayerId: isEmptySlot ? undefined : replacedPlayerId,
          neededRole,
          judgeName: judgeName.trim(),
          targetAvgMmr,
          maxDeviation: MAX_DEVIATION,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка");
      setManualSearch({ pending: false, result: { sessionId: data.sessionId, teamName: data.teamName }, error: null });
      refetchActiveSession();
    } catch (err: unknown) {
      setManualSearch({ pending: false, result: null, error: err instanceof Error ? err.message : "Ошибка" });
    }
  }

  const pickResponderMutation = useMutation({
    mutationFn: ({ sessionId, playerId, slotId }: { sessionId: string; playerId: string; slotId?: string }) =>
      fetch("/api/judge/pick-responder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, playerId, slotId, judgeName: judgeName.trim() }),
      }).then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Ошибка");
        return d;
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pool"] });
      qc.invalidateQueries({ queryKey: ["active-session"] });
      refetchMatchSession();
      refetchActiveSession();
    },
  });

  const directAssignMutation = useMutation({
    mutationFn: ({ poolEntryId, teamId, teamName, replacedPlayerId, neededRole }: {
      poolEntryId: string; teamId: string; teamName: string;
      replacedPlayerId?: string; neededRole: number;
    }) =>
      fetch("/api/judge/direct-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poolEntryId, teamId, teamName, replacedPlayerId, neededRole, judgeName: judgeName.trim(), targetAvgMmr, maxDeviation: MAX_DEVIATION }),
      }).then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Ошибка");
        return d;
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pool"] });
      qc.invalidateQueries({ queryKey: ["teams"] });
      refetchActiveSession();
    },
  });

  // ── Guards ────────────────────────────────────────────────────────────────

  if (!canEdit) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 40 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Нет доступа</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Только для JUDGE и OWNER</div>
      </div>
    );
  }

  // ── Styles helpers ────────────────────────────────────────────────────────

  const col: React.CSSProperties = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  };

  const colHeader: React.CSSProperties = {
    padding: "8px 14px",
    borderBottom: "1px solid var(--border)",
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    color: "var(--text-secondary)",
    flexShrink: 0,
  };

  // ── Render: Active match mode ─────────────────────────────────────────────

  function renderTeamColumn(
    team: ActiveGameTeam,
    selected: Set<string>,
    setSelected: (s: Set<string>) => void
  ) {
    function toggle(playerId: string) {
      const next = new Set(selected);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      setSelected(next);
    }

    return (
      <div style={{ ...col, flex: 1 }}>
        <div style={{ ...colHeader, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span>{team.name}</span>
            {team.avgMmr > 0 && (
              <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace", fontWeight: 400, textTransform: "none" }}>
                {team.avgMmr.toLocaleString()} avg
              </span>
            )}
          </span>
          {selected.size > 0 && (
            <span style={{ color: "#f87171", fontWeight: 800, textTransform: "none", fontSize: 12 }}>
              {selected.size} выбран{selected.size > 1 ? "о" : ""}
            </span>
          )}
        </div>

        <div style={{ padding: "10px 12px", flex: 1 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {team.players.map((player, i) => {
              if (!player) {
                return (
                  <div key={`empty-${i}`} style={{ padding: "6px 10px", borderRadius: 5, border: "1px dashed rgba(255,255,255,0.1)", color: "var(--text-muted)", fontSize: 11, display: "flex", justifyContent: "space-between" }}>
                    <span>Слот {i + 1}</span>
                    <span style={{ fontSize: 10 }}>пусто</span>
                  </div>
                );
              }
              const isSel = selected.has(player.id);
              return (
                <button
                  key={player.id}
                  onClick={() => toggle(player.id)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 10px", borderRadius: 5, cursor: "pointer", textAlign: "left",
                    background: isSel ? "rgba(239,68,68,0.1)" : "rgba(0,0,0,0.2)",
                    border: `1px solid ${isSel ? "#ef4444" : "var(--border)"}`,
                    color: "var(--text-primary)", fontSize: 12, transition: "all 0.1s",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      width: 18, height: 18, borderRadius: 3, border: `1.5px solid ${isSel ? "#ef4444" : "var(--border)"}`,
                      background: isSel ? "#ef4444" : "transparent", flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, color: "#fff",
                    }}>
                      {isSel ? "✓" : ""}
                    </span>
                    <span style={{ fontWeight: 600 }}>{player.nick}</span>
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-secondary)", fontFamily: "monospace" }}>
                    {roleLabel(player.role)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* Header */}
      <div className="page-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <div className="page-title">Панель судьи</div>
          <div className="page-subtitle">Назначение замен для команд</div>
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center", padding: "6px 14px", background: "rgba(240,165,0,0.08)", border: "1px solid rgba(240,165,0,0.2)", borderRadius: 6 }}>
          <div>
            <div style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Target MMR</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "var(--accent)" }}>{targetAvgMmr.toLocaleString()}</div>
          </div>
          <div style={{ width: 1, height: 30, background: "var(--border)" }} />
          <div>
            <div style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>В пуле</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: poolEntries.length > 0 ? "#34d399" : "#f87171" }}>{poolEntries.length}</div>
          </div>
          <div style={{ width: 1, height: 30, background: "var(--border)" }} />
          <div>
            <div style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Судья</div>
            <input
              value={judgeName}
              onChange={(e) => setJudgeName(e.target.value)}
              placeholder="Имя судьи *"
              className="form-input"
              style={{ width: 130, fontSize: 13, padding: "2px 8px", height: 28, borderColor: judgeName.trim() ? undefined : "rgba(239,68,68,0.5)" }}
            />
          </div>
        </div>
      </div>

      {/* ── Active match mode ─────────────────────────────────────────────── */}
      {loadingMatch ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
          Загрузка матча...
        </div>
      ) : (
        <>
        {activeMatch && (
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", overflow: "auto", padding: "12px 16px", gap: 10, borderBottom: "1px solid var(--border)" }}>

          {/* Match banner */}
          <div style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 8, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 18 }}>🟢</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#34d399" }}>
                  АКТИВНЫЙ МАТЧ
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                  Round {activeMatch.round} · Слот {activeMatch.slot} ·{" "}
                  <b style={{ color: "var(--text-primary)" }}>{activeMatch.homeTeam.name}</b>
                  {" vs "}
                  <b style={{ color: "var(--text-primary)" }}>{activeMatch.awayTeam.name}</b>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {activeMatch.substituteQueue.length} в очереди
              </span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => refetchMatch()}
                style={{ fontSize: 11 }}
              >
                ↻ Обновить
              </button>
              {user?.role === "OWNER" && (
                <button
                  className="btn btn-sm"
                  style={{ fontSize: 11, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" }}
                  disabled={testMatchPending}
                  onClick={async () => {
                    setTestMatchPending(true);
                    setTestMatchMsg(null);
                    try {
                      await fetch("/api/admin/test-match", { method: "DELETE" });
                      qc.invalidateQueries({ queryKey: ["active-match"] });
                      refetchMatch();
                    } catch { /* ignore */ }
                    finally { setTestMatchPending(false); }
                  }}
                >
                  {testMatchPending ? "..." : "🗑 Удалить тест"}
                </button>
              )}
            </div>
          </div>

          {/* Instructions */}
          {!judgeName.trim() && (
            <div style={{ padding: "7px 14px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, fontSize: 12, color: "#f87171", flexShrink: 0 }}>
              ✏️ Введите имя судьи в правом верхнем углу, затем выберите игроков для замены
            </div>
          )}

          {/* Two-column team UI */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {renderTeamColumn(activeMatch.homeTeam, selectedHome, setSelectedHome)}
            {renderTeamColumn(activeMatch.awayTeam, selectedAway, setSelectedAway)}
          </div>

          {/* Unified Discord search panel */}
          <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Active session panel */}
            {matchSessionData?.session && (() => {
              const session = matchSessionData.session;
              const activeWave = session.waves?.[0] ?? null;
              const openSlots = session.slots.filter((s) => !s.assignedPlayerId);
              const isMatchSession = !!session.awayTeamName;

              return (
                <div style={{ padding: "10px 14px", background: "rgba(88,101,242,0.08)", border: "1px solid rgba(88,101,242,0.25)", borderRadius: 7 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#7289da" }}>
                      ⚡ Поиск активен · {openSlots.length} незаполнен{openSlots.length === 1 ? "" : "о"} из {session.slotsNeeded} · волна {session.currentWave}
                    </div>
                    <button
                      onClick={cancelMatchSession}
                      style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.08)", color: "#f87171", cursor: "pointer" }}
                    >
                      Отменить
                    </button>
                  </div>

                  {/* Slots overview */}
                  {session.slots.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                      {session.slots.map((slot) => {
                        const teamLabel = isMatchSession ? (slot.slotTeamName ?? session.teamName) : null;
                        const filled = !!slot.assignedPlayerId;
                        return (
                          <div key={slot.id} style={{
                            padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                            background: filled ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.08)",
                            border: `1px solid ${filled ? "rgba(16,185,129,0.35)" : "rgba(239,68,68,0.3)"}`,
                            color: filled ? "#34d399" : "#f87171",
                          }}>
                            {filled ? "✓" : "○"}{" "}
                            {teamLabel && <span style={{ color: "var(--text-muted)", marginRight: 3 }}>{teamLabel} ·</span>}
                            {roleLabel(slot.neededRole)}
                            {slot.replacedPlayerNick && <span style={{ color: "var(--text-muted)", marginLeft: 3 }}>({slot.replacedPlayerNick})</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {activeWave && (
                    <>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 6 }}>
                        Откликнулись: {activeWave.responses.length}/{activeWave.candidates.length}
                        {" · до "}
                        {new Date(activeWave.endsAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {activeWave.responses.map((r) => {
                          const currentSlotId = slotPickMap[r.player.id] ?? (openSlots[0]?.id ?? "");
                          return (
                            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 4, background: "rgba(0,0,0,0.25)", border: "1px solid rgba(88,101,242,0.15)" }}>
                              {/* Player info */}
                              <span style={{ fontSize: 12, flex: 1, minWidth: 0 }}>
                                <b>{r.player.nick}</b>
                                <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 6 }}>
                                  {r.player.mmr.toLocaleString()} · {roleLabel(r.player.mainRole)}
                                  {r.player.flexRole != null ? `/${roleLabel(r.player.flexRole)}` : ""}
                                  {r.subScore != null ? ` · ${r.subScore.toFixed(3)}` : ""}
                                </span>
                              </span>
                              {/* Slot selector (only for multi-slot sessions) */}
                              {isMatchSession && openSlots.length > 0 && (
                                <select
                                  value={currentSlotId}
                                  onChange={(e) => setSlotPickMap((m) => ({ ...m, [r.player.id]: e.target.value }))}
                                  style={{
                                    fontSize: 10, padding: "2px 4px", borderRadius: 4,
                                    background: "rgba(0,0,0,0.4)", border: "1px solid var(--border)",
                                    color: "var(--text-primary)", maxWidth: 160,
                                  }}
                                >
                                  {openSlots.map((slot) => {
                                    const fit = roleFitScore(r.player.mainRole, r.player.flexRole, slot.neededRole);
                                    return (
                                      <option key={slot.id} value={slot.id}>
                                        {slotFitLabel(fit)} {slot.slotTeamName ?? session.teamName} · {roleLabel(slot.neededRole)}
                                        {slot.replacedPlayerNick ? ` (${slot.replacedPlayerNick})` : ""}
                                      </option>
                                    );
                                  })}
                                </select>
                              )}
                              {/* Assign button */}
                              <button
                                style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, border: "1px solid rgba(16,185,129,0.4)", background: "rgba(16,185,129,0.1)", color: "#34d399", cursor: judgeName.trim() && openSlots.length > 0 ? "pointer" : "not-allowed", opacity: judgeName.trim() && openSlots.length > 0 ? 1 : 0.4, flexShrink: 0 }}
                                disabled={!judgeName.trim() || pickResponderMutation.isPending || openSlots.length === 0}
                                onClick={() => pickResponderMutation.mutate({
                                  sessionId: session.id,
                                  playerId: r.player.id,
                                  slotId: isMatchSession ? (currentSlotId || undefined) : undefined,
                                })}
                              >
                                Выбрать
                              </button>
                            </div>
                          );
                        })}
                        {activeWave.responses.length === 0 && (
                          <div style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>Ждём откликов...</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })()}

            {/* Result / error */}
            {!matchSessionData?.session && matchSearch.result && (
              <div style={{ padding: "6px 12px", background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 5, fontSize: 11, color: "#34d399" }}>
                ✅ Сессия запущена · {matchSearch.result.teamName}
              </div>
            )}
            {matchSearch.error && (
              <div style={{ padding: "6px 12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 5, fontSize: 11, color: "#f87171" }}>
                ❌ {matchSearch.error}
              </div>
            )}

            {/* Single unified search button */}
            {(() => {
              const hasSession = !!matchSessionData?.session;
              const hasSelected = selectedHome.size > 0 || selectedAway.size > 0;
              const disabled = !hasSelected || !judgeName.trim() || matchSearch.pending || hasSession;
              const totalSelected = selectedHome.size + selectedAway.size;
              return (
                <button
                  style={{
                    width: "100%", padding: "10px 0", borderRadius: 6,
                    border: "1px solid rgba(88,101,242,0.4)",
                    background: matchSearch.pending ? "rgba(88,101,242,0.15)" : "rgba(88,101,242,0.08)",
                    color: "rgba(88,101,242,0.9)",
                    fontSize: 13, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
                    opacity: disabled ? 0.4 : 1,
                    transition: "all 0.15s",
                  }}
                  disabled={disabled}
                  onClick={startMatchSearch}
                >
                  {matchSearch.pending
                    ? "Запускаю..."
                    : hasSession
                    ? "Поиск идёт..."
                    : totalSelected > 0
                    ? `🔍 Поиск в Discord (${totalSelected} замен${totalSelected > 1 ? "ы" : "а"})`
                    : "🔍 Поиск в Discord"}
                </button>
              );
            })()}
          </div>
        </div>
        )}

        {/* ── Manual fallback — always visible ───────────────────────── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Test match toolbar (OWNER only) */}
          {user?.role === "OWNER" && (
            <div style={{ padding: "8px 16px", borderBottom: "1px solid var(--border)", background: "rgba(251,191,36,0.04)", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: "#fbbf24", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>⚙ Тест</span>
              <button
                className="btn btn-sm"
                style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", color: "#fbbf24", fontSize: 11 }}
                disabled={testMatchPending || !!activeMatch}
                onClick={async () => {
                  setTestMatchPending(true);
                  setTestMatchMsg(null);
                  try {
                    const r = await fetch("/api/admin/test-match", { method: "POST" });
                    const d = await r.json();
                    if (!r.ok) { setTestMatchMsg("Ошибка: " + d.error); return; }
                    setTestMatchMsg(`Матч создан: ${d.homeTeam} vs ${d.awayTeam}`);
                    qc.invalidateQueries({ queryKey: ["active-match"] });
                    refetchMatch();
                  } catch { setTestMatchMsg("Сетевая ошибка"); }
                  finally { setTestMatchPending(false); }
                }}
              >
                {testMatchPending ? "..." : "Создать тест-матч"}
              </button>
              <button
                className="btn btn-sm btn-ghost"
                style={{ fontSize: 11 }}
                disabled={testMatchPending}
                onClick={async () => {
                  setTestMatchPending(true);
                  setTestMatchMsg(null);
                  try {
                    await fetch("/api/admin/test-match", { method: "DELETE" });
                    setTestMatchMsg("Тест-матч удалён");
                    qc.invalidateQueries({ queryKey: ["active-match"] });
                    refetchMatch();
                  } catch { setTestMatchMsg("Сетевая ошибка"); }
                  finally { setTestMatchPending(false); }
                }}
              >
                Удалить тест-матч
              </button>
              {testMatchMsg && (
                <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{testMatchMsg}</span>
              )}
            </div>
          )}
          <ManualFallback
          teams={teams}
          poolEntries={poolEntries}
          targetAvgMmr={targetAvgMmr}
          judgeName={judgeName}
          teamId={teamId}
          setTeamId={setTeamId}
          replacedPlayerId={replacedPlayerId}
          setReplacedPlayerId={setReplacedPlayerId}
          emptySlotRole={emptySlotRole}
          setEmptySlotRole={setEmptySlotRole}
          manualSearch={manualSearch}
          handleDiscordSearch={handleManualDiscordSearch}
          activeSession={activeSessionData?.session ?? null}
          cancelPending={cancelPending}
          setCancelPending={setCancelPending}
          refetchActiveSession={refetchActiveSession}
          onPickResponder={(sessionId, playerId) => pickResponderMutation.mutate({ sessionId, playerId })}
          pickPending={pickResponderMutation.isPending}
          onDirectAssign={(poolEntryId, teamId, teamName, replacedPlayerId, neededRole) =>
            directAssignMutation.mutate({ poolEntryId, teamId, teamName, replacedPlayerId, neededRole })
          }
          directAssignPending={directAssignMutation.isPending}
          directAssignError={directAssignMutation.error instanceof Error ? directAssignMutation.error.message : null}
        />
        </div>
        </>
      )}
    </div>
  );
}


// ── Manual Fallback Panel ─────────────────────────────────────────────────────

function ManualFallback({
  teams, poolEntries, targetAvgMmr, judgeName,
  teamId, setTeamId, replacedPlayerId, setReplacedPlayerId,
  emptySlotRole, setEmptySlotRole,
  manualSearch, handleDiscordSearch,
  activeSession, cancelPending, setCancelPending,
  refetchActiveSession, onPickResponder, pickPending,
  onDirectAssign, directAssignPending, directAssignError,
}: {
  teams: Team[];
  poolEntries: SubstitutionPoolEntry[];
  targetAvgMmr: number;
  judgeName: string;
  teamId: string;
  setTeamId: (v: string) => void;
  replacedPlayerId: string;
  setReplacedPlayerId: (v: string) => void;
  emptySlotRole: number;
  setEmptySlotRole: (v: number) => void;
  manualSearch: SearchState;
  handleDiscordSearch: () => void;
  activeSession: ActiveSession | null;
  cancelPending: boolean;
  setCancelPending: (v: boolean) => void;
  refetchActiveSession: () => void;
  onPickResponder: (sessionId: string, playerId: string) => void;
  pickPending: boolean;
  onDirectAssign: (poolEntryId: string, teamId: string, teamName: string, replacedPlayerId: string | undefined, neededRole: number) => void;
  directAssignPending: boolean;
  directAssignError: string | null;
}) {
  const selectedTeam = teams.find((t) => t.id === teamId);
  const teamPlayers = selectedTeam?.players ?? [];
  const isEmptySlot = replacedPlayerId === EMPTY_SLOT;
  const replacedPlayer = teamPlayers.find((p) => p?.id === replacedPlayerId) ?? null;
  const neededRole = isEmptySlot ? emptySlotRole : (replacedPlayer?.mainRole ?? 1);
  const activeWave = activeSession?.waves?.[0] ?? null;

  // Calculate subScore for each pool entry given the current context
  const poolSubScores = useMemo(() => {
    if (!selectedTeam || !replacedPlayerId) return null;
    const total = poolEntries.length;
    if (total === 0) return null;
    const maxMmr = Math.max(...poolEntries.map((e) => e.player.mmr), 1);
    const replacedMmr = isEmptySlot ? 0 : (replacedPlayer?.mmr ?? 0);
    const currentCount = isEmptySlot
      ? (selectedTeam.players?.filter(Boolean).length ?? 4)
      : 5;
    const result = new Map<string, number>();
    poolEntries.forEach((e, i) => {
      const pos = i + 1;
      const queueNorm = (total - pos + 1) / total;
      const mmrNorm = e.player.mmr / maxMmr;
      const roleFit = e.player.mainRole === neededRole ? 1.0 : (e.player.flexRole === neededRole ? 0.8 : 0.5);
      const teamMmrAfter = isEmptySlot
        ? (selectedTeam.avgMmr * currentCount + e.player.mmr) / (currentCount + 1)
        : (selectedTeam.avgMmr * currentCount - replacedMmr + e.player.mmr) / currentCount;
      const balance = Math.max(0, 1 - Math.abs(teamMmrAfter - targetAvgMmr) / MAX_DEVIATION);
      result.set(e.id, (0.6 * queueNorm + 0.3 * mmrNorm + 0.1 * roleFit) * balance);
    });
    return result;
  }, [poolEntries, selectedTeam, replacedPlayerId, neededRole, targetAvgMmr, isEmptySlot, replacedPlayer]);

  async function handleCancel() {
    if (!teamId) return;
    setCancelPending(true);
    await fetch(`/api/judge/active-session?teamId=${teamId}`, { method: "DELETE" });
    setCancelPending(false);
    refetchActiveSession();
  }

  const col: React.CSSProperties = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  };

  return (
    <div style={{ flex: 1, overflow: "hidden", display: "grid", gridTemplateColumns: "280px 1fr", gap: 12, padding: "12px 16px" }}>

      {/* Left: Context */}
      <div style={col}>
        <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)", fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "var(--text-secondary)" }}>
          Контекст
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "10px 14px" }}>

          <div style={{ marginBottom: 10 }}>
            <div className="lbl">Команда</div>
            <select
              className="form-select"
              value={teamId}
              onChange={(e) => { setTeamId(e.target.value); setReplacedPlayerId(""); }}
            >
              <option value="">— выбрать —</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.avgMmr} MMR</option>)}
            </select>
          </div>

          {selectedTeam && (
            <div style={{ marginBottom: 10 }}>
              <div className="lbl">Состав</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {teamPlayers.map((p, i) => {
                  if (p) {
                    const isSel = replacedPlayerId === p.id;
                    return (
                      <button key={p.id}
                        onClick={() => setReplacedPlayerId(isSel ? "" : p.id)}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", borderRadius: 5, cursor: "pointer", background: isSel ? "rgba(239,68,68,0.12)" : "rgba(0,0,0,0.2)", border: `1px solid ${isSel ? "#ef4444" : "var(--border)"}`, color: "var(--text-primary)", fontSize: 12, textAlign: "left" }}>
                        <span>{p.nick}</span>
                        <span style={{ color: "var(--text-secondary)", fontSize: 11 }}>{p.mmr} · R{p.mainRole}</span>
                      </button>
                    );
                  } else {
                    const isSel = replacedPlayerId === EMPTY_SLOT;
                    return (
                      <button key={`empty-${i}`}
                        onClick={() => setReplacedPlayerId(isSel ? "" : EMPTY_SLOT)}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", borderRadius: 5, cursor: "pointer", background: isSel ? "rgba(16,185,129,0.12)" : "rgba(0,0,0,0.1)", border: `1px dashed ${isSel ? "#34d399" : "rgba(255,255,255,0.1)"}`, color: isSel ? "#34d399" : "var(--text-muted)", fontSize: 12, textAlign: "left" }}>
                        <span>Слот {i + 1} · пусто</span>
                        <span style={{ fontSize: 10 }}>+ добавить</span>
                      </button>
                    );
                  }
                })}
              </div>
            </div>
          )}

          {isEmptySlot && (
            <div style={{ marginBottom: 10 }}>
              <div className="lbl">Нужная роль</div>
              <div style={{ display: "flex", gap: 4 }}>
                {[1, 2, 3, 4, 5].map((r) => (
                  <button key={r}
                    onClick={() => setEmptySlotRole(r)}
                    style={{ flex: 1, padding: "4px 0", borderRadius: 4, fontSize: 11, cursor: "pointer", background: emptySlotRole === r ? "var(--accent)" : "rgba(255,255,255,0.06)", border: `1px solid ${emptySlotRole === r ? "var(--accent)" : "var(--border)"}`, color: emptySlotRole === r ? "#000" : "var(--text-secondary)", fontWeight: emptySlotRole === r ? 700 : 400 }}>
                    R{r}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Discord search */}
          <div style={{ marginTop: "auto", paddingTop: 12, borderTop: "1px solid var(--border)" }}>
            <button
              style={{ width: "100%", padding: "9px 0", borderRadius: 6, border: "1px solid rgba(88,101,242,0.4)", background: "rgba(88,101,242,0.08)", color: "rgba(88,101,242,0.9)", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: (!teamId || !replacedPlayerId || !judgeName.trim() || manualSearch.pending) ? 0.4 : 1 }}
              disabled={!teamId || !replacedPlayerId || !judgeName.trim() || manualSearch.pending}
              onClick={handleDiscordSearch}
            >
              {manualSearch.pending ? "Запускаю..." : "🔍 Поиск в Discord"}
            </button>
            {manualSearch.result && (
              <div style={{ marginTop: 6, fontSize: 11, color: "#34d399" }}>✅ Сессия создана · {manualSearch.result.teamName}</div>
            )}
            {manualSearch.error && (
              <div style={{ marginTop: 6, fontSize: 11, color: "#f87171" }}>❌ {manualSearch.error}</div>
            )}
          </div>

          {/* Active session */}
          {activeSession && (
            <div style={{ marginTop: 10, padding: "10px 12px", background: "rgba(88,101,242,0.08)", border: "1px solid rgba(88,101,242,0.25)", borderRadius: 7 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#7289da" }}>⚡ Discord · волна {activeSession.currentWave}</div>
                <button onClick={handleCancel} disabled={cancelPending} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.08)", color: "#f87171", cursor: "pointer" }}>
                  {cancelPending ? "..." : "Отменить"}
                </button>
              </div>
              {activeWave && (
                <>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 6 }}>
                    Откликнулись: {activeWave.responses.length}/{activeWave.candidates.length}
                  </div>
                  {activeWave.responses.map((r) => (
                    <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px", borderRadius: 4, background: "rgba(0,0,0,0.25)", marginBottom: 3 }}>
                      <span style={{ fontSize: 12 }}>{r.player.nick} <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{r.player.mmr.toLocaleString()}</span></span>
                      <button
                        style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, border: "1px solid rgba(16,185,129,0.4)", background: "rgba(16,185,129,0.1)", color: "#34d399", cursor: judgeName.trim() ? "pointer" : "not-allowed", opacity: judgeName.trim() ? 1 : 0.5 }}
                        disabled={!judgeName.trim() || pickPending}
                        onClick={() => onPickResponder(activeSession.id, r.player.id)}
                      >
                        Выбрать
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right: Pool list */}
      <div style={col}>
        <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)", fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "var(--text-secondary)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Пул замен · {poolEntries.length}</span>
          {teamId && replacedPlayerId && (
            <span style={{ fontSize: 10, fontWeight: 400, color: "var(--accent)", textTransform: "none" }}>
              ← нажмите «Назначить» рядом с игроком
            </span>
          )}
        </div>
        {directAssignError && (
          <div style={{ padding: "5px 14px", background: "rgba(239,68,68,0.08)", borderBottom: "1px solid rgba(239,68,68,0.2)", fontSize: 11, color: "#f87171" }}>
            ❌ {directAssignError}
          </div>
        )}
        <div style={{ flex: 1, overflow: "auto", padding: "10px 14px" }}>
          {poolEntries.length === 0 ? (
            <div style={{ color: "var(--text-muted)", textAlign: "center", paddingTop: 40, fontSize: 13 }}>Пул пуст</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {poolEntries.map((e, i) => {
                const canAssign = !!(teamId && replacedPlayerId && judgeName.trim());
                const selectedTeamObj = teams.find((t) => t.id === teamId);
                const isEmptySlotLocal = replacedPlayerId === EMPTY_SLOT;
                const replacedPlayerObj = selectedTeamObj?.players?.find((p) => p?.id === replacedPlayerId) ?? null;
                const neededRoleForAssign = isEmptySlotLocal ? emptySlotRole : (replacedPlayerObj?.mainRole ?? 1);
                return (
                  <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 8px", borderRadius: 4, background: i === 0 ? "rgba(16,185,129,0.06)" : "rgba(0,0,0,0.15)", border: `1px solid ${i === 0 ? "rgba(16,185,129,0.2)" : "var(--border)"}`, fontSize: 11, gap: 6 }}>
                    <span style={{ fontWeight: 500, minWidth: 0, flex: 1 }}>
                      <span style={{ color: "var(--text-muted)", marginRight: 6, fontSize: 10 }}>{i + 1}</span>
                      {e.player.nick}
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "monospace", flexShrink: 0 }}>
                      <span style={{ color: "var(--text-secondary)" }}>{e.player.mmr.toLocaleString()} · R{e.player.mainRole}</span>
                      {poolSubScores && (
                        <span style={{ color: "var(--accent)", fontSize: 10, fontWeight: 700 }}>
                          {(poolSubScores.get(e.id) ?? 0).toFixed(3)}
                        </span>
                      )}
                      <MatchBadge count={(e.player as typeof e.player & { matchesPlayed?: number }).matchesPlayed ?? 0} />
                    </span>
                    {canAssign && (
                      <button
                        style={{
                          fontSize: 10, padding: "2px 8px", borderRadius: 4, flexShrink: 0,
                          border: "1px solid rgba(16,185,129,0.45)",
                          background: "rgba(16,185,129,0.1)",
                          color: "#34d399",
                          cursor: directAssignPending ? "not-allowed" : "pointer",
                          opacity: directAssignPending ? 0.5 : 1,
                          fontWeight: 600,
                        }}
                        disabled={directAssignPending}
                        onClick={() => onDirectAssign(
                          e.id,
                          teamId,
                          selectedTeamObj?.name ?? "",
                          isEmptySlotLocal ? undefined : replacedPlayerId,
                          neededRoleForAssign,
                        )}
                      >
                        Назначить
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
