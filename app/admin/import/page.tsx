"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/components/UserContext";

interface TournamentInfo {
  id: string | number;
  name: string;
  status?: string;
  participantCount?: number;
}

interface SyncRun {
  id: string;
  startedAt: string;
  finishedAt?: string;
  status: string;
  created: number;
  updated: number;
  failed: number;
  total: number;
  errorLog?: string;
  tournament: { name: string };
}

interface ImportResult {
  syncRunId: string;
  created: number;
  updated: number;
  failed: number;
  total: number;
  errors: string[];
}

interface TeamImportResult {
  created: number;
  updated: number;
  failed: number;
  total: number;
  errors: string[];
}

export default function ImportPage() {
  const { user } = useUser();
  const [selectedId, setSelectedId] = useState("");
  const [lastResult, setLastResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [teamResult, setTeamResult] = useState<TeamImportResult | null>(null);
  const [teamError, setTeamError] = useState<string | null>(null);

  const { data: tournaments = [], isLoading: loadingTournaments, error: tournamentError, refetch } = useQuery<TournamentInfo[]>({
    queryKey: ["admin-tournaments"],
    queryFn: () => fetch("/api/admin/tournaments").then(async r => {
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Ошибка загрузки");
      return d;
    }),
    enabled: false,
  });

  const { data: syncRuns = [], refetch: refetchRuns } = useQuery<SyncRun[]>({
    queryKey: ["sync-runs"],
    queryFn: () => fetch("/api/admin/tournaments/import").then(r => r.json()),
  });

  const importMutation = useMutation({
    mutationFn: async (tournamentId: string) => {
      const res = await fetch("/api/admin/tournaments/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка импорта");
      return data as ImportResult;
    },
    onSuccess: (data) => {
      setLastResult(data);
      setImportError(null);
      refetchRuns();
    },
    onError: (e: Error) => {
      setImportError(e.message);
      setLastResult(null);
    },
  });

  const teamImportMutation = useMutation({
    mutationFn: async (tournamentId: string) => {
      const res = await fetch("/api/admin/tournaments/import/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка импорта команд");
      return data as TeamImportResult;
    },
    onSuccess: (data) => {
      setTeamResult(data);
      setTeamError(null);
    },
    onError: (e: Error) => {
      setTeamError(e.message);
      setTeamResult(null);
    },
  });

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
        <div className="page-title">Импорт турнира</div>
        <div className="page-subtitle">Синхронизация участников из админки Mixer Cup</div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "16px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Step 1 — загрузить турниры */}
        <div className="card" style={{ padding: "16px 20px" }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: "var(--text-primary)" }}>
            Шаг 1 — загрузить список турниров из источника
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button
              className="btn btn-sm btn-accent"
              onClick={() => refetch()}
              disabled={loadingTournaments}
            >
              {loadingTournaments ? "Загрузка..." : "🔄 Загрузить турниры"}
            </button>
            {tournamentError && (
              <span style={{ color: "#f87171", fontSize: 12 }}>
                {tournamentError instanceof Error ? tournamentError.message : "Ошибка"}
              </span>
            )}
            {!process.env.NEXT_PUBLIC_ADMIN_SOURCE_URL && tournaments.length === 0 && (
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                Требует настройки: ADMIN_SOURCE_URL, ADMIN_SOURCE_USERNAME, ADMIN_SOURCE_PASSWORD в env
              </span>
            )}
          </div>
          {tournaments.length > 0 && (
            <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {tournaments.map(t => (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(String(t.id))}
                  style={{
                    padding: "5px 12px",
                    borderRadius: 5,
                    border: selectedId === String(t.id) ? "1px solid var(--accent)" : "1px solid var(--border)",
                    background: selectedId === String(t.id) ? "rgba(0,212,232,0.12)" : "rgba(0,0,0,0.2)",
                    color: selectedId === String(t.id) ? "var(--accent)" : "var(--text-primary)",
                    fontSize: 12,
                    cursor: "pointer",
                    fontWeight: selectedId === String(t.id) ? 700 : 400,
                  }}
                >
                  {t.name}
                  {t.participantCount ? <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>({t.participantCount})</span> : null}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Step 2 — импортировать */}
        <div className="card" style={{ padding: "16px 20px" }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: "var(--text-primary)" }}>
            Шаг 2 — импортировать участников
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button
              className="btn btn-sm btn-success"
              disabled={!selectedId || importMutation.isPending}
              onClick={() => selectedId && importMutation.mutate(selectedId)}
            >
              {importMutation.isPending ? "Импорт..." : "⬇ Импортировать"}
            </button>
            {!selectedId && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Выберите турнир выше</span>}
          </div>

          {importMutation.isPending && (
            <div style={{ marginTop: 12, padding: "8px 12px", background: "rgba(0,212,232,0.06)", border: "1px solid rgba(0,212,232,0.2)", borderRadius: 6, fontSize: 12, color: "var(--accent)" }}>
              Загружаю участников со всех страниц... это может занять до 30 сек.
            </div>
          )}

          {lastResult && (
            <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 6, fontSize: 12 }}>
              <div style={{ fontWeight: 700, color: "#34d399", marginBottom: 6 }}>✅ Импорт завершён</div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <span>Всего: <b>{lastResult.total}</b></span>
                <span style={{ color: "#34d399" }}>Создано: <b>{lastResult.created}</b></span>
                <span style={{ color: "#60a5fa" }}>Обновлено: <b>{lastResult.updated}</b></span>
                {lastResult.failed > 0 && <span style={{ color: "#f87171" }}>Ошибок: <b>{lastResult.failed}</b></span>}
              </div>
              {lastResult.errors.length > 0 && (
                <div style={{ marginTop: 8, color: "#f87171", fontSize: 11 }}>
                  {lastResult.errors.slice(0, 5).map((e, i) => <div key={i}>{e}</div>)}
                  {lastResult.errors.length > 5 && <div>... и ещё {lastResult.errors.length - 5}</div>}
                </div>
              )}
            </div>
          )}

          {importError && (
            <div style={{ marginTop: 12, padding: "8px 12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 6, fontSize: 12, color: "#f87171" }}>
              ❌ {importError}
            </div>
          )}
        </div>

        {/* Step 3 — импортировать команды */}
        <div className="card" style={{ padding: "16px 20px" }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, color: "var(--text-primary)" }}>
            Шаг 3 — импортировать команды
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
            Создаёт или обновляет команды из данных турнира. Участники должны быть импортированы на шаге 2 заранее.
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button
              className="btn btn-sm btn-success"
              disabled={!selectedId || teamImportMutation.isPending}
              onClick={() => selectedId && teamImportMutation.mutate(selectedId)}
            >
              {teamImportMutation.isPending ? "Импорт команд..." : "🏆 Импортировать команды"}
            </button>
            {!selectedId && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Выберите турнир выше</span>}
          </div>

          {teamImportMutation.isPending && (
            <div style={{ marginTop: 12, padding: "8px 12px", background: "rgba(0,212,232,0.06)", border: "1px solid rgba(0,212,232,0.2)", borderRadius: 6, fontSize: 12, color: "var(--accent)" }}>
              Загружаю команды... это может занять до 30 сек.
            </div>
          )}

          {teamResult && (
            <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 6, fontSize: 12 }}>
              <div style={{ fontWeight: 700, color: "#34d399", marginBottom: 6 }}>✅ Импорт команд завершён</div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <span>Всего: <b>{teamResult.total}</b></span>
                <span style={{ color: "#34d399" }}>Создано: <b>{teamResult.created}</b></span>
                <span style={{ color: "#60a5fa" }}>Обновлено: <b>{teamResult.updated}</b></span>
                {teamResult.failed > 0 && <span style={{ color: "#f87171" }}>Ошибок: <b>{teamResult.failed}</b></span>}
              </div>
              {teamResult.errors.length > 0 && (
                <div style={{ marginTop: 8, color: "#f87171", fontSize: 11 }}>
                  {teamResult.errors.slice(0, 5).map((e, i) => <div key={i}>{e}</div>)}
                  {teamResult.errors.length > 5 && <div>... и ещё {teamResult.errors.length - 5}</div>}
                </div>
              )}
            </div>
          )}

          {teamError && (
            <div style={{ marginTop: 12, padding: "8px 12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 6, fontSize: 12, color: "#f87171" }}>
              ❌ {teamError}
            </div>
          )}
        </div>

        {/* История синхронизаций */}
        {syncRuns.length > 0 && (
          <div className="card" style={{ padding: "16px 20px" }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: "var(--text-primary)" }}>
              История импортов
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {syncRuns.map(r => (
                <div key={r.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "7px 10px", borderRadius: 5, fontSize: 11,
                  background: "rgba(0,0,0,0.2)", border: "1px solid var(--border)",
                }}>
                  <div>
                    <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{r.tournament.name}</span>
                    <span style={{ color: "var(--text-muted)", marginLeft: 8 }}>
                      {new Date(r.startedAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <span style={{ color: r.status === "Completed" ? "#34d399" : r.status === "Running" ? "#fbbf24" : "#f87171", fontWeight: 600 }}>{r.status}</span>
                    <span style={{ color: "var(--text-muted)" }}>+{r.created} ~{r.updated} ✗{r.failed} / {r.total}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
