"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";

type Player = {
  id: string; nick: string; mmr: number; mainRole: number; flexRole: number | null;
  stake: number; wallet: string | null; telegramId: string | null;
  nightMatches: number; isActiveInDatabase: boolean;
};

type Team = {
  id: string; name: string; avgMmr: number;
  players: (Player | null)[];
};

const ROLE_LABELS: Record<number, string> = { 1: "Carry", 2: "Mid", 3: "Offlane", 4: "Soft Sup", 5: "Hard Sup" };

export default function TeamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data: team, isLoading } = useQuery<Team>({
    queryKey: ["team", id],
    queryFn: () => fetch(`/api/teams/${id}`).then(r => r.json()),
  });

  if (isLoading) return (
    <div style={{ padding: 32, color: "var(--text-muted)", textAlign: "center" }}>Загрузка...</div>
  );
  if (!team) return (
    <div style={{ padding: 32, color: "var(--text-muted)", textAlign: "center" }}>Команда не найдена</div>
  );

  const players = team.players ?? [];

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div className="page-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => router.back()}
            style={{ fontSize: 18, padding: "0 8px", lineHeight: 1 }}
          >
            ←
          </button>
          <div>
            <div className="page-title">{team.name}</div>
            <div className="page-subtitle">{players.filter(Boolean).length} игроков · Avg MMR: {team.avgMmr.toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "16px 24px" }}>
        <div className="card" style={{ overflow: "visible" }}>
          <table className="tbl" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>#</th>
                <th>Ник</th>
                <th>MMR</th>
                <th>Роль</th>
                <th>Ставка</th>
                <th>Кошелёк</th>
                <th>Telegram</th>
                <th>Ночные</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p, i) => (
                <tr key={i}>
                  <td style={{ color: "var(--text-muted)", fontSize: 12 }}>{i + 1}</td>
                  {p ? (
                    <>
                      <td style={{ fontWeight: 600 }}>{p.nick}</td>
                      <td style={{ fontFamily: "monospace" }}>{p.mmr.toLocaleString()}</td>
                      <td>
                        <span style={{ color: "var(--accent)", fontWeight: 600 }}>R{p.mainRole}</span>
                        {p.flexRole && <span style={{ color: "var(--text-muted)", fontSize: 11 }}>/R{p.flexRole}</span>}
                        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>
                          {ROLE_LABELS[p.mainRole] ?? ""}
                        </div>
                      </td>
                      <td>{p.stake}</td>
                      <td style={{ fontFamily: "monospace", fontSize: 12, color: p.wallet ? "var(--text-primary)" : "var(--text-muted)" }}>
                        {p.wallet ?? "—"}
                      </td>
                      <td style={{ fontSize: 12, color: p.telegramId ? "var(--accent)" : "var(--text-muted)" }}>
                        {p.telegramId ? `@${p.telegramId}` : "—"}
                      </td>
                      <td style={{ textAlign: "center" }}>{p.nightMatches}</td>
                      <td>
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 4,
                          background: p.isActiveInDatabase ? "rgba(52,211,153,0.15)" : "rgba(248,113,113,0.15)",
                          color: p.isActiveInDatabase ? "#34d399" : "#f87171",
                        }}>
                          {p.isActiveInDatabase ? "Активен" : "Неактивен"}
                        </span>
                      </td>
                    </>
                  ) : (
                    <td colSpan={8} style={{ color: "var(--text-muted)", fontStyle: "italic", fontSize: 12 }}>
                      — пусто —
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
