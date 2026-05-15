"use client";

import { useQuery } from "@tanstack/react-query";

interface PlayerRow {
  nick: string;
  mmr: number;
  stake: number;
  role: string;
  matchesPlayed: number;
  nightMatches: number;
  team: string;
}

interface ExportData {
  total: number;
  exportedAt: string;
  rows: PlayerRow[];
}

function mmrColor(mmr: number) {
  if (mmr >= 12000) return "#e879f9";
  if (mmr >= 9000)  return "#f87171";
  if (mmr >= 6000)  return "#fbbf24";
  if (mmr >= 3000)  return "#34d399";
  return "#60a5fa";
}

export default function ExportPage() {
  const { data, isLoading, error } = useQuery<ExportData>({
    queryKey: ["export-stats"],
    queryFn: () => fetch("/api/admin/export-stats").then(r => r.json()),
  });

  const handleDownload = () => {
    window.open("/api/admin/export-stats?format=csv", "_blank");
  };

  return (
    <div style={{ padding: "24px 20px", maxWidth: 1000, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>
            📊 Статистика турнира
          </h1>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
            Итоговые данные по игрокам — сохраните перед переходом на MixerCup #2
          </p>
          {data && (
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              Экспортировано: {new Date(data.exportedAt).toLocaleString("ru-RU")} · {data.total} игроков
            </p>
          )}
        </div>
        <button
          onClick={handleDownload}
          style={{
            padding: "9px 18px", borderRadius: 8, border: "none", cursor: "pointer",
            background: "#34d399", color: "#000", fontWeight: 700, fontSize: 13,
            display: "flex", alignItems: "center", gap: 6,
          }}
        >
          ⬇ Скачать CSV
        </button>
      </div>

      {isLoading && (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text-muted)" }}>Загрузка...</div>
      )}
      {error && (
        <div style={{ padding: 16, borderRadius: 8, background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", color: "#f87171", fontSize: 13 }}>
          Ошибка загрузки
        </div>
      )}

      {data && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["#", "Ник", "Команда", "Роль", "MMR", "Стейк", "Матчей", "Ночных"].map(h => (
                  <th key={h} style={{
                    textAlign: "left", padding: "8px 10px",
                    color: "var(--text-muted)", fontWeight: 600, fontSize: 11, whiteSpace: "nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((p, i) => (
                <tr key={p.nick} style={{
                  borderBottom: "1px solid var(--border-light)",
                  background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                }}>
                  <td style={{ padding: "7px 10px", color: "var(--text-muted)", fontSize: 11 }}>{i + 1}</td>
                  <td style={{ padding: "7px 10px", color: "var(--text-primary)", fontWeight: 600 }}>{p.nick}</td>
                  <td style={{ padding: "7px 10px", color: "var(--text-secondary)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.team.replace("Team ", "")}
                  </td>
                  <td style={{ padding: "7px 10px", color: "var(--text-secondary)" }}>{p.role}</td>
                  <td style={{ padding: "7px 10px" }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 4,
                      background: `${mmrColor(p.mmr)}18`, border: `1px solid ${mmrColor(p.mmr)}40`,
                      color: mmrColor(p.mmr),
                    }}>
                      {p.mmr.toLocaleString("ru")}
                    </span>
                  </td>
                  <td style={{ padding: "7px 10px", color: "var(--text-secondary)" }}>{p.stake}</td>
                  <td style={{ padding: "7px 10px", color: "var(--text-primary)", fontWeight: 700 }}>{p.matchesPlayed}</td>
                  <td style={{ padding: "7px 10px" }}>
                    {p.nightMatches > 0 ? (
                      <span style={{ color: "#818cf8", fontWeight: 700 }}>{p.nightMatches} 🌙</span>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
