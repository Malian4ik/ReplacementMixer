"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar, Clock, RefreshCw, AlertTriangle, CheckCircle, XCircle, RotateCcw } from "lucide-react";
import { useUser } from "@/components/UserContext";

interface TournamentMatch {
  id: string;
  round: number;
  slot: number;
  homeTeam: string;
  awayTeam: string;
  scheduledAt: string;
  endsAt: string;
  status: "Scheduled" | "Live" | "Completed" | "TechLoss" | "Postponed";
  techLossTeam?: string;
  judgeName?: string;
  comment?: string;
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  Scheduled: { label: "Запланирован", color: "#8899b0" },
  Live:       { label: "Идёт",         color: "#34d399" },
  Completed:  { label: "Завершён",     color: "#60a5fa" },
  TechLoss:   { label: "Тех. луз",     color: "#f87171" },
  Postponed:  { label: "Перенесён",    color: "#fbbf24" },
};

const fmt = (s: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(s));

const fmtTime = (s: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(s));

const fmtDay = (s: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit", month: "long", year: "numeric",
  }).format(new Date(s));

function isLive(m: TournamentMatch) {
  const now = Date.now();
  return new Date(m.scheduledAt).getTime() <= now && new Date(m.endsAt).getTime() >= now && (m.status === "Scheduled" || m.status === "Live");
}

function ActionModal({ match, onClose }: { match: TournamentMatch; onClose: () => void }) {
  const qc = useQueryClient();
  const [judgeName, setJudgeName] = useState("");
  const [comment, setComment] = useState("");
  const [techLossTeam, setTechLossTeam] = useState(match.homeTeam);
  const [mode, setMode] = useState<"tech_loss" | "postpone" | null>(null);

  const mutation = useMutation({
    mutationFn: async (action: "tech_loss" | "postpone" | "complete") => {
      const res = await fetch(`/api/schedule/matches/${match.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, techLossTeam: action === "tech_loss" ? techLossTeam : undefined, judgeName, comment }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule-matches"] });
      onClose();
    },
  });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: 20, width: "100%", maxWidth: 420 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Тур {match.round}</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
          {match.homeTeam} vs {match.awayTeam} · {fmt(match.scheduledAt)}
        </div>

        {!mode ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button className="btn btn-danger" style={{ justifyContent: "center", padding: "10px 0" }} onClick={() => setMode("tech_loss")}>
              <XCircle size={14} /> Тех. поражение
            </button>
            <button className="btn btn-ghost" style={{ justifyContent: "center", padding: "10px 0" }} onClick={() => setMode("postpone")}>
              <RotateCcw size={14} /> Перенести матч
            </button>
            <button className="btn btn-success" style={{ justifyContent: "center", padding: "10px 0" }} onClick={() => mutation.mutate("complete")}>
              <CheckCircle size={14} /> Завершить вручную
            </button>
            <button className="btn btn-ghost" style={{ justifyContent: "center", padding: "10px 0", marginTop: 4 }} onClick={onClose}>Отмена</button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {mode === "tech_loss" && (
              <div>
                <div className="lbl" style={{ marginBottom: 4 }}>Команда с тех. поражением</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {[match.homeTeam, match.awayTeam].map(t => (
                    <button key={t} onClick={() => setTechLossTeam(t)}
                      style={{ flex: 1, padding: "8px 0", borderRadius: 5, cursor: "pointer", fontSize: 12, fontWeight: 600,
                        background: techLossTeam === t ? "rgba(239,68,68,0.15)" : "rgba(0,0,0,0.2)",
                        border: `1px solid ${techLossTeam === t ? "#ef4444" : "var(--border)"}`,
                        color: techLossTeam === t ? "#f87171" : "var(--text-primary)" }}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {mode === "postpone" && (
              <div style={{ padding: "8px 10px", background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: 6, fontSize: 12, color: "#fbbf24" }}>
                Матч будет перенесён в конец расписания автоматически
              </div>
            )}
            <div>
              <div className="lbl" style={{ marginBottom: 4 }}>Судья <span style={{ color: "#f87171" }}>*</span></div>
              <input className="form-input" value={judgeName} onChange={e => setJudgeName(e.target.value)} placeholder="Ваше имя" />
            </div>
            <div>
              <div className="lbl" style={{ marginBottom: 4 }}>Причина / комментарий</div>
              <input className="form-input" value={comment} onChange={e => setComment(e.target.value)} placeholder="Опционально" />
            </div>
            {mutation.isError && <div style={{ fontSize: 12, color: "#f87171" }}>Ошибка: {(mutation.error as Error).message}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button className="btn btn-ghost" style={{ flex: 1, justifyContent: "center" }} onClick={() => setMode(null)}>Назад</button>
              <button className="btn btn-accent" style={{ flex: 2, justifyContent: "center" }}
                disabled={!judgeName.trim() || mutation.isPending}
                onClick={() => mutation.mutate(mode)}>
                {mutation.isPending ? "Обработка..." : "Подтвердить"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AddMatchModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [round, setRound] = useState("1");
  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");

  const { data: dbTeams = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["teams-list"],
    queryFn: () => fetch("/api/teams").then(r => r.json()),
  });

  const teamNames = useMemo(() => dbTeams.map(t => t.name).sort(), [dbTeams]);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/schedule/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ round: parseInt(round), homeTeam, awayTeam, scheduledAt }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule-matches"] });
      onClose();
    },
  });

  const canSubmit = round && parseInt(round) > 0 && homeTeam.trim() && awayTeam.trim() && scheduledAt && homeTeam.trim() !== awayTeam.trim();

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: 20, width: "100%", maxWidth: 380 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Добавить матч</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <div className="lbl" style={{ marginBottom: 4 }}>Тур</div>
            <input className="form-input" type="number" min="1" value={round} onChange={e => setRound(e.target.value)} placeholder="1" />
          </div>
          <div>
            <div className="lbl" style={{ marginBottom: 4 }}>Команда 1 (дом)</div>
            <input className="form-input" value={homeTeam} onChange={e => setHomeTeam(e.target.value)} list="add-match-home-teams" placeholder="Название команды" autoComplete="off" />
            <datalist id="add-match-home-teams">{teamNames.map(t => <option key={t} value={t} />)}</datalist>
          </div>
          <div>
            <div className="lbl" style={{ marginBottom: 4 }}>Команда 2 (гости)</div>
            <input className="form-input" value={awayTeam} onChange={e => setAwayTeam(e.target.value)} list="add-match-away-teams" placeholder="Название команды" autoComplete="off" />
            <datalist id="add-match-away-teams">{teamNames.map(t => <option key={t} value={t} />)}</datalist>
          </div>
          <div>
            <div className="lbl" style={{ marginBottom: 4 }}>Начало (МСК)</div>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
              style={{ width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid var(--border-light)", color: "var(--text-primary)", borderRadius: 6, padding: "6px 10px", fontSize: 13, outline: "none" }}
            />
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Матч длится 1.5 ч · конец считается автоматически</div>
          {mutation.isError && <div style={{ fontSize: 12, color: "#f87171" }}>Ошибка: {(mutation.error as Error).message}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button className="btn btn-ghost" style={{ flex: 1, justifyContent: "center" }} onClick={onClose}>Отмена</button>
            <button className="btn btn-accent" style={{ flex: 2, justifyContent: "center" }} disabled={!canSubmit || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? "Добавление..." : "Добавить"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GenerateModal({ onClose, clearMode }: { onClose: () => void; clearMode?: boolean }) {
  const qc = useQueryClient();
  const [firstMatchTime, setFirstMatchTime] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/schedule/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearExisting: clearMode, firstMatchTime: firstMatchTime || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["schedule-matches"] });
      alert(`Создано ${data.created} матчей для ${data.teams} команд (${data.rounds} туров)`);
      onClose();
    },
  });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: 20, width: "100%", maxWidth: 380 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>
          {clearMode ? "Пересоздать расписание" : "Создать расписание"}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 16 }}>
          Система возьмёт все команды из базы и сгенерирует round-robin расписание. Матчи идут непрерывно 24/7, отдых ~18ч между турами.
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>Время первого матча (МСК)</div>
          <input
            type="datetime-local"
            value={firstMatchTime}
            onChange={e => setFirstMatchTime(e.target.value)}
            style={{
              width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid var(--border-light)",
              color: "var(--text-primary)", borderRadius: 6, padding: "6px 10px", fontSize: 13, outline: "none",
            }}
          />
        </div>
        {mutation.isError && <div style={{ fontSize: 12, color: "#f87171", marginBottom: 8 }}>Ошибка: {(mutation.error as Error).message}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" style={{ flex: 1, justifyContent: "center" }} onClick={onClose}>Отмена</button>
          <button className="btn btn-accent" style={{ flex: 2, justifyContent: "center" }} onClick={() => mutation.mutate()} disabled={mutation.isPending || !firstMatchTime}>
            {mutation.isPending ? "Генерация..." : "Создать"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SchedulePage() {
  const { user } = useUser();
  const isOwner = user?.role === "OWNER";
  const isJudge = isOwner;

  if (user && !isOwner) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 48 }}>🔒</div>
        <div style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: 16 }}>Доступ запрещён</div>
        <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>Раздел доступен только для Owner</div>
      </div>
    );
  }
  const qc = useQueryClient();

  const [activeMatch, setActiveMatch] = useState<TournamentMatch | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [showClear, setShowClear] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importTournamentId, setImportTournamentId] = useState("");
  const [importClear, setImportClear] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [filterTeam, setFilterTeam] = useState("");
  const clearScheduleMutation = useMutation({
    mutationFn: () => fetch("/api/schedule/matches", { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedule-matches"] }),
  });
  const [expandedRound, setExpandedRound] = useState<number | null>(null);

  const { data: syncedTournaments = [] } = useQuery<{ id: string; externalId: string; name: string; participantCount: number | null }[]>({
    queryKey: ["synced-tournaments"],
    queryFn: () => fetch("/api/admin/tournaments/synced").then(r => r.json()),
    enabled: showImport,
  });

  const scheduleImportMutation = useMutation({
    mutationFn: async ({ tournamentId, clearExisting }: { tournamentId: string; clearExisting: boolean }) => {
      const res = await fetch("/api/admin/tournaments/import/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId, clearExisting }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка импорта расписания");
      return data as { imported: number; skipped: number; errors: string[] };
    },
    onSuccess: (data) => {
      setImportResult(data);
      setImportError(null);
      qc.invalidateQueries({ queryKey: ["schedule-matches"] });
    },
    onError: (e: Error) => {
      setImportError(e.message);
      setImportResult(null);
    },
  });

  const { data: matches = [], isLoading } = useQuery<TournamentMatch[]>({
    queryKey: ["schedule-matches"],
    queryFn: () => fetch("/api/schedule/matches").then(r => r.json()),
    refetchInterval: 60_000,
  });

  const liveMatches = useMemo(() => matches.filter(isLive), [matches]);
  const upcomingMatches = useMemo(() => {
    const now = Date.now();
    return matches
      .filter(m => new Date(m.scheduledAt).getTime() > now && m.status === "Scheduled")
      .slice(0, 6);
  }, [matches]);

  const filtered = useMemo(() => {
    if (!filterTeam) return matches;
    return matches.filter(m => m.homeTeam === filterTeam || m.awayTeam === filterTeam);
  }, [matches, filterTeam]);

  const byRound = useMemo(() => {
    const map = new Map<number, TournamentMatch[]>();
    for (const m of filtered) {
      if (!map.has(m.round)) map.set(m.round, []);
      map.get(m.round)!.push(m);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [filtered]);

  const teams = useMemo(() => {
    const s = new Set<string>();
    matches.forEach(m => { s.add(m.homeTeam); s.add(m.awayTeam); });
    return [...s].sort();
  }, [matches]);

  const totalMatches = matches.length;
  const completedCount = matches.filter(m => m.status === "Completed" || m.status === "TechLoss").length;

  return (
    <div style={{ padding: "20px 16px", maxWidth: 900, margin: "0 auto" }}>
      {activeMatch && <ActionModal match={activeMatch} onClose={() => setActiveMatch(null)} />}
      {showGenerate && <GenerateModal onClose={() => setShowGenerate(false)} />}
      {showClear && <GenerateModal clearMode onClose={() => setShowClear(false)} />}
      {showAdd && <AddMatchModal onClose={() => setShowAdd(false)} />}

      {/* Import panel */}
      {isOwner && showImport && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: 20, width: "100%", maxWidth: 440 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Импорт расписания из админки</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>
              Считывает матчи из внешней системы и добавляет в расписание.
            </div>
            {syncedTournaments.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
                Нет синхронизированных турниров. Сначала выполните импорт участников.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <div className="lbl" style={{ marginBottom: 4 }}>Турнир</div>
                  <select
                    value={importTournamentId}
                    onChange={e => { setImportTournamentId(e.target.value); setImportResult(null); setImportError(null); }}
                    style={{ width: "100%", background: "var(--bg-panel)", border: "1px solid var(--border)", color: "var(--text-primary)", borderRadius: 6, padding: "6px 10px", fontSize: 13, cursor: "pointer" }}
                  >
                    <option value="">— выберите турнир —</option>
                    {syncedTournaments.map(t => (
                      <option key={t.externalId} value={t.externalId}>
                        {t.name}{t.participantCount ? ` (${t.participantCount} уч.)` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
                  <input type="checkbox" checked={importClear} onChange={e => setImportClear(e.target.checked)} />
                  <span>Очистить текущее расписание перед импортом</span>
                </label>
              </div>
            )}

            {scheduleImportMutation.isPending && (
              <div style={{ marginTop: 10, fontSize: 12, color: "var(--accent)" }}>
                Импортирую расписание из внешней системы...
              </div>
            )}

            {importResult && (
              <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 6, fontSize: 12 }}>
                <span style={{ color: "#34d399", fontWeight: 700 }}>✅ Готово</span>
                {" · "}Импортировано: <b>{importResult.imported}</b>
                {importResult.skipped > 0 && <span style={{ color: "var(--text-muted)" }}>{" · "}Пропущено: {importResult.skipped}</span>}
                {importResult.errors.length > 0 && (
                  <div style={{ marginTop: 6, color: "#fbbf24", fontSize: 11 }}>
                    {importResult.errors.slice(0, 5).map((e, i) => <div key={i}>⚠ {e}</div>)}
                  </div>
                )}
              </div>
            )}

            {importError && (
              <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 6, fontSize: 12, color: "#f87171" }}>
                ❌ {importError}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button className="btn btn-ghost" style={{ flex: 1, justifyContent: "center" }} onClick={() => { setShowImport(false); setImportResult(null); setImportError(null); }}>
                Закрыть
              </button>
              <button
                className="btn btn-accent"
                style={{ flex: 2, justifyContent: "center" }}
                disabled={!importTournamentId || scheduleImportMutation.isPending}
                onClick={() => importTournamentId && scheduleImportMutation.mutate({ tournamentId: importTournamentId, clearExisting: importClear })}
              >
                {scheduleImportMutation.isPending ? "Импорт..." : "Импортировать"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <Calendar size={18} color="var(--accent)" />
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Расписание турнира</h1>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
            {totalMatches > 0
              ? `${completedCount}/${totalMatches} матчей завершено · Round-robin · 24/7`
              : "Расписание не создано"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => qc.invalidateQueries({ queryKey: ["schedule-matches"] })}>
            <RefreshCw size={12} /> Обновить
          </button>
          {isOwner && (
            <button className="btn btn-ghost btn-sm" onClick={() => setShowImport(true)}>
              ⬇ Из админки
            </button>
          )}
          {isOwner && totalMatches === 0 && (
            <>
              <button className="btn btn-accent btn-sm" onClick={() => setShowGenerate(true)}>
                + Создать расписание
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(true)}>
                + Матч вручную
              </button>
            </>
          )}
          {isOwner && totalMatches > 0 && (
            <>
              <button className="btn btn-sm btn-accent" onClick={() => setShowAdd(true)}>
                + Матч
              </button>
              <button className="btn btn-sm btn-danger" disabled={clearScheduleMutation.isPending} onClick={() => clearScheduleMutation.mutate()}>
                Очистить
              </button>
              <button className="btn btn-sm btn-accent" onClick={() => setShowClear(true)}>
                Пересоздать
              </button>
            </>
          )}
        </div>
      </div>

      {isLoading && <div style={{ color: "var(--text-secondary)", textAlign: "center", padding: 40 }}>Загрузка...</div>}

      {!isLoading && totalMatches === 0 && (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text-secondary)" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📅</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Расписание не создано</div>
          {isOwner
            ? <div style={{ fontSize: 13 }}>Нажмите «+ Создать расписание» — система автоматически<br />распределит все зарегистрированные команды.</div>
            : <div style={{ fontSize: 13 }}>Обратитесь к OWNER для создания расписания.</div>}
        </div>
      )}

      {totalMatches > 0 && (
        <>
          {/* Live matches */}
          {liveMatches.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#34d399", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#34d399", display: "inline-block", animation: "pulse 2s infinite" }} />
                Сейчас идут · {liveMatches.length}
              </div>
              {liveMatches.map(m => (
                <div key={m.id} style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 8, padding: "12px 16px", marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{m.homeTeam} <span style={{ color: "var(--text-muted)" }}>vs</span> {m.awayTeam}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Тур {m.round} · до {fmtTime(m.endsAt)} МСК</div>
                  </div>
                  {isJudge && (
                    <button className="btn btn-danger btn-sm" onClick={() => setActiveMatch(m)}>
                      <AlertTriangle size={12} /> Действие
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Upcoming */}
          {upcomingMatches.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                Ближайшие
              </div>
              {upcomingMatches.map(m => (
                <div key={m.id} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 16px", marginBottom: 4, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{m.homeTeam} <span style={{ color: "var(--text-muted)" }}>vs</span> {m.awayTeam}</span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 10 }}>Тур {m.round}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Clock size={11} color="var(--text-muted)" />
                    <span style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>{fmt(m.scheduledAt)} МСК</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Filter + full schedule */}
          <div style={{ marginBottom: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <select value={filterTeam} onChange={e => setFilterTeam(e.target.value)}
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)", borderRadius: 6, padding: "6px 10px", fontSize: 13, cursor: "pointer", minWidth: 180 }}>
              <option value="">Все команды</option>
              {teams.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {filterTeam && <span style={{ fontSize: 12, color: "var(--accent)" }}>Фильтр: {filterTeam}</span>}
          </div>

          <div>
            {byRound.map(([round, roundMatches]) => {
              const isOpen = expandedRound === round;
              const roundStart = roundMatches[0]?.scheduledAt;
              const done = roundMatches.filter(m => m.status === "Completed" || m.status === "TechLoss").length;
              return (
                <div key={round} style={{ marginBottom: 6 }}>
                  <div onClick={() => setExpandedRound(isOpen ? null : round)}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: isOpen ? "8px 8px 0 0" : 8, cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, background: "var(--accent)", color: "#000", borderRadius: 4, padding: "2px 7px" }}>Тур {round}</span>
                      {roundStart && <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{fmtDay(roundStart)}</span>}
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{done}/{roundMatches.length}</span>
                    </div>
                    <span style={{ fontSize: 14, color: "var(--text-muted)", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>›</span>
                  </div>
                  {isOpen && (
                    <div style={{ border: "1px solid var(--border)", borderTop: "none", borderRadius: "0 0 8px 8px", overflow: "hidden" }}>
                      {roundMatches.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()).map((m, i) => {
                        const st = STATUS_LABEL[m.status] ?? STATUS_LABEL.Scheduled;
                        const live = isLive(m);
                        return (
                          <div key={m.id} style={{
                            display: "grid", gridTemplateColumns: "70px 1fr auto 1fr auto",
                            alignItems: "center", padding: "8px 14px",
                            borderBottom: i < roundMatches.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                            background: live ? "rgba(16,185,129,0.05)" : m.status === "TechLoss" ? "rgba(239,68,68,0.05)" : "transparent",
                          }}>
                            <span style={{ fontSize: 11, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{fmtTime(m.scheduledAt)}</span>
                            <span style={{ fontSize: 13, fontWeight: 600, textAlign: "right", color: m.homeTeam === filterTeam ? "var(--accent)" : "var(--text-primary)" }}>{m.homeTeam}</span>
                            <span style={{ fontSize: 11, color: "var(--text-muted)", padding: "0 10px" }}>vs</span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: m.awayTeam === filterTeam ? "var(--accent)" : "var(--text-primary)" }}>{m.awayTeam}</span>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                              <span style={{ fontSize: 10, color: st.color, fontWeight: 600, whiteSpace: "nowrap" }}>{st.label}</span>
                              {isJudge && (m.status === "Scheduled" || live) && (
                                <button className="btn btn-sm" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", color: "var(--text-secondary)", padding: "2px 7px" }}
                                  onClick={() => setActiveMatch(m)}>
                                  ···
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
