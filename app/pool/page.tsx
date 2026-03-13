"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatMoscow } from "@/lib/date";
import type { Player, ReplacementPoolEntry } from "@/types";
import { useUser } from "@/components/UserContext";

const STATUS_BADGE: Record<string, string> = {
  Active:   "badge badge-green",
  Picked:   "badge badge-blue",
  Inactive: "badge badge-gray",
};

const SOURCE_LABELS: Record<string, string> = {
  reduction: "Сокращение",
  manual_add: "Ручное",
  returned: "Возврат",
  transferred_from_main_pool: "Перенос",
};

export default function PoolPage() {
  const qc = useQueryClient();
  const { user } = useUser();
  const canEdit = user?.role === "OWNER" || user?.role === "JUDGE";
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<Player[]>([]);

  const { data: entries = [], isLoading } = useQuery<ReplacementPoolEntry[]>({
    queryKey: ["pool", statusFilter],
    queryFn: () => {
      const sp = statusFilter ? `?status=${statusFilter}` : "";
      return fetch(`/api/replacement-pool${sp}`).then(r => r.json());
    },
  });

  const cleanupMutation = useMutation({
    mutationFn: () => fetch("/api/replacement-pool/cleanup", { method: "POST" }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pool"] });
    },
  });

  // Auto-cleanup: deactivate in-team Active entries when detected
  useEffect(() => {
    if (canEdit && entries.some(e => e.inTeam && e.status === "Active")) {
      cleanupMutation.mutate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, canEdit]);

  const patchMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      fetch(`/api/replacement-pool/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pool"] });
      qc.invalidateQueries({ queryKey: ["queue"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/replacement-pool/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pool"] });
      qc.invalidateQueries({ queryKey: ["queue"] });
    },
  });

  const returnMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/replacement-pool/${id}/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pool"] });
      qc.invalidateQueries({ queryKey: ["queue"] });
    },
  });

  const addToPoolMutation = useMutation({
    mutationFn: async (playerId: string) => {
      const res = await fetch("/api/replacement-pool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, source: "manual_add" }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pool"] });
      qc.invalidateQueries({ queryKey: ["queue"] });
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

  const counts = entries.reduce((acc, e) => {
    acc[e.status] = (acc[e.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Active player IDs already in pool (for search results)
  const inPoolIds = new Set(entries.filter(e => e.status === "Active").map(e => e.playerId));

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div className="page-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div className="page-title">Пул замен</div>
          <div className="page-subtitle" style={{ display: "flex", gap: 12, marginTop: 6 }}>
            <span style={{ color: "#34d399" }}>● Active: {counts.Active ?? 0}</span>
            <span style={{ color: "#60a5fa" }}>● Picked: {counts.Picked ?? 0}</span>
            <span style={{ color: "#94a3b8" }}>● Inactive: {counts.Inactive ?? 0}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select
            className="form-select"
            style={{ width: 160 }}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="">Все статусы</option>
            <option value="Active">Active</option>
            <option value="Picked">Picked</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Add to pool (JUDGE / OWNER only) */}
      {canEdit && (
        <div style={{ borderBottom: "1px solid var(--border)", padding: "10px 24px", background: "var(--bg-panel)" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", maxWidth: 500 }}>
            <div style={{ flex: 1 }}>
              <div className="lbl" style={{ marginBottom: 4 }}>Добавить игрока в пул</div>
              <input
                className="form-input"
                value={searchQ}
                onChange={e => handleSearch(e.target.value)}
                placeholder="Поиск по нику..."
              />
            </div>
          </div>
          {searchResults.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8, maxWidth: 500 }}>
              {searchResults.map(p => {
                const inPool = inPoolIds.has(p.id);
                return (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 10px", borderRadius: 5, background: "rgba(0,0,0,0.2)", border: "1px solid var(--border)", fontSize: 12 }}>
                    <div>
                      <span style={{ fontWeight: 600 }}>{p.nick}</span>
                      <span style={{ color: "var(--text-secondary)", marginLeft: 10 }}>
                        {p.mmr.toLocaleString()} MMR · S{p.stake} · R{p.mainRole}{p.flexRole ? `/R${p.flexRole}` : ""}
                      </span>
                    </div>
                    <button
                      className={`btn btn-sm ${inPool ? "btn-ghost" : "btn-blue"}`}
                      disabled={inPool || addToPoolMutation.isPending}
                      onClick={() => addToPoolMutation.mutate(p.id)}
                    >
                      {inPool ? "Уже в пуле" : "+ В пул"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div style={{ flex: 1, overflow: "auto", padding: "16px 24px" }}>
        {isLoading ? (
          <div style={{ color: "var(--text-secondary)", padding: 40, textAlign: "center" }}>Загрузка...</div>
        ) : (
          <div className="card" style={{ overflow: "hidden" }}>
            <table className="tbl">
              <thead>
                <tr>
                  {[...["НИК", "MMR", "STAKE", "РОЛЬ", "СТАТУС", "ИСТОЧНИК", "ДОБАВЛЕН В ПУЛ"], ...(canEdit ? ["ДЕЙСТВИЯ"] : [])].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id} style={e.inTeam && e.status === "Active" ? { background: "rgba(239,68,68,0.05)" } : {}}>
                    <td style={{ fontWeight: 600 }}>
                      {e.player.nick}
                      {e.inTeam && (
                        <span style={{ marginLeft: 6, fontSize: 10, color: "#f87171", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 3, padding: "1px 5px", verticalAlign: "middle" }}>
                          В команде
                        </span>
                      )}
                    </td>
                    <td>{e.player.mmr.toLocaleString()}</td>
                    <td>{e.player.stake}</td>
                    <td>R{e.player.mainRole}{e.player.flexRole ? `/R${e.player.flexRole}` : ""}</td>
                    <td><span className={STATUS_BADGE[e.status] ?? "badge badge-gray"}>{e.status}</span></td>
                    <td style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                      {SOURCE_LABELS[e.source] ?? e.source}
                    </td>
                    <td style={{ color: "var(--text-secondary)", fontSize: 12, fontFamily: "monospace" }}>
                      {formatMoscow(e.joinTime)}
                    </td>
                    {canEdit && (
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          {e.status === "Picked" && (
                            <button
                              className="btn btn-sm btn-blue"
                              onClick={() => returnMutation.mutate(e.id)}
                            >
                              Вернуть
                            </button>
                          )}
                          {e.status === "Active" && (
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={() => patchMutation.mutate({ id: e.id, status: "Inactive" })}
                            >
                              Деактив.
                            </button>
                          )}
                          {e.status === "Inactive" && (
                            <button
                              className="btn btn-sm btn-success"
                              onClick={() => patchMutation.mutate({ id: e.id, status: "Active" })}
                            >
                              Активировать
                            </button>
                          )}
                          <div style={{ width: 1, height: 20, background: "var(--border)", alignSelf: "center", margin: "0 4px" }} />
                          <button
                            className="btn btn-sm"
                            style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}
                            onClick={() => { if (confirm(`Удалить ${e.player.nick} из пула?`)) deleteMutation.mutate(e.id); }}
                          >
                            Удалить
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", color: "var(--text-muted)", padding: 32 }}>
                      Нет записей
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
