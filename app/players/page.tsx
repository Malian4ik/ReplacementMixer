"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Player } from "@/types";
import { useUser } from "@/components/UserContext";

const inputStyle: React.CSSProperties = {
  background: "rgba(0,0,0,0.5)",
  border: "1px solid var(--border-light)",
  color: "var(--text-primary)",
  borderRadius: 4,
  padding: "3px 6px",
  fontSize: 12,
  width: "100%",
  outline: "none",
};

const EMPTY_FORM = {
  nick: "", mmr: 8000, stake: 20, mainRole: 1 as 1|2|3|4|5,
  flexRole: "" as "" | 1|2|3|4|5, wallet: "", telegramId: "", nightMatches: 0,
};

export default function PlayersPage() {
  const qc = useQueryClient();
  const { user } = useUser();
  const canEdit = user?.role === "OWNER" || user?.role === "JUDGE";
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Player>>({});
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [createError, setCreateError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<"nick" | "mmr" | "stake" | "isActiveInDatabase">("nick");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  const { data: players = [], isLoading } = useQuery<Player[]>({
    queryKey: ["players"],
    queryFn: () => fetch("/api/players").then(r => r.json()),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Player> }) =>
      fetch(`/api/players/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["players"] });
      qc.invalidateQueries({ queryKey: ["teams"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      setEditId(null);
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: object) => {
      const res = await fetch("/api/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Ошибка сервера");
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["players"] });
      setShowAdd(false);
      setForm({ ...EMPTY_FORM });
      setCreateError(null);
    },
    onError: (e: Error) => setCreateError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/players/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["players"] });
      qc.invalidateQueries({ queryKey: ["teams"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => fetch("/api/players/clear", { method: "POST" }).then(r => r.json()),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["players"] });
      qc.invalidateQueries({ queryKey: ["teams"] });
      qc.invalidateQueries({ queryKey: ["pool"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      alert(`Сброс выполнен. Удалено игроков: ${data.deleted}`);
    },
  });

  const filtered = players
    .filter(p => !search || p.nick.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      let cmp = 0;
      if (sortKey === "nick") cmp = a.nick.localeCompare(b.nick);
      else if (sortKey === "mmr") cmp = a.mmr - b.mmr;
      else if (sortKey === "stake") cmp = a.stake - b.stake;
      else if (sortKey === "isActiveInDatabase") cmp = (b.isActiveInDatabase ? 1 : 0) - (a.isActiveInDatabase ? 1 : 0);
      return sortDir === "asc" ? cmp : -cmp;
    });
  const active = players.filter(p => p.isActiveInDatabase).length;
  const activePlayers = players.filter(p => p.isActiveInDatabase);
  const avgMmr = activePlayers.length
    ? Math.round(activePlayers.reduce((sum, p) => sum + p.mmr, 0) / activePlayers.length)
    : 0;

  function startEdit(p: Player) {
    setEditId(p.id);
    setEditData({
      nick: p.nick, mmr: p.mmr, stake: p.stake,
      mainRole: p.mainRole, flexRole: p.flexRole ?? undefined,
      wallet: p.wallet ?? undefined, telegramId: p.telegramId ?? undefined,
      nightMatches: p.nightMatches, isActiveInDatabase: p.isActiveInDatabase,
    });
  }

  function set<K extends keyof Player>(key: K, val: Player[K]) {
    setEditData(d => ({ ...d, [key]: val }));
  }

  function handleCreate() {
    setCreateError(null);
    createMutation.mutate({
      nick: form.nick,
      mmr: Number(form.mmr),
      stake: Number(form.stake),
      mainRole: Number(form.mainRole),
      flexRole: form.flexRole !== "" ? Number(form.flexRole) : null,
      wallet: form.wallet || null,
      telegramId: form.telegramId || null,
      nightMatches: Number(form.nightMatches),
    });
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div className="page-header" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div className="page-title">База игроков</div>
          <div className="page-subtitle">{players.length} всего · {active} активных</div>
          <div style={{ marginTop: 6 }}>
            <span style={{
              background: "rgba(0,212,232,0.1)",
              border: "1px solid rgba(0,212,232,0.25)",
              color: "var(--accent)",
              borderRadius: 6,
              padding: "3px 10px",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 0.3,
              display: "inline-block",
            }}>
              Средний ММР: {avgMmr.toLocaleString()}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
          <input
            className="form-input"
            style={{ width: 220 }}
            placeholder="Поиск по нику..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div style={{ display: "flex", gap: 8 }}>
          {canEdit && (
            <button
              className="btn btn-sm btn-success"
              onClick={() => setShowAdd(v => !v)}
            >
              {showAdd ? "Отмена" : "+ Добавить"}
            </button>
          )}
          {user?.role === "OWNER" && (
            <button
              className="btn btn-sm btn-danger"
              disabled={clearMutation.isPending}
              onClick={() => {
                if (confirm("Удалить ВСЕХ игроков, команды, пул замен и логи? Это действие необратимо.")) {
                  clearMutation.mutate();
                }
              }}
            >
              {clearMutation.isPending ? "..." : "Сбросить всё"}
            </button>
          )}
          </div>
        </div>
      </div>

      {/* Add form */}
      {canEdit && showAdd && (
        <div style={{
          background: "var(--bg-panel)",
          borderBottom: "1px solid var(--border)",
          padding: "12px 24px",
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "flex-end",
        }}>
          <div>
            <div className="lbl">Ник</div>
            <input style={{ ...inputStyle, width: 110 }} value={form.nick} onChange={e => setForm(f => ({ ...f, nick: e.target.value }))} />
          </div>
          <div>
            <div className="lbl">MMR</div>
            <input type="number" style={{ ...inputStyle, width: 80 }} value={form.mmr} onChange={e => setForm(f => ({ ...f, mmr: Number(e.target.value) }))} />
          </div>
          <div>
            <div className="lbl">Stake</div>
            <input type="number" step="0.01" style={{ ...inputStyle, width: 70 }} value={form.stake} onChange={e => setForm(f => ({ ...f, stake: Number(e.target.value) }))} />
          </div>
          <div>
            <div className="lbl">Роль</div>
            <select style={{ ...inputStyle, width: 55 }} value={form.mainRole} onChange={e => setForm(f => ({ ...f, mainRole: Number(e.target.value) as 1|2|3|4|5 }))}>
              {[1,2,3,4,5].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <div className="lbl">Flex</div>
            <select style={{ ...inputStyle, width: 55 }} value={form.flexRole} onChange={e => setForm(f => ({ ...f, flexRole: e.target.value !== "" ? Number(e.target.value) as 1|2|3|4|5 : "" }))}>
              <option value="">—</option>
              {[1,2,3,4,5].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <div className="lbl">Telegram ID</div>
            <input style={{ ...inputStyle, width: 110 }} value={form.telegramId} placeholder="@username" onChange={e => setForm(f => ({ ...f, telegramId: e.target.value }))} />
          </div>
          <div>
            <div className="lbl">Кошелёк</div>
            <input style={{ ...inputStyle, width: 100 }} value={form.wallet} onChange={e => setForm(f => ({ ...f, wallet: e.target.value }))} />
          </div>
          <div>
            <div className="lbl">Ночей</div>
            <input type="number" style={{ ...inputStyle, width: 55 }} value={form.nightMatches} onChange={e => setForm(f => ({ ...f, nightMatches: Number(e.target.value) }))} />
          </div>
          <button
            className="btn btn-sm btn-success"
            onClick={handleCreate}
            disabled={!form.nick || createMutation.isPending}
          >
            {createMutation.isPending ? "..." : "Создать"}
          </button>
          {createError && (
            <span style={{ color: "#f87171", fontSize: 11, maxWidth: 260, display: "block" }}>{createError}</span>
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
                  {(["НИК", "MMR", "STAKE", "РОЛЬ", "FLEX", "TELEGRAM", "КОШЕЛЁК", "НОЧИ", "СТАТУС", "ДОБАВЛЕН"] as const).map(h => {
                    const key = h === "НИК" ? "nick" : h === "MMR" ? "mmr" : h === "STAKE" ? "stake" : h === "СТАТУС" ? "isActiveInDatabase" : null;
                    const active = key && sortKey === key;
                    return (
                      <th key={h}
                        onClick={key ? () => toggleSort(key) : undefined}
                        style={key ? { cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" } : undefined}
                      >
                        {h}{active ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                      </th>
                    );
                  })}
                  {canEdit && <th>ДЕЙСТВИЯ</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} style={{ opacity: p.isActiveInDatabase ? 1 : 0.5 }}>
                    {editId === p.id ? (
                      <>
                        <td><input style={{ ...inputStyle, width: 110 }} value={editData.nick ?? ""} onChange={e => set("nick", e.target.value)} /></td>
                        <td><input type="number" style={{ ...inputStyle, width: 80 }} value={editData.mmr ?? 0} onChange={e => set("mmr", Number(e.target.value))} /></td>
                        <td><input type="number" step="0.01" style={{ ...inputStyle, width: 70 }} value={editData.stake ?? 0} onChange={e => set("stake", Number(e.target.value))} /></td>
                        <td>
                          <select style={{ ...inputStyle, width: 60 }} value={editData.mainRole ?? 1} onChange={e => set("mainRole", Number(e.target.value) as 1|2|3|4|5)}>
                            {[1,2,3,4,5].map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </td>
                        <td>
                          <select style={{ ...inputStyle, width: 60 }} value={editData.flexRole ?? ""} onChange={e => set("flexRole", e.target.value ? Number(e.target.value) as 1|2|3|4|5 : null as unknown as 1)}>
                            <option value="">—</option>
                            {[1,2,3,4,5].map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </td>
                        <td><input style={{ ...inputStyle, width: 100 }} value={editData.telegramId ?? ""} onChange={e => set("telegramId", e.target.value || null as unknown as string)} /></td>
                        <td><input style={{ ...inputStyle, width: 100 }} value={editData.wallet ?? ""} onChange={e => set("wallet", e.target.value || null as unknown as string)} /></td>
                        <td><input type="number" style={{ ...inputStyle, width: 60 }} value={editData.nightMatches ?? 0} onChange={e => set("nightMatches", Number(e.target.value))} /></td>
                        <td>
                          <select style={{ ...inputStyle, width: 80 }} value={editData.isActiveInDatabase ? "1" : "0"} onChange={e => set("isActiveInDatabase", e.target.value === "1")}>
                            <option value="1">Активен</option>
                            <option value="0">Неактивен</option>
                          </select>
                        </td>
                        <td style={{ color: "var(--text-muted)", fontSize: 11 }}>
                          {p.createdAt ? new Date(p.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" }) : "—"}
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 4 }}>
                            <button className="btn btn-sm btn-success" onClick={() => updateMutation.mutate({ id: p.id, data: editData })}>
                              Сохр.
                            </button>
                            <button className="btn btn-sm btn-ghost" onClick={() => setEditId(null)}>
                              Отм.
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ fontWeight: 600 }}>{p.nick}</td>
                        <td>{p.mmr.toLocaleString()}</td>
                        <td>{p.stake}</td>
                        <td><span style={{ color: "var(--accent)" }}>R{p.mainRole}</span></td>
                        <td style={{ color: "var(--text-secondary)" }}>{p.flexRole ? `R${p.flexRole}` : "—"}</td>
                        <td style={{ color: "var(--text-secondary)", fontSize: 12 }}>{p.telegramId ?? "—"}</td>
                        <td style={{ color: "var(--text-secondary)", fontSize: 12, fontFamily: "monospace" }}>{p.wallet ?? "—"}</td>
                        <td>{p.nightMatches}</td>
                        <td>
                          <span className={p.isActiveInDatabase ? "badge badge-green" : "badge badge-gray"}>
                            {p.isActiveInDatabase ? "Активен" : "Неактивен"}
                          </span>
                        </td>
                        <td style={{ color: "var(--text-secondary)", fontSize: 11, whiteSpace: "nowrap" }}>
                          {p.createdAt ? new Date(p.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" }) : "—"}
                        </td>
                        <td>
                          {canEdit && (
                            <div style={{ display: "flex", gap: 4 }}>
                              <button className="btn btn-sm btn-ghost" onClick={() => startEdit(p)}>
                                Изменить
                              </button>
                              <button
                                className="btn btn-sm btn-danger"
                                onClick={() => { if (confirm(`Удалить ${p.nick}?`)) deleteMutation.mutate(p.id); }}
                              >
                                Удал.
                              </button>
                            </div>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={10} style={{ textAlign: "center", color: "var(--text-muted)", padding: 32 }}>
                      {search ? "Игроки не найдены" : "Нет игроков"}
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
