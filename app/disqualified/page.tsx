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

  const { data: players = [], isLoading } = useQuery<DisqualifiedPlayer[]>({
    queryKey: ["players-disqualified"],
    queryFn: () => fetch("/api/players?disqualified=true").then(r => r.json()),
    enabled: canEdit,
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
      <div className="page-header">
        <div>
          <div className="page-title">Дисквалифицированные</div>
          <div className="page-subtitle">Удалённые с платформы · {players.length} чел. · не сбрасываются при очистке турнира</div>
        </div>
      </div>

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
