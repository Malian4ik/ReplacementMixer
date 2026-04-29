"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useUser } from "@/components/UserContext";
import { ConfirmModal } from "@/components/ConfirmModal";

type DisqualifiedPlayer = {
  id: string;
  nick: string;
  mmr: number;
  stake: number;
  wallet: string | null;
  telegramId: string | null;
  discordId: string | null;
  mainRole: number;
  flexRole: number | null;
  nightMatches: number;
};

const roleNames: Record<number, string> = { 1: "Carry", 2: "Mid", 3: "Offlane", 4: "Soft Sup", 5: "Hard Sup" };

export default function DisqualifiedPage() {
  const qc = useQueryClient();
  const { user } = useUser();
  const canEdit = user?.role === "OWNER" || user?.role === "JUDGE";
  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [showSync, setShowSync] = useState(false);
  const [syncTournamentId, setSyncTournamentId] = useState("");
  const [syncResult, setSyncResult] = useState<{ found: number; marked: number; alreadyMarked: number; errors: string[] } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const { data: players = [], isLoading } = useQuery<DisqualifiedPlayer[]>({
    queryKey: ["players-disqualified"],
    queryFn: () => fetch("/api/players?disqualified=true").then(r => r.json()),
    enabled: canEdit,
  });

  const { data: syncedTournaments = [] } = useQuery<{ id: string; externalId: string; name: string; participantCount: number | null }[]>({
    queryKey: ["synced-tournaments"],
    queryFn: () => fetch("/api/admin/tournaments/synced").then(r => r.json()),
    enabled: showSync,
  });

  const syncMutation = useMutation({
    mutationFn: async (tournamentId: string) => {
      const res = await fetch("/api/admin/tournaments/sync-disqualified", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка синхронизации");
      return data as { found: number; marked: number; alreadyMarked: number; errors: string[] };
    },
    onSuccess: (data) => {
      setSyncResult(data);
      setSyncError(null);
      qc.invalidateQueries({ queryKey: ["players-disqualified"] });
    },
    onError: (e: Error) => {
      setSyncError(e.message);
      setSyncResult(null);
    },
  });

  const undisqualifyMutation = useMutation({
    mutationFn: (playerId: string) =>
      fetch(`/api/players/${playerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDisqualified: false, isActiveInDatabase: true }),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["players-disqualified"] });
    },
  });

  if (!canEdit) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 40 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>Нет доступа</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Доступно только для JUDGE и OWNER</div>
      </div>
    );
  }

  return (
    <>
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      <div className="page-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div className="page-title">Дисквалифицированные</div>
          <div className="page-subtitle">Удалённые с платформы · {players.length} чел. · не сбрасываются при очистке турнира</div>
        </div>
        {canEdit && (
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => { setShowSync(v => !v); setSyncResult(null); setSyncError(null); }}
          >
            {showSync ? "Закрыть" : "🔄 Синхронизировать с админкой"}
          </button>
        )}
      </div>

      {/* Sync panel */}
      {canEdit && showSync && (
        <div style={{ background: "var(--bg-panel)", borderBottom: "1px solid var(--border)", padding: "14px 24px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Синхронизация дисквалифицированных из внешней админки</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
            Читает статусы участников с платформы и помечает всех с «Disqualified» в нашей базе. Быстро — только список страниц.
          </div>
          {syncedTournaments.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Нет синхронизированных турниров. Сначала импортируйте участников на странице{" "}
              <a href="/admin/import" style={{ color: "var(--accent)" }}>Импорт</a>.
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select
                value={syncTournamentId}
                onChange={e => { setSyncTournamentId(e.target.value); setSyncResult(null); setSyncError(null); }}
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)", borderRadius: 6, padding: "6px 10px", fontSize: 13, cursor: "pointer", minWidth: 220 }}
              >
                <option value="">— выберите турнир —</option>
                {syncedTournaments.map(t => (
                  <option key={t.externalId} value={t.externalId}>
                    {t.name}{t.participantCount ? ` (${t.participantCount} уч.)` : ""}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-sm btn-accent"
                disabled={!syncTournamentId || syncMutation.isPending}
                onClick={() => syncTournamentId && syncMutation.mutate(syncTournamentId)}
              >
                {syncMutation.isPending ? "Синхронизация..." : "Синхронизировать"}
              </button>
            </div>
          )}

          {syncMutation.isPending && (
            <div style={{ marginTop: 10, fontSize: 12, color: "var(--accent)" }}>
              Считываю статусы участников...
            </div>
          )}

          {syncResult && (
            <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 6, fontSize: 12 }}>
              <span style={{ color: "#34d399", fontWeight: 700 }}>✅ Готово</span>
              {" · "}Дисквал. на платформе: <b>{syncResult.found}</b>
              {" · "}<span style={{ color: "#f87171" }}>Новых: <b>{syncResult.marked}</b></span>
              {syncResult.alreadyMarked > 0 && <span style={{ color: "var(--text-muted)" }}>{" · "}Уже были: {syncResult.alreadyMarked}</span>}
              {syncResult.errors.length > 0 && (
                <div style={{ marginTop: 6, color: "#fbbf24", fontSize: 11 }}>
                  {syncResult.errors.slice(0, 5).map((e, i) => <div key={i}>⚠ {e}</div>)}
                  {syncResult.errors.length > 5 && <div>... и ещё {syncResult.errors.length - 5}</div>}
                </div>
              )}
            </div>
          )}

          {syncError && (
            <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 6, fontSize: 12, color: "#f87171" }}>
              ❌ {syncError}
            </div>
          )}
        </div>
      )}

      <div style={{ flex: 1, overflow: "auto", padding: "16px 24px" }}>
        {isLoading ? (
          <div style={{ color: "var(--text-muted)", textAlign: "center", paddingTop: 60 }}>Загрузка...</div>
        ) : players.length === 0 ? (
          <div style={{ color: "var(--text-muted)", textAlign: "center", paddingTop: 60, fontSize: 14 }}>
            Нет дисквалифицированных игроков
          </div>
        ) : (
          <div className="card" style={{ overflow: "hidden" }}>
            <table className="tbl">
              <thead>
                <tr>
                  {[...["#", "НИК", "MMR", "РОЛЬ", "ФЛЕКС", "СТАВКА", "КОШЕЛЁК", "TELEGRAM", "DISCORD"], ...(canEdit ? ["ДЕЙСТВИЯ"] : [])].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {players.map((p, i) => (
                  <tr key={p.id}>
                    <td style={{ color: "var(--text-muted)", fontSize: 11 }}>{i + 1}</td>
                    <td style={{ fontWeight: 700, color: "#f87171" }}>{p.nick}</td>
                    <td style={{ fontFamily: "monospace" }}>{p.mmr.toLocaleString()}</td>
                    <td style={{ color: "var(--text-secondary)" }}>{roleNames[p.mainRole] ?? `R${p.mainRole}`}</td>
                    <td style={{ color: "var(--text-muted)" }}>{p.flexRole ? (roleNames[p.flexRole] ?? `R${p.flexRole}`) : "—"}</td>
                    <td style={{ fontFamily: "monospace" }}>{p.stake}</td>
                    <td style={{ fontFamily: "monospace", color: "var(--accent)", fontSize: 12 }}>{p.wallet ?? "—"}</td>
                    <td style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                      {p.telegramId ? (p.telegramId.startsWith("@") ? p.telegramId : `@${p.telegramId}`) : "—"}
                    </td>
                    <td style={{ color: "var(--text-secondary)", fontSize: 12, fontFamily: "monospace" }}>{p.discordId ?? "—"}</td>
                    {canEdit && (
                      <td>
                        <button
                          className="btn btn-sm btn-success"
                          disabled={undisqualifyMutation.isPending}
                          onClick={() => setConfirmState({
                            message: `Снять дисквалификацию с ${p.nick}? Игрок снова станет активным.`,
                            onConfirm: () => { undisqualifyMutation.mutate(p.id); setConfirmState(null); },
                          })}
                        >
                          Снять дисквал.
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
    {confirmState && (
      <ConfirmModal
        message={confirmState.message}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState(null)}
      />
    )}
    </>
  );
}
