"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatMoscow } from "@/lib/date";
import type { MatchReplacementLog } from "@/types";
import { useUser } from "@/components/UserContext";

const ACTION_BADGE: Record<string, string> = {
  Assign:    "badge badge-green",
  Return:    "badge badge-yellow",
  AddToPool: "badge badge-blue",
};

const ACTION_LABEL: Record<string, string> = {
  Assign:    "Назначение",
  Return:    "Возврат",
  AddToPool: "В пул",
};

type TgUpdate = { chatId: string; name: string; text: string };

export default function LogsPage() {
  const qc = useQueryClient();
  const { user } = useUser();
  const isOwner = user?.role === "OWNER";
  const [showTgSetup, setShowTgSetup] = useState(false);
  const [tgUpdates, setTgUpdates] = useState<TgUpdate[]>([]);
  const [tgSetupLoading, setTgSetupLoading] = useState(false);
  const [tgSetupError, setTgSetupError] = useState<string | null>(null);
  const [sendStatus, setSendStatus] = useState<string | null>(null);

  const { data: logs = [], isLoading } = useQuery<MatchReplacementLog[]>({
    queryKey: ["logs"],
    queryFn: () => fetch("/api/replacement-logs").then(r => r.json()),
    refetchInterval: 15000,
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/replacement-logs", { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Ошибка");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["logs"] }),
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/telegram/send", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Ошибка");
      return json;
    },
    onSuccess: () => setSendStatus("✓ Отправлено в Telegram"),
    onError: (e: Error) => setSendStatus(`✗ ${e.message}`),
  });

  async function loadTgSetup() {
    setTgSetupLoading(true);
    setTgSetupError(null);
    try {
      const res = await fetch("/api/telegram/setup");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTgUpdates(data.updates ?? []);
      setShowTgSetup(true);
    } catch (e: unknown) {
      setTgSetupError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setTgSetupLoading(false);
    }
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div className="page-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div className="page-title">Журнал замен</div>
          <div className="page-subtitle">{logs.length} записей · обновляется автоматически</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* Telegram send — OWNER only */}
          {isOwner && (
            <button
              className="btn btn-sm btn-ghost"
              style={{ borderColor: "rgba(96,165,250,0.4)", color: "#60a5fa" }}
              onClick={() => { setSendStatus(null); sendMutation.mutate(); }}
              disabled={sendMutation.isPending}
            >
              {sendMutation.isPending ? "Отправка..." : "📤 Отправить в Telegram"}
            </button>
          )}
          {/* Setup — OWNER only */}
          {isOwner && (
            <button
              className="btn btn-sm btn-ghost"
              style={{ fontSize: 11 }}
              onClick={loadTgSetup}
              disabled={tgSetupLoading}
            >
              {tgSetupLoading ? "..." : "⚙ Настроить бот"}
            </button>
          )}
          {/* Clear logs — OWNER only */}
          {isOwner && (
            <button
              className="btn btn-sm btn-danger"
              onClick={() => {
                if (confirm(`Удалить все ${logs.length} записей журнала? Это действие нельзя отменить.`))
                  clearMutation.mutate();
              }}
              disabled={clearMutation.isPending || logs.length === 0}
            >
              🗑 Очистить журнал
            </button>
          )}
        </div>
      </div>

      {/* Send status */}
      {sendStatus && (
        <div style={{
          padding: "8px 24px",
          background: sendStatus.startsWith("✓") ? "rgba(52,211,153,0.1)" : "rgba(248,113,113,0.1)",
          borderBottom: "1px solid var(--border)",
          fontSize: 12,
          color: sendStatus.startsWith("✓") ? "#34d399" : "#f87171",
          display: "flex",
          justifyContent: "space-between",
        }}>
          <span>{sendStatus}</span>
          <button style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", opacity: 0.6 }} onClick={() => setSendStatus(null)}>✕</button>
        </div>
      )}

      {/* Telegram setup panel */}
      {isOwner && showTgSetup && (
        <div style={{
          background: "var(--bg-panel)",
          borderBottom: "1px solid var(--border)",
          padding: "14px 24px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>⚙ Настройка Telegram бота</span>
            <button className="btn btn-sm btn-ghost" onClick={() => setShowTgSetup(false)}>✕ Закрыть</button>
          </div>

          {tgSetupError ? (
            <div style={{ color: "#f87171", fontSize: 12 }}>{tgSetupError}</div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 10, lineHeight: 1.6 }}>
                <b style={{ color: "var(--text-primary)" }}>Шаг 1:</b> Напиши боту <code style={{ background: "rgba(0,0,0,0.3)", padding: "1px 5px", borderRadius: 3 }}>@MixerCup_bot</code> любое сообщение в Telegram<br />
                <b style={{ color: "var(--text-primary)" }}>Шаг 2:</b> Найди свой Chat ID ниже<br />
                <b style={{ color: "var(--text-primary)" }}>Шаг 3:</b> Добавь в Vercel → Settings → Environment Variables:<br />
                &nbsp;&nbsp;<code style={{ background: "rgba(0,0,0,0.3)", padding: "1px 5px", borderRadius: 3 }}>TELEGRAM_BOT_TOKEN</code> = <code style={{ background: "rgba(0,0,0,0.3)", padding: "1px 5px", borderRadius: 3 }}>8213706792:AAHbzu5bM0mJyIMRacnyOInQSk_PntOQ1V4</code><br />
                &nbsp;&nbsp;<code style={{ background: "rgba(0,0,0,0.3)", padding: "1px 5px", borderRadius: 3 }}>TELEGRAM_CHAT_ID</code> = твой Chat ID ниже<br />
                <b style={{ color: "var(--text-primary)" }}>Шаг 4:</b> Redeploy на Vercel
              </div>

              {tgUpdates.length === 0 ? (
                <div style={{ fontSize: 12, color: "#fbbf24" }}>
                  Нет сообщений от бота. Сначала напиши боту в Telegram, потом нажми «⚙ Настроить бот» снова.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 2 }}>Последние чаты с ботом:</div>
                  {tgUpdates.map(u => (
                    <div key={u.chatId} style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      background: "rgba(0,0,0,0.3)",
                      borderRadius: 4,
                      padding: "8px 12px",
                      fontSize: 12,
                    }}>
                      <span style={{ fontWeight: 600 }}>{u.name}</span>
                      <span style={{ color: "var(--text-secondary)" }}>последнее: «{u.text.slice(0, 30)}»</span>
                      <span style={{ marginLeft: "auto", fontFamily: "monospace", background: "rgba(240,165,0,0.15)", color: "var(--accent)", padding: "2px 8px", borderRadius: 4 }}>
                        Chat ID: {u.chatId}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
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
