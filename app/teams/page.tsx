"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Team, Player } from "@/types";
import { useUser } from "@/components/UserContext";
import { ConfirmModal } from "@/components/ConfirmModal";

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

const EMPTY_TEAM = {
  name: "",
  player1Id: "", player2Id: "", player3Id: "", player4Id: "", player5Id: "",
};

const SLOTS = ["player1Id", "player2Id", "player3Id", "player4Id", "player5Id"] as const;
type SlotKey = typeof SLOTS[number];

// ── Searchable player picker for one slot ──────────────────────────────────
function PlayerPicker({
  value,
  allPlayers,
  onChange,
  onClear,
  excludeIds = [],
}: {
  value: string;
  allPlayers: Player[];
  onChange: (id: string) => void;
  onClear: () => void;
  excludeIds?: string[];
}) {
  const current = allPlayers.find(p => p.id === value);
  const [search, setSearch] = useState(current?.nick ?? "");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Sync label when value changes externally (including clear → "")
  useEffect(() => {
    if (!value) {
      setSearch("");
    } else {
      const p = allPlayers.find(p => p.id === value);
      if (p) setSearch(p.nick);
    }
  }, [value, allPlayers]);

  // Close dropdown on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        // Restore nick or clear if empty
        if (!value) {
          setSearch("");
        } else {
          const p = allPlayers.find(p => p.id === value);
          if (p) setSearch(p.nick);
        }
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [value, allPlayers]);

  const available = allPlayers.filter(p => !excludeIds.includes(p.id));
  const filtered = search.trim()
    ? available.filter(p =>
        p.nick.toLowerCase().includes(search.toLowerCase())
      ).slice(0, 10)
    : available.slice(0, 10);

  function select(p: Player) {
    onChange(p.id);
    setSearch(p.nick);
    setOpen(false);
  }

  const isEmpty = !value;

  return (
    <div ref={ref} style={{ position: "relative", display: "flex", gap: 4, flex: 1 }}>
      <input
        style={{
          ...inputStyle,
          borderColor: isEmpty ? "rgba(248,113,113,0.5)" : "var(--border-light)",
        }}
        value={search}
        placeholder="— не выбран —"
        onFocus={() => setOpen(true)}
        onChange={e => {
          setSearch(e.target.value);
          setOpen(true);
        }}
      />
      {/* Clear button */}
      {!isEmpty && (
        <button
          onMouseDown={e => { e.preventDefault(); onClear(); }}
          style={{
            background: "rgba(248,113,113,0.15)",
            border: "1px solid rgba(248,113,113,0.3)",
            color: "#f87171",
            borderRadius: 4,
            padding: "2px 7px",
            fontSize: 13,
            cursor: "pointer",
            lineHeight: 1,
            flexShrink: 0,
          }}
          title="Убрать игрока"
        >
          ×
        </button>
      )}
      {open && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 2px)",
          left: 0,
          right: 0,
          background: "var(--bg-panel)",
          border: "1px solid var(--border-light)",
          borderRadius: 4,
          zIndex: 50,
          maxHeight: 220,
          overflowY: "auto",
          boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "8px 10px", fontSize: 12, color: "var(--text-muted)" }}>
              Не найдено
            </div>
          ) : (
            filtered.map(p => (
              <div
                key={p.id}
                onMouseDown={() => select(p)}
                style={{
                  padding: "6px 10px",
                  fontSize: 12,
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: p.id === value ? "rgba(240,165,0,0.15)" : "transparent",
                  borderLeft: p.id === value ? "2px solid var(--accent)" : "2px solid transparent",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.07)")}
                onMouseLeave={e => (e.currentTarget.style.background = p.id === value ? "rgba(240,165,0,0.15)" : "transparent")}
              >
                <span style={{ fontWeight: p.id === value ? 700 : 400 }}>{p.nick}</span>
                <span style={{ color: "var(--text-secondary)", fontFamily: "monospace", fontSize: 11 }}>
                  {p.mmr.toLocaleString()} · R{p.mainRole}{p.flexRole ? `/R${p.flexRole}` : ""}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function TeamsPage() {
  const qc = useQueryClient();
  const { user } = useUser();
  const canEdit = user?.role === "OWNER" || user?.role === "JUDGE";
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState<typeof EMPTY_TEAM | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_TEAM });
  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const { data: teams = [], isLoading } = useQuery<Team[]>({
    queryKey: ["teams"],
    queryFn: () => fetch("/api/teams").then(r => r.json()),
  });

  const { data: stats } = useQuery<{ targetAvgMmr: number }>({
    queryKey: ["stats"],
    queryFn: () => fetch("/api/stats").then(r => r.json()),
  });

  const { data: allPlayers = [] } = useQuery<Player[]>({
    queryKey: ["players"],
    queryFn: () => fetch("/api/players").then(r => r.json()),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) =>
      fetch(`/api/teams/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teams"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      setEditId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/teams/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teams"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["pool"] });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: object) => {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Ошибка сервера");
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teams"] });
      setShowAdd(false);
      setForm({ ...EMPTY_TEAM });
      setCreateError(null);
    },
    onError: (e: Error) => setCreateError(e.message),
  });

  const targetAvgMmr = stats?.targetAvgMmr ?? 0;
  const avgOfTeams = teams.length
    ? Math.round(teams.reduce((s, t) => s + t.avgMmr, 0) / teams.length)
    : 0;

  const mmrValues = teams.map(t => t.avgMmr);
  const minMmr = mmrValues.length ? Math.min(...mmrValues) : 0;
  const maxMmr = mmrValues.length ? Math.max(...mmrValues) : 0;

  function mmrGradientColor(mmr: number): string {
    if (maxMmr === minMmr) return "#fbbf24";
    const ratio = (mmr - minMmr) / (maxMmr - minMmr);
    if (ratio >= 0.5) {
      const t = (ratio - 0.5) * 2;
      const r = Math.round(251 + (52 - 251) * t);
      const g = Math.round(191 + (211 - 191) * t);
      const b = Math.round(36 + (153 - 36) * t);
      return `rgb(${r},${g},${b})`;
    } else {
      const t = ratio * 2;
      const r = Math.round(248 + (251 - 248) * t);
      const g = Math.round(113 + (191 - 113) * t);
      const b = Math.round(113 + (36 - 113) * t);
      return `rgb(${r},${g},${b})`;
    }
  }

  function startEdit(t: Team) {
    setEditId(t.id);
    setEditData({
      name: t.name,
      player1Id: t.player1Id ?? "",
      player2Id: t.player2Id ?? "",
      player3Id: t.player3Id ?? "",
      player4Id: t.player4Id ?? "",
      player5Id: t.player5Id ?? "",
    });
  }

  const sortedPlayers = allPlayers.slice().sort((a, b) => a.nick.localeCompare(b.nick));

  function editAllFilled(d: typeof EMPTY_TEAM) {
    return SLOTS.every(s => d[s] !== "");
  }

  function formAllFilled(f: typeof EMPTY_TEAM) {
    return f.name.trim() !== "";
  }

  // Count filled slots for edit progress indicator
  const editFilledCount = editData ? SLOTS.filter(s => editData[s] !== "").length : 0;

  return (
    <>
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div className="page-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div className="page-title">Команды</div>
          <div className="page-subtitle">{teams.length} команд · Avg MMR всех: {avgOfTeams.toLocaleString()}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {teams.length > 0 && (
            <>
              <div style={{ padding: "6px 14px", background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.25)", borderRadius: 6, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Min MMR</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: "#34d399" }}>{Math.round(minMmr).toLocaleString()}</span>
              </div>
              <div style={{ padding: "6px 14px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 6, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Max MMR</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: "#f87171" }}>{Math.round(maxMmr).toLocaleString()}</span>
              </div>
            </>
          )}
          {targetAvgMmr > 0 && (
            <div style={{
              padding: "6px 16px",
              background: "rgba(240,165,0,0.1)",
              border: "1px solid rgba(240,165,0,0.3)",
              borderRadius: 6,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}>
              <span style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Target MMR</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: "var(--accent)" }}>{targetAvgMmr.toLocaleString()}</span>
            </div>
          )}
          {canEdit && (
            <button
              className="btn btn-sm btn-success"
              onClick={() => { setShowAdd(v => !v); setCreateError(null); }}
            >
              {showAdd ? "Отмена" : "+ Создать команду"}
            </button>
          )}
        </div>
      </div>

      {/* Create form */}
      {canEdit && showAdd && (
        <div style={{
          background: "var(--bg-panel)",
          borderBottom: "1px solid var(--border)",
          padding: "14px 24px",
        }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 10 }}>
            <div>
              <div className="lbl">Название команды</div>
              <input
                style={{ ...inputStyle, width: 150 }}
                placeholder="Команда X"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div style={{ marginLeft: "auto", color: "var(--text-muted)", fontSize: 11 }}>
              {SLOTS.filter(s => form[s] !== "").length} / 5 игроков выбраны
            </div>
          </div>
          <div className="teams-create-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 10 }}>
            {SLOTS.map((slot, i) => (
              <div key={slot}>
                <div className="lbl">Игрок {i + 1}</div>
                <PlayerPicker
                  value={form[slot]}
                  allPlayers={sortedPlayers}
                  excludeIds={SLOTS.filter(s => s !== slot).map(s => form[s]).filter(Boolean)}
                  onChange={id => setForm(f => ({ ...f, [slot]: id }))}
                  onClear={() => setForm(f => ({ ...f, [slot]: "" }))}
                />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              className="btn btn-sm btn-success"
              onClick={() => {
              setCreateError(null);
              const payload = {
                name: form.name,
                ...Object.fromEntries(SLOTS.map(s => [s, form[s] || null])),
              };
              createMutation.mutate(payload);
            }}
              disabled={!formAllFilled(form) || createMutation.isPending}
            >
              {createMutation.isPending ? "..." : "Создать"}
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => setForm({ ...EMPTY_TEAM })}>
              Очистить всё
            </button>
            {createError && (
              <span style={{ color: "#f87171", fontSize: 11 }}>{createError}</span>
            )}
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflow: "auto", padding: "16px 24px" }}>
        {isLoading ? (
          <div style={{ color: "var(--text-secondary)", padding: 40, textAlign: "center" }}>Загрузка...</div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))",
            gap: 12,
          }}>
            {teams.map(t => {
              const isEditing = editId === t.id;
              return (
                <div key={t.id} className="card" style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    {isEditing && editData ? (
                      <input
                        style={{ ...inputStyle, width: 120 }}
                        value={editData.name}
                        onChange={e => setEditData(d => d ? { ...d, name: e.target.value } : d)}
                      />
                    ) : (
                      <a
                        href={`/teams/${t.id}`}
                        style={{ fontWeight: 700, fontSize: 14, color: "inherit", textDecoration: "none" }}
                        onMouseEnter={e => (e.currentTarget.style.color = "var(--accent)")}
                        onMouseLeave={e => (e.currentTarget.style.color = "inherit")}
                      >
                        {t.name}
                      </a>
                    )}
                    <span style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: mmrGradientColor(t.avgMmr),
                      padding: "2px 8px",
                      background: "rgba(255,255,255,0.05)",
                      borderRadius: 4,
                    }}>
                      {t.avgMmr.toLocaleString()} MMR
                    </span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {isEditing && editData ? (
                      <>
                        {SLOTS.map((slot, i) => (
                          <div key={slot} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ color: "var(--text-muted)", fontSize: 10, minWidth: 14 }}>{i + 1}</span>
                            <PlayerPicker
                              value={editData[slot]}
                              allPlayers={sortedPlayers}
                              excludeIds={SLOTS.filter(s => s !== slot).map(s => editData[s]).filter(Boolean)}
                              onChange={id => setEditData(d => d ? { ...d, [slot]: id } : d)}
                              onClear={() => setEditData(d => d ? { ...d, [slot]: "" } : d)}
                            />
                          </div>
                        ))}
                        {editFilledCount < 5 && (
                          <div style={{
                            fontSize: 11,
                            color: "#fbbf24",
                            marginTop: 2,
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}>
                            <span>Выбрано {editFilledCount} из 5 игроков</span>
                            <button
                              className="btn btn-sm btn-ghost"
                              style={{ fontSize: 10, padding: "1px 6px" }}
                              onClick={() => setEditData(d => d ? {
                                ...d,
                                player1Id: "", player2Id: "", player3Id: "", player4Id: "", player5Id: ""
                              } : d)}
                            >
                              Очистить всё
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      (t.players ?? []).map((p, i) => p && (
                        <div key={p.id} style={{
                          display: "flex",
                          flexDirection: "column",
                          padding: "5px 8px",
                          borderRadius: 4,
                          background: "rgba(0,0,0,0.2)",
                          fontSize: 12,
                          gap: 2,
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ color: "var(--text-muted)", fontSize: 10, minWidth: 12 }}>{i + 1}</span>
                              <span style={{ fontWeight: 500 }}>{p.nick}</span>
                            </span>
                            <span style={{ color: "var(--text-secondary)", fontFamily: "monospace", fontSize: 11 }}>
                              {p.mmr.toLocaleString()} · R{p.mainRole}
                              {p.flexRole ? <span style={{ opacity: 0.6 }}>/R{p.flexRole}</span> : null}
                            </span>
                          </div>
                          {p.wallet && (
                            <div style={{
                              fontSize: 10,
                              fontFamily: "monospace",
                              color: "var(--text-muted)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              paddingLeft: 18,
                            }} title={p.wallet}>
                              {p.wallet}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  {canEdit && (
                    <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
                      {isEditing && editData ? (
                        <>
                          <button
                            className="btn btn-sm btn-success"
                            style={{ flex: 1 }}
                            onClick={() => updateMutation.mutate({ id: t.id, data: editData })}
                            disabled={!editAllFilled(editData) || updateMutation.isPending}
                            title={!editAllFilled(editData) ? "Заполните все 5 слотов" : ""}
                          >
                            Сохранить {!editAllFilled(editData) ? `(${editFilledCount}/5)` : ""}
                          </button>
                          <button className="btn btn-sm btn-ghost" onClick={() => setEditId(null)}>
                            Отмена
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="btn btn-sm btn-ghost"
                            style={{ flex: 1 }}
                            onClick={() => startEdit(t)}
                          >
                            Изменить
                          </button>
                          <button
                            className="btn btn-sm btn-danger"
                            disabled={deleteMutation.isPending}
                            onClick={() => {
                              setConfirmState({ message: `Удалить команду "${t.name}"?`, onConfirm: () => { deleteMutation.mutate(t.id); setConfirmState(null); } });
                            }}
                          >
                            Удалить
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {teams.length === 0 && !isLoading && (
              <div style={{
                gridColumn: "1 / -1",
                textAlign: "center",
                color: "var(--text-muted)",
                padding: 40,
              }}>
                Нет команд. Нажмите «+ Создать команду».
              </div>
            )}
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
