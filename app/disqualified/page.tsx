"use client";

import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/components/UserContext";

type DisqualifiedPlayer = {
  id: string;
  nick: string;
  mmr: number;
  stake: number;
  wallet: string | null;
  telegramId: string | null;
  mainRole: number;
  flexRole: number | null;
  nightMatches: number;
};

const roleNames: Record<number, string> = { 1: "Carry", 2: "Mid", 3: "Offlane", 4: "Soft Sup", 5: "Hard Sup" };

export default function DisqualifiedPage() {
  const { user } = useUser();
  const canView = user?.role === "OWNER" || user?.role === "JUDGE";

  const { data: players = [], isLoading } = useQuery<DisqualifiedPlayer[]>({
    queryKey: ["players-disqualified"],
    queryFn: () => fetch("/api/players?disqualified=true").then(r => r.json()),
    enabled: canView,
  });

  if (!canView) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 40 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>Нет доступа</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Доступно только для JUDGE и OWNER</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      <div className="page-header">
        <div>
          <div className="page-title">Дисквалифицированные</div>
          <div className="page-subtitle">Игроки, удалённые с платформы · {players.length} чел.</div>
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
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["#", "НИК", "MMR", "РОЛЬ", "ФЛЕКС", "СТАВКА", "КОШЕЛЁК", "TELEGRAM"].map(h => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-secondary)", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {players.map((p, i) => (
                  <tr key={p.id} style={{ borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "rgba(239,68,68,0.03)" : "transparent" }}>
                    <td style={{ padding: "10px 12px", color: "var(--text-muted)", fontSize: 11 }}>{i + 1}</td>
                    <td style={{ padding: "10px 12px", fontWeight: 700, color: "#f87171" }}>{p.nick}</td>
                    <td style={{ padding: "10px 12px", fontFamily: "monospace" }}>{p.mmr.toLocaleString()}</td>
                    <td style={{ padding: "10px 12px", color: "var(--text-secondary)" }}>{roleNames[p.mainRole] ?? `R${p.mainRole}`}</td>
                    <td style={{ padding: "10px 12px", color: "var(--text-muted)" }}>{p.flexRole ? (roleNames[p.flexRole] ?? `R${p.flexRole}`) : "—"}</td>
                    <td style={{ padding: "10px 12px", fontFamily: "monospace" }}>{p.stake}</td>
                    <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "var(--accent)", fontSize: 12 }}>{p.wallet ?? "—"}</td>
                    <td style={{ padding: "10px 12px", color: "var(--text-secondary)", fontSize: 12 }}>
                      {p.telegramId ? (p.telegramId.startsWith("@") ? p.telegramId : `@${p.telegramId}`) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
