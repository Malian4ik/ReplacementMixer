"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Player } from "@/types";
import { useUser } from "@/components/UserContext";

const ROLE_LABEL: Record<number, string> = { 1: "Carry", 2: "Mid", 3: "Off", 4: "Sup", 5: "HSup" };
const ROLE_COLOR: Record<number, string> = {
  1: "#f87171", 2: "#60a5fa", 3: "#a78bfa", 4: "#34d399", 5: "#fbbf24",
};
const MEDAL_COLOR = ["#fbbf24", "#9ca3af", "#cd7c2c"];
const MEDAL_LABEL = ["🥇", "🥈", "🥉"];

function nightColor(n: number) {
  return n >= 5 ? "#e879f9" : n >= 4 ? "#f87171" : n >= 3 ? "#fbbf24" : n >= 2 ? "#60a5fa" : "#34d399";
}

function MmrBadge({ mmr }: { mmr: number }) {
  const color =
    mmr >= 12000 ? "#e879f9" : mmr >= 9000 ? "#f87171" : mmr >= 6000 ? "#fbbf24"
    : mmr >= 3000 ? "#34d399" : "#60a5fa";
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 4, background: `${color}18`, border: `1px solid ${color}40`, color }}>
      {mmr.toLocaleString("ru")}
    </span>
  );
}

function NightBar({ count, max }: { count: number; max: number }) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  const color = nightColor(count);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 120 }}>
      <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.3s" }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 800, color, minWidth: 14, textAlign: "right" }}>{count}</span>
    </div>
  );
}

function PlayerRow({
  p, globalRank, maxNight, canEdit, onMinus, onPlus, isPending,
}: {
  p: Player & { isDisqualified?: boolean };
  globalRank: number;
  maxNight: number;
  canEdit: boolean;
  onMinus: () => void;
  onPlus: () => void;
  isPending: boolean;
}) {
  return (
    <tr key={p.id}>
      <td style={{ fontWeight: 700, fontSize: 12 }}>
        {globalRank < 3
          ? <span style={{ color: MEDAL_COLOR[globalRank] }}>{MEDAL_LABEL[globalRank]}</span>
          : <span style={{ color: "var(--text-secondary)" }}>{globalRank + 1}</span>}
      </td>
      <td>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontWeight: 600 }}>{p.nick}</span>
            {p.inTeam && (
              <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "rgba(0,212,232,0.12)", color: "var(--accent)", border: "1px solid rgba(0,212,232,0.25)", fontWeight: 700 }}>
                В КОМАНДЕ
              </span>
            )}
          </div>
          {p.wallet && (
            <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace" }}>
              {p.wallet}
            </span>
          )}
        </div>
      </td>
      <td><MmrBadge mmr={p.mmr} /></td>
      <td>
        <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 4, background: `${ROLE_COLOR[p.mainRole]}15`, border: `1px solid ${ROLE_COLOR[p.mainRole]}35`, color: ROLE_COLOR[p.mainRole] }}>
          {p.mainRole} · {ROLE_LABEL[p.mainRole]}
        </span>
      </td>
      <td style={{ color: "var(--text-secondary)", fontSize: 12 }}>
        {p.flexRole
          ? <span style={{ color: ROLE_COLOR[p.flexRole] }}>{p.flexRole} · {ROLE_LABEL[p.flexRole]}</span>
          : "—"}
      </td>
      <td style={{ fontFamily: "monospace", fontSize: 12 }}>
        {p.stake > 0
          ? <span style={{ color: "#fbbf24" }}>${p.stake.toLocaleString("ru")}</span>
          : <span style={{ color: "var(--text-muted)" }}>—</span>}
      </td>
      <td style={{ fontSize: 12 }}>
        {p.telegramId
          ? <span style={{ color: "#60a5fa" }}>@{p.telegramId.replace(/^@/, "")}</span>
          : <span style={{ color: "var(--text-muted)" }}>—</span>}
      </td>
      <td>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {canEdit && (
            <button onClick={onMinus} disabled={p.nightMatches <= 0 || isPending}
              style={{ width: 20, height: 20, borderRadius: 3, border: "1px solid var(--border)", background: "var(--bg-panel)", color: "var(--text-secondary)", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              −
            </button>
          )}
          {p.nightMatches > 0
            ? <NightBar count={p.nightMatches} max={maxNight} />
            : <span style={{ fontSize: 12, color: "var(--text-muted)", minWidth: 120 }}>0</span>}
          {canEdit && (
            <button onClick={onPlus} disabled={isPending}
              style={{ width: 20, height: 20, borderRadius: 3, border: "1px solid var(--border)", background: "var(--bg-panel)", color: "var(--text-secondary)", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              +
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

const TABLE_HEAD = (
  <thead>
    <tr>
      <th style={{ width: 40 }}>#</th>
      <th>НИК / КОШЕЛЁК</th>
      <th>MMR</th>
      <th>РОЛЬ</th>
      <th>ФЛЕКС</th>
      <th>СТАВКА</th>
      <th>TELEGRAM</th>
      <th style={{ minWidth: 160 }}>НОЧНЫХ МАТЧЕЙ</th>
    </tr>
  </thead>
);

export default function NightTopPage() {
  const { user } = useUser();
  const qc = useQueryClient();
  const canEdit = user?.role === "OWNER" || user?.role === "JUDGE";
  const [search, setSearch] = useState("");

  const { data: players = [], isLoading } = useQuery<Player[]>({
    queryKey: ["players"],
    queryFn: () => fetch("/api/players").then(r => r.json()),
    refetchInterval: 30000,
  });

  const nightMutation = useMutation({
    mutationFn: ({ playerId, nightMatches }: { playerId: string; nightMatches: number }) =>
      fetch(`/api/players/${playerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nightMatches }),
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["players"] }),
  });

  const ranked = players
    .filter(p => p.isActiveInDatabase)
    .sort((a, b) => b.nightMatches - a.nightMatches || b.mmr - a.mmr);

  const maxNight = ranked[0]?.nightMatches ?? 1;
  const total = ranked.reduce((s, p) => s + p.nightMatches, 0);
  const withNight = ranked.filter(p => p.nightMatches > 0);
  const withoutNight = ranked.filter(p => p.nightMatches === 0);

  // Dynamic chips — all unique values
  const uniqueVals = [...new Set(withNight.map(p => p.nightMatches))].sort((a, b) => b - a);

  // Search filter
  const q = search.trim().toLowerCase();
  const filtered = q
    ? ranked.filter(p =>
        p.nick.toLowerCase().includes(q) ||
        (p.wallet ?? "").toLowerCase().includes(q)
      )
    : null; // null = no search active, show grouped view

  // Buckets for grouped view
  const bucketValues = uniqueVals.filter(n => ranked.some(p => p.nightMatches === n));
  const buckets = bucketValues.map(n => ({ n, players: ranked.filter(p => p.nightMatches === n) }));

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div className="page-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div className="page-title">🌙 Топ ночники</div>
          <div className="page-subtitle">
            {withNight.length} с ночными · {total} матчей · {withoutNight.length} без ночных
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {/* Dynamic chips */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {uniqueVals.map(n => {
              const count = ranked.filter(p => p.nightMatches === n).length;
              const color = nightColor(n);
              return (
                <div key={n} style={{ background: `${color}12`, border: `1px solid ${color}35`, borderRadius: 8, padding: "6px 14px", display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color }}>{count}</span>
                  <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>× {n} матч{n === 1 ? "" : n < 5 ? "а" : "ей"}</span>
                </div>
              );
            })}
          </div>

          {/* Search */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по нику или кошельку..."
            style={{
              background: "var(--bg-panel)", border: "1px solid var(--border)",
              borderRadius: 6, padding: "7px 12px", fontSize: 12,
              color: "var(--text-primary)", outline: "none", width: 220,
            }}
          />
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: "16px 24px" }}>
        {isLoading ? (
          <div style={{ color: "var(--text-secondary)", padding: 60, textAlign: "center" }}>Загрузка...</div>
        ) : filtered !== null ? (
          /* Search results */
          <div className="card" style={{ overflow: "hidden" }}>
            <div style={{ padding: "8px 16px", borderBottom: "1px solid var(--border)", fontSize: 11, color: "var(--text-secondary)" }}>
              Найдено: {filtered.length}
            </div>
            <table className="tbl">
              {TABLE_HEAD}
              <tbody>
                {filtered.map(p => (
                  <PlayerRow key={p.id} p={p} globalRank={ranked.indexOf(p)} maxNight={maxNight} canEdit={canEdit}
                    onMinus={() => nightMutation.mutate({ playerId: p.id, nightMatches: Math.max(0, p.nightMatches - 1) })}
                    onPlus={() => nightMutation.mutate({ playerId: p.id, nightMatches: p.nightMatches + 1 })}
                    isPending={nightMutation.isPending} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* Grouped view */
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {buckets.map(({ n, players: group }) => {
              const color = nightColor(n);
              return (
                <div key={n}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}15`, border: `1px solid ${color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900, color }}>
                      {n}
                    </div>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 700, color }}>
                        {n} ночн{n === 1 ? "ой матч" : n < 5 ? "ых матча" : "ых матчей"}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text-secondary)", marginLeft: 8 }}>
                        {group.length} игр{group.length === 1 ? "ок" : "оков"}
                      </span>
                    </div>
                    <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${color}30, transparent)`, marginLeft: 4 }} />
                  </div>
                  <div className="card" style={{ overflow: "hidden" }}>
                    <table className="tbl">
                      {TABLE_HEAD}
                      <tbody>
                        {group.map(p => (
                          <PlayerRow key={p.id} p={p} globalRank={ranked.indexOf(p)} maxNight={maxNight} canEdit={canEdit}
                            onMinus={() => nightMutation.mutate({ playerId: p.id, nightMatches: Math.max(0, p.nightMatches - 1) })}
                            onPlus={() => nightMutation.mutate({ playerId: p.id, nightMatches: p.nightMatches + 1 })}
                            isPending={nightMutation.isPending} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}

            {/* Players with 0 night matches */}
            {withoutNight.length > 0 && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(156,163,175,0.1)", border: "1px solid rgba(156,163,175,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900, color: "#6b7280" }}>
                    0
                  </div>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#6b7280" }}>Без ночных матчей</span>
                    <span style={{ fontSize: 11, color: "var(--text-secondary)", marginLeft: 8 }}>{withoutNight.length} игроков</span>
                  </div>
                  <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, rgba(107,114,128,0.2), transparent)", marginLeft: 4 }} />
                </div>
                <div className="card" style={{ overflow: "hidden" }}>
                  <table className="tbl">
                    {TABLE_HEAD}
                    <tbody>
                      {withoutNight.map(p => (
                        <PlayerRow key={p.id} p={p} globalRank={ranked.indexOf(p)} maxNight={maxNight} canEdit={canEdit}
                          onMinus={() => nightMutation.mutate({ playerId: p.id, nightMatches: Math.max(0, p.nightMatches - 1) })}
                          onPlus={() => nightMutation.mutate({ playerId: p.id, nightMatches: p.nightMatches + 1 })}
                          isPending={nightMutation.isPending} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
