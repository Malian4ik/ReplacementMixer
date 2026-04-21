"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Team, SubstitutionPoolEntry } from "@/types";
import { useUser } from "@/components/UserContext";
import { MatchBadge } from "@/components/MatchBadge";

// Inline types to avoid server module import in client component
interface ActiveGamePlayer {
  id: string;
  nick: string;
  role: number;
  discordId: string | null;
}

interface ActiveGameTeam {
  id: string;
  name: string;
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

interface ActiveSession {
  id: string;
  teamName: string;
  neededRole: number;
  replacedPlayerNick: string | null;
  slotsNeeded: number;
  currentWave: number;
  status: string;
  waves: Array<{
    id: string;
    waveNumber: number;
    status: string;
    endsAt: string;
    responses: Array<{
      id: string;
      clickedAt: string;
      subScore: number | null;
      player: { id: string; nick: string; mmr: number; mainRole: number };
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

// ── Main component ────────────────────────────────────────────────────────────

export default function JudgePage() {
  const qc = useQueryClient();
  const { user } = useUser();
  const canEdit = user?.role === "OWNER" || user?.role === "JUDGE";

  const [judgeName, setJudgeName] = useState("");

  // ── Active match mode state ───────────────────────────────────────────────
  const [selectedHome, setSelectedHome] = useState<Set<string>>(new Set());
  const [selectedAway, setSelectedAway] = useState<Set<string>>(new Set());
  const [homeSearch, setHomeSearch] = useState<SearchState>({ pending: false, result: null, error: null });
  const [awaySearch, setAwaySearch] = useState<SearchState>({ pending: false, result: null, error: null });

  // ── Manual mode state (fallback) ──────────────────────────────────────────
  const [teamId, setTeamId] = useState("");
  const [replacedPlayerId, setReplacedPlayerId] = useState("");
  const [emptySlotRole, setEmptySlotRole] = useState<number>(1);
  const [manualSearch, setManualSearch] = useState<SearchState>({ pending: false, result: null, error: null });
  const [cancelPending, setCancelPending] = useState(false);

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
    enabled: !activeMatch,
  });

  const { data: activeSessionData, refetch: refetchActiveSession } = useQuery<{ session: ActiveSession | null }>({
    queryKey: ["active-session", teamId],
    queryFn: () => teamId
      ? fetch(`/api/judge/active-session?teamId=${teamId}`).then((r) => r.json())
      : Promise.resolve({ session: null }),
    enabled: !activeMatch && !!teamId,
    refetchInterval: 4000,
  });

  // Active sessions for active match teams
  const { data: homeSessionData, refetch: refetchHomeSession } = useQuery<{ session: ActiveSession | null }>({
    queryKey: ["active-session", activeMatch?.homeTeam?.id],
    queryFn: () => activeMatch?.homeTeam?.id
      ? fetch(`/api/judge/active-session?teamId=${activeMatch.homeTeam.id}`).then((r) => r.json())
      : Promise.resolve({ session: null }),
    enabled: !!activeMatch?.homeTeam?.id,
    refetchInterval: 4000,
  });

  const { data: awaySessionData, refetch: refetchAwaySession } = useQuery<{ session: ActiveSession | null }>({
    queryKey: ["active-session", activeMatch?.awayTeam?.id],
    queryFn: () => activeMatch?.awayTeam?.id
      ? fetch(`/api/judge/active-session?teamId=${activeMatch.awayTeam.id}`).then((r) => r.json())
      : Promise.resolve({ session: null }),
    enabled: !!activeMatch?.awayTeam?.id,
    refetchInterval: 4000,
  });

  // ── Actions ───────────────────────────────────────────────────────────────

  async function startDiscordSearch(
    team: ActiveGameTeam,
    selectedIds: Set<string>,
    setState: (s: SearchState) => void,
    refetch: () => void
  ) {
    if (!judgeName.trim() || selectedIds.size === 0) return;
    setState({ pending: true, result: null, error: null });

    const slots = Array.from(selectedIds).map((playerId, i) => {
      const player = team.players.find((p) => p?.id === playerId);
      return {
        replacedPlayerId: playerId,
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
          teamId: team.id,
          judgeName: judgeName.trim(),
          targetAvgMmr,
          maxDeviation: MAX_DEVIATION,
          activeMatchId: activeMatch?.id,
          slots,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка сервера");
      setState({ pending: false, result: { sessionId: data.sessionId, teamName: data.teamName }, error: null });
      refetch();
    } catch (err: unknown) {
      setState({ pending: false, result: null, error: err instanceof Error ? err.message : "Ошибка" });
    }
  }

  async function cancelSession(sessionTeamId: string, refetch: () => void) {
    await fetch(`/api/judge/active-session?teamId=${sessionTeamId}`, { method: "DELETE" });
    refetch();
    qc.invalidateQueries({ queryKey: ["active-session", sessionTeamId] });
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
    mutationFn: ({ sessionId, playerId }: { sessionId: string; playerId: string }) =>
      fetch("/api/judge/pick-responder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, playerId, judgeName: judgeName.trim() }),
      }).then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Ошибка");
        return d;
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pool"] });
      qc.invalidateQueries({ queryKey: ["active-session"] });
      refetchHomeSession();
      refetchAwaySession();
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
    setSelected: (s: Set<string>) => void,
    search: SearchState,
    setSearch: (s: SearchState) => void,
    sessionData: { session: ActiveSession | null } | undefined,
    refetch: () => void
  ) {
    const session = sessionData?.session ?? null;
    const activeWave = session?.waves?.[0] ?? null;
    const hasSession = !!session;

    function toggle(playerId: string) {
      const next = new Set(selected);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      setSelected(next);
    }

    return (
      <div style={{ ...col, flex: 1 }}>
        <div style={{ ...colHeader, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{team.name}</span>
          {selected.size > 0 && (
            <span style={{ color: "#f87171", fontWeight: 800, textTransform: "none", fontSize: 12 }}>
              {selected.size} выбран{selected.size > 1 ? "о" : ""}
            </span>
          )}
        </div>

        {/* Player list */}
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

          {/* Active Discord session for this team */}
          {hasSession && (
            <div style={{ marginTop: 12, padding: "10px 12px", background: "rgba(88,101,242,0.08)", border: "1px solid rgba(88,101,242,0.25)", borderRadius: 7 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#7289da" }}>⚡ Поиск активен</div>
                <button
                  onClick={() => cancelSession(team.id, refetch)}
                  style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.08)", color: "#f87171", cursor: "pointer" }}
                >
                  Отменить
                </button>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>
                {session.slotsNeeded} замен · волна {session.currentWave}
              </div>

              {activeWave && (
                <>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 6 }}>
                    Откликнулись: {activeWave.responses.length}/{activeWave.candidates.length}
                    {" · до "}
                    {new Date(activeWave.endsAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </div>
                  {activeWave.responses.map((r) => (
                    <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px", borderRadius: 4, background: "rgba(0,0,0,0.25)", border: "1px solid rgba(88,101,242,0.15)", marginBottom: 3 }}>
                      <span style={{ fontSize: 12 }}>
                        <b>{r.player.nick}</b>
                        <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 6 }}>
                          {r.player.mmr.toLocaleString()} · {roleLabel(r.player.mainRole)}
                          {r.subScore != null ? ` · ${r.subScore.toFixed(3)}` : ""}
                        </span>
                      </span>
                      <button
                        style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, border: "1px solid rgba(16,185,129,0.4)", background: "rgba(16,185,129,0.1)", color: "#34d399", cursor: judgeName.trim() ? "pointer" : "not-allowed", opacity: judgeName.trim() ? 1 : 0.5 }}
                        disabled={!judgeName.trim() || pickResponderMutation.isPending}
                        onClick={() => pickResponderMutation.mutate({ sessionId: session.id, playerId: r.player.id })}
                      >
                        Выбрать
                      </button>
                    </div>
                  ))}
                  {activeWave.responses.length === 0 && (
                    <div style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>Ждём откликов...</div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Search result / error */}
          {!hasSession && search.result && (
            <div style={{ marginTop: 10, padding: "6px 10px", background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 5, fontSize: 11, color: "#34d399" }}>
              ✅ Сессия запущена · {search.result.teamName}
            </div>
          )}
          {search.error && (
            <div style={{ marginTop: 10, padding: "6px 10px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 5, fontSize: 11, color: "#f87171" }}>
              ❌ {search.error}
            </div>
          )}
        </div>

        {/* Search button */}
        <div style={{ padding: "10px 12px", borderTop: "1px solid var(--border)" }}>
          <button
            style={{
              width: "100%", padding: "9px 0", borderRadius: 6,
              border: "1px solid rgba(88,101,242,0.4)",
              background: search.pending ? "rgba(88,101,242,0.15)" : "rgba(88,101,242,0.08)",
              color: "rgba(88,101,242,0.9)",
              fontSize: 13, fontWeight: 700, cursor: "pointer",
              opacity: (selected.size === 0 || !judgeName.trim() || search.pending || hasSession) ? 0.4 : 1,
              transition: "all 0.15s",
            }}
            disabled={selected.size === 0 || !judgeName.trim() || search.pending || hasSession}
            onClick={() => startDiscordSearch(team, selected, setSearch, refetch)}
          >
            {search.pending ? "Запускаю..." : hasSession ? "Поиск идёт..." : "🔍 Поиск в Discord"}
          </button>
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
      ) : activeMatch ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", padding: "12px 16px", gap: 10 }}>

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
            </div>
          </div>

          {/* Instructions */}
          {!judgeName.trim() && (
            <div style={{ padding: "7px 14px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, fontSize: 12, color: "#f87171", flexShrink: 0 }}>
              ✏️ Введите имя судьи в правом верхнем углу, затем выберите игроков для замены
            </div>
          )}

          {/* Two-column team UI */}
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, minHeight: 0, overflow: "auto" }}>
            {renderTeamColumn(
              activeMatch.homeTeam,
              selectedHome,
              setSelectedHome,
              homeSearch,
              setHomeSearch,
              homeSessionData,
              refetchHomeSession
            )}
            {renderTeamColumn(
              activeMatch.awayTeam,
              selectedAway,
              setSelectedAway,
              awaySearch,
              setAwaySearch,
              awaySessionData,
              refetchAwaySession
            )}
          </div>
        </div>

      ) : (
        /* ── Manual mode (no active match) ─────────────────────────────── */
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
        />
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
}) {
  const selectedTeam = teams.find((t) => t.id === teamId);
  const teamPlayers = selectedTeam?.players ?? [];
  const isEmptySlot = replacedPlayerId === EMPTY_SLOT;
  const replacedPlayer = teamPlayers.find((p) => p?.id === replacedPlayerId) ?? null;
  const neededRole = isEmptySlot ? emptySlotRole : (replacedPlayer?.mainRole ?? 1);
  const activeWave = activeSession?.waves?.[0] ?? null;

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
        <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)", fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "var(--text-secondary)" }}>
          Пул замен · {poolEntries.length}
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "10px 14px" }}>
          {poolEntries.length === 0 ? (
            <div style={{ color: "var(--text-muted)", textAlign: "center", paddingTop: 40, fontSize: 13 }}>Пул пуст</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {poolEntries.map((e, i) => (
                <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 8px", borderRadius: 4, background: i === 0 ? "rgba(16,185,129,0.06)" : "rgba(0,0,0,0.15)", border: `1px solid ${i === 0 ? "rgba(16,185,129,0.2)" : "var(--border)"}`, fontSize: 11 }}>
                  <span style={{ fontWeight: 500 }}>
                    <span style={{ color: "var(--text-muted)", marginRight: 6, fontSize: 10 }}>{i + 1}</span>
                    {e.player.nick}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "monospace" }}>
                    <span style={{ color: "var(--text-secondary)" }}>{e.player.mmr.toLocaleString()} · R{e.player.mainRole}</span>
                    <MatchBadge count={(e.player as typeof e.player & { matchesPlayed?: number }).matchesPlayed ?? 0} />
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
