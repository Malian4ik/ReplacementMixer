"use client";

import { useQuery } from "@tanstack/react-query";
import { formatMoscow } from "@/lib/date";
import type { MatchReplacementLog } from "@/types";

const ACTION_BADGE: Record<string, string> = {
  Assign:   "badge badge-green",
  Return:   "badge badge-yellow",
  AddToPool:"badge badge-blue",
};

const ACTION_LABEL: Record<string, string> = {
  Assign:   "Назначение",
  Return:   "Возврат",
  AddToPool:"В пул",
};

export default function LogsPage() {
  const { data: logs = [], isLoading } = useQuery<MatchReplacementLog[]>({
    queryKey: ["logs"],
    queryFn: () => fetch("/api/replacement-logs").then(r => r.json()),
    refetchInterval: 15000,
  });

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div className="page-header">
        <div className="page-title">Журнал замен</div>
        <div className="page-subtitle">{logs.length} записей · обновляется автоматически</div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "16px 24px" }}>
        {isLoading ? (
          <div style={{ color: "var(--text-secondary)", padding: 40, textAlign: "center" }}>Загрузка...</div>
        ) : (
          <div className="card" style={{ overflow: "hidden" }}>
            <table className="tbl">
              <thead>
                <tr>
                  {["ВРЕМЯ", "ДЕЙСТВИЕ", "MATCH ID", "КОМАНДА", "ЗАМЕНЁН", "ЗАМЕНА", "СУДЬЯ", "СТАТУС"].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map(l => (
                  <tr key={l.id}>
                    <td style={{ fontFamily: "monospace", fontSize: 11, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                      {formatMoscow(l.timestamp)}
                    </td>
                    <td>
                      <span className={ACTION_BADGE[l.actionType] ?? "badge badge-gray"}>
                        {ACTION_LABEL[l.actionType] ?? l.actionType}
                      </span>
                    </td>
                    <td style={{ color: "var(--text-secondary)", fontSize: 12 }}>{l.matchId ?? "—"}</td>
                    <td style={{ fontWeight: l.teamName ? 500 : undefined }}>{l.teamName ?? "—"}</td>
                    <td>
                      {l.replacedPlayerNick ? (
                        <span>
                          <span style={{ fontWeight: 500 }}>{l.replacedPlayerNick}</span>
                          <span style={{ color: "var(--text-secondary)", fontSize: 11 }}> ({l.replacedPlayerMmr})</span>
                        </span>
                      ) : "—"}
                    </td>
                    <td>
                      {l.replacementPlayerNick ? (
                        <span>
                          <span style={{ fontWeight: 500, color: "#34d399" }}>{l.replacementPlayerNick}</span>
                          <span style={{ color: "var(--text-secondary)", fontSize: 11 }}> ({l.replacementPlayerMmr})</span>
                        </span>
                      ) : "—"}
                    </td>
                    <td style={{ color: "var(--text-secondary)", fontSize: 12 }}>{l.judgeName ?? "—"}</td>
                    <td>
                      <span style={{
                        fontSize: 11, fontWeight: 600,
                        color: l.resultStatus === "Assigned" ? "#34d399" : l.resultStatus === "Returned" ? "#fbbf24" : "#60a5fa",
                      }}>
                        {l.resultStatus}
                      </span>
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", color: "var(--text-muted)", padding: 40 }}>
                      Журнал пуст
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
