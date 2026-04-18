"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatMoscow } from "@/lib/date";
import type { Player, SubstitutionPoolEntry } from "@/types";
import { useUser } from "@/components/UserContext";
import { ConfirmModal } from "@/components/ConfirmModal";

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

type Tab = "pool" | "disqualified";

interface DisqualifiedPlayer extends Player {
  inTeam: boolean;
  isCaptain: boolean;
}

export default function PoolPage() {
  const qc = useQueryClient();
  const { user } = useUser();
  const canEdit = user?.role === "OWNER" || user?.role === "JUDGE";

  const [activeTab, setActiveTab] = useState<Tab>("pool");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<Player[]>([]);
  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null);

  // ── Pool entries ──────────────────────────────────────────────────────────────

  const { data: entries = [], isLoading } = useQuery<SubstitutionPoolEntry[]>({
    queryKey: ["pool", statusFilter],
    queryFn: () => {
      const sp = statusFilter ? `?status=${statusFilter}` : "";
      return fetch(`/api/substitution-pool${sp}`).then(r => r.json());
    },
  });

  const cleanupMutation = useMutation({
    mutationFn: () => fetch("/api/substitution-pool/cleanup", { method: "POST" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pool"] }); },
  });

  useEffect(() => {
    if (canEdit && entries.some(e => e.inTeam && e.status === "Active")) {
      cleanupMutation.mutate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, canEdit]);

  const patchMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      fetch(`/api/substitution-pool/${id}`, {
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
      fetch(`/api/substitution-pool/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pool"] });
      qc.invalidateQueries({ queryKey: ["queue"] });
    },
  });

  const returnMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/substitution-pool/${id}/return`, {
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
      const res = await fetch("/api/substitution-pool", {
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

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const visibleEntries = entries.filter(e => !e.inTeam);
  const counts = entries.reduce((acc, e) => {
    acc[e.status] = (acc[e.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const totalPages = Math.max(1, Math.ceil(visibleEntries.length / PAGE_SIZE));
  const pageEntries = visibleEntries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const inPoolIds = new Set(entries.filter(e => e.status === "Active").map(e => e.playerId));

  // ── Disqualified players ──────────────────────────────────────────────────────

  const { data: disqualifiedPlayers = [], isLoading: loadingDq } = useQuery<DisqualifiedPlayer[]>({
    queryKey: ["players-disqualified"],
    queryFn: () => fetch("/api/players?disqualified=true").then(r => r.json()),
    enabled: activeTab === "disqualified",
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

  const [dqPage, setDqPage] = useState(1);
  const dqTotalPages = Math.max(1, Math.ceil(disqualifiedPlayers.length / PAGE_SIZE));
  const dqPageEntries = disqualifiedPlayers.slice((dqPage - 1) * PAGE_SIZE, dqPage * PAGE_SIZE);

  // ── Render ────────────────────────────────────────────────────────────────────

  const tabStyle = (t: Tab): React.CSSProperties => ({
    padding: "6px 16px",
    borderRadius: "6px 6px 0 0",
    border: "1px solid var(--border)",
    borderBottom: activeTab === t ? "1px solid var(--bg-card)" : "1px solid var(--border)",
    background: activeTab === t ? "var(--bg-card)" : "transparent",
    color: activeTab === t ? "var(--text-primary)" : "var(--text-secondary)",
    fontWeight: activeTab === t ? 700 : 400,
    fontSize: 13,
    cursor: "pointer",
    marginBottom: -1,
    transition: "all 0.1s",
  });

  return (
    <>
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div className="page-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div className="page-title">Пул замен</div>
          <div className="page-subtitle" style={{ display: "flex", gap: 12, marginTop: 6 }}>
            <span style={{ color: "#34d399" }}>● Active: {counts.Active ?? 0}</span>
            <span style={{ color: "#60a5fa" }}>● Picked: {counts.Picked ?? 0}</span>
            <span style={{ color: "#94a3b8" }}>● Inactive: {counts.Inactive ?? 0}</span>
            {disqualifiedPlayers.length > 0 && (
              <span style={{ color: "#f87171" }}>● Дискв.: {disqualifiedPlayers.length}</span>
            )}
          </div>
        </div>
        {activeTab === "pool" && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              className="form-select"
              style={{ width: 160 }}
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            >
              <option value="">Все статусы</option>
              <option value="Active">Active</option>
              <option value="Picked">Picked</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 24px", borderBottom: "1px solid var(--border)" }}>
        <button style={tabStyle("pool")} onClick={() => setActiveTab("pool")}>
          Пул замен
        </button>
        <button style={tabStyle("disqualified")} onClick={() => { setActiveTab("disqualified"); setDqPage(1); }}>
          Дисквалифицированные
          {disqualifiedPlayers.length > 0 && (
            <span style={{ marginLeft: 6, background: "rgba(239,68,68,0.15)", color: "#f87171", borderRadius: 10, padding: "1px 6px", fontSize: 11, fontWeight: 700 }}>
              {disqualifiedPlayers.length}
            </span>
          )}
        </button>
      </div>

      {/* ── TAB: Pool ── */}
      {activeTab === "pool" && (
        <>
          {/* Add to pool */}
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
                      {[...["#", "НИК", "MMR", "STAKE", "РОЛЬ", "КОШЕЛЁК", "СТАТУС", "ИСТОЧНИК"], ...(canEdit ? ["ДЕЙСТВИЯ"] : [])].map(h => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageEntries.map(e => (
                      <tr key={e.id}>
                        <td style={{ color: "var(--text-muted)", fontSize: 12, fontWeight: 700, minWidth: 28 }}>
                          {visibleEntries.indexOf(e) + 1}
                        </td>
                        <td style={{ fontWeight: 600 }}>{e.player.nick}</td>
                        <td>{e.player.mmr.toLocaleString()}</td>
                        <td>{e.player.stake}</td>
                        <td>R{e.player.mainRole}{e.player.flexRole ? `/R${e.player.flexRole}` : ""}</td>
                        <td style={{ fontSize: 12, color: e.player.wallet ? "var(--text-primary)" : "var(--text-secondary)", fontFamily: "monospace" }}>
                          {e.player.wallet ?? "—"}
                        </td>
                        <td><span className={STATUS_BADGE[e.status] ?? "badge badge-gray"}>{e.status}</span></td>
                        <td style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                          {SOURCE_LABELS[e.source] ?? e.source}
                        </td>
                        {canEdit && (
                          <td>
                            <div style={{ display: "flex", gap: 6 }}>
                              {e.status === "Picked" && (
                                <button className="btn btn-sm btn-blue" onClick={() => returnMutation.mutate(e.id)}>Вернуть</button>
                              )}
                              {e.status === "Active" && (
                                <button className="btn btn-sm btn-danger" onClick={() => patchMutation.mutate({ id: e.id, status: "Inactive" })}>Деактив.</button>
                              )}
                              {e.status === "Inactive" && (
                                <button className="btn btn-sm btn-success" onClick={() => patchMutation.mutate({ id: e.id, status: "Active" })}>Активировать</button>
                              )}
                              <div style={{ width: 1, height: 20, background: "var(--border)", alignSelf: "center", margin: "0 4px" }} />
                              <button
                                className="btn btn-sm"
                                style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}
                                onClick={() => setConfirmState({ message: `Удалить ${e.player.nick} из пула?`, onConfirm: () => { deleteMutation.mutate(e.id); setConfirmState(null); } })}
                              >
                                Удалить
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                    {visibleEntries.length === 0 && (
                      <tr>
                        <td colSpan={9} style={{ textAlign: "center", color: "var(--text-muted)", padding: 32 }}>
                          Нет записей
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {totalPages > 1 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "12px 0" }}>
                <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage(1)}>«</button>
                <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button key={p} className={`btn btn-sm ${p === page ? "btn-accent" : "btn-ghost"}`} style={{ minWidth: 32 }} onClick={() => setPage(p)}>{p}</button>
                ))}
                <button className="btn btn-ghost btn-sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>›</button>
                <button className="btn btn-ghost btn-sm" disabled={page === totalPages} onClick={() => setPage(totalPages)}>»</button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── TAB: Disqualified ── */}
      {activeTab === "disqualified" && (
        <div style={{ flex: 1, overflow: "auto", padding: "16px 24px" }}>
          <div style={{ marginBottom: 12, padding: "8px 12px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, fontSize: 12, color: "var(--text-secondary)" }}>
            Список не очищается при сбросе данных турнира. Управляется независимо.
          </div>

          {loadingDq ? (
            <div style={{ color: "var(--text-secondary)", padding: 40, textAlign: "center" }}>Загрузка...</div>
          ) : (
            <div className="card" style={{ overflow: "hidden" }}>
              <table className="tbl">
                <thead>
                  <tr>
                    {[...["#", "НИК", "MMR", "РОЛЬ", "КОШЕЛЁК", "DISCORD"], ...(canEdit ? ["ДЕЙСТВИЯ"] : [])].map(h => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dqPageEntries.map((p, i) => (
                    <tr key={p.id}>
                      <td style={{ color: "var(--text-muted)", fontSize: 12, fontWeight: 700 }}>
                        {(dqPage - 1) * PAGE_SIZE + i + 1}
                      </td>
                      <td style={{ fontWeight: 600, color: "#f87171" }}>{p.nick}</td>
                      <td>{p.mmr.toLocaleString()}</td>
                      <td>R{p.mainRole}{p.flexRole ? `/R${p.flexRole}` : ""}</td>
                      <td style={{ fontSize: 12, color: p.wallet ? "var(--accent)" : "var(--text-muted)", fontFamily: "monospace" }}>
                        {p.wallet ?? "—"}
                      </td>
                      <td style={{ fontSize: 12, color: p.discordId ? "var(--text-secondary)" : "var(--text-muted)", fontFamily: "monospace" }}>
                        {p.discordId ?? "—"}
                      </td>
                      {canEdit && (
                        <td>
                          <button
                            className="btn btn-sm btn-success"
                            disabled={undisqualifyMutation.isPending}
                            onClick={() => setConfirmState({
                              message: `Снять дисквалификацию с ${p.nick}?`,
                              onConfirm: () => { undisqualifyMutation.mutate(p.id); setConfirmState(null); },
                            })}
                          >
                            Снять дисквал.
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {disqualifiedPlayers.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", color: "var(--text-muted)", padding: 32 }}>
                        Дисквалифицированных игроков нет
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {dqTotalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "12px 0" }}>
              <button className="btn btn-ghost btn-sm" disabled={dqPage === 1} onClick={() => setDqPage(1)}>«</button>
              <button className="btn btn-ghost btn-sm" disabled={dqPage === 1} onClick={() => setDqPage(p => p - 1)}>‹</button>
              {Array.from({ length: dqTotalPages }, (_, i) => i + 1).map(p => (
                <button key={p} className={`btn btn-sm ${p === dqPage ? "btn-accent" : "btn-ghost"}`} style={{ minWidth: 32 }} onClick={() => setDqPage(p)}>{p}</button>
              ))}
              <button className="btn btn-ghost btn-sm" disabled={dqPage === dqTotalPages} onClick={() => setDqPage(p => p + 1)}>›</button>
              <button className="btn btn-ghost btn-sm" disabled={dqPage === dqTotalPages} onClick={() => setDqPage(dqTotalPages)}>»</button>
            </div>
          )}
        </div>
      )}
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
