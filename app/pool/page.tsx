"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatMoscow } from "@/lib/date";
import type { ReplacementPoolEntry } from "@/types";

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
  const [statusFilter, setStatusFilter] = useState<string>("");

  const { data: entries = [], isLoading } = useQuery<ReplacementPoolEntry[]>({
    queryKey: ["pool", statusFilter],
    queryFn: () => {
      const sp = statusFilter ? `?status=${statusFilter}` : "";
      return fetch(`/api/replacement-pool${sp}`).then(r => r.json());
    },
  });

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

  const counts = entries.reduce((acc, e) => {
    acc[e.status] = (acc[e.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

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

      {/* Table */}
      <div style={{ flex: 1, overflow: "auto", padding: "16px 24px" }}>
        {isLoading ? (
          <div style={{ color: "var(--text-secondary)", padding: 40, textAlign: "center" }}>Загрузка...</div>
        ) : (
          <div className="card" style={{ overflow: "hidden" }}>
            <table className="tbl">
              <thead>
                <tr>
                  {["НИК", "MMR", "STAKE", "РОЛЬ", "СТАТУС", "ИСТОЧНИК", "ДОБАВЛЕН В ПУЛ", "ДЕЙСТВИЯ"].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id}>
                    <td style={{ fontWeight: 600 }}>{e.player.nick}</td>
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
                      </div>
                    </td>
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
