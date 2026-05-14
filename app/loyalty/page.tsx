"use client";

import { useQuery } from "@tanstack/react-query";

interface LoyalPlayer {
  nick: string;
  mmr: number;
  matchesPlayed: number;
}

interface TeamStat {
  team: string;
  loyalCount: number;
  full: boolean;
  players: LoyalPlayer[];
}

interface LoyaltyData {
  summary: {
    totalSlots: number;
    substitutedPlayers: number;
    loyalPlayers: number;
    teamsAllLoyal: number;
    totalTeams: number;
    totalMatchesPlayedByLoyal: number;
    avgMatchesPerLoyalPlayer: string;
  };
  teams: TeamStat[];
  logCount: number;
}

function mmrColor(mmr: number) {
  if (mmr >= 12000) return "#e879f9";
  if (mmr >= 9000)  return "#f87171";
  if (mmr >= 6000)  return "#fbbf24";
  if (mmr >= 3000)  return "#34d399";
  return "#60a5fa";
}

function MmrBadge({ mmr }: { mmr: number }) {
  const color = mmrColor(mmr);
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 4,
      background: `${color}18`, border: `1px solid ${color}40`, color,
    }}>
      {mmr.toLocaleString("ru")}
    </span>
  );
}

function LoyalBar({ count }: { count: number }) {
  const pct = (count / 5) * 100;
  const color = count === 5 ? "#34d399" : count >= 3 ? "#fbbf24" : "#f87171";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 60, height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, color, fontWeight: 700 }}>{count}/5</span>
    </div>
  );
}

export default function LoyaltyPage() {
  const { data, isLoading, error, dataUpdatedAt } = useQuery<LoyaltyData>({
    queryKey: ["loyalty-stats"],
    queryFn: () => fetch("/api/admin/loyalty-stats").then(r => r.json()),
    refetchInterval: 30_000,
  });

  const lastUpdate = dataUpdatedAt ? new Date(dataUpdatedAt) : null;
  const s = data?.summary;

  return (
    <div style={{ padding: "24px 20px", maxWidth: 900, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)", margin: 0, lineHeight: 1.2 }}>
              🛡 Верные игроки
            </h1>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
              Игроки, которые ни разу не уходили в замену и не были заменены
            </p>
          </div>
          {lastUpdate && (
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              Обновлено: {lastUpdate.toLocaleTimeString("ru-RU")}
            </span>
          )}
        </div>

        {/* Stats row */}
        {s && (
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
            gap: 10, marginTop: 16,
          }}>
            {[
              { label: "Верных игроков", value: s.loyalPlayers, color: "#34d399" },
              { label: "Всего слотов", value: s.totalSlots, color: "var(--text-secondary)" },
              { label: "Участвовали в заменах", value: s.substitutedPlayers, color: "#f87171" },
              { label: "Всего замен", value: data?.logCount ?? 0, color: "#fbbf24" },
              { label: "Avg игр (верных)", value: s.avgMatchesPerLoyalPlayer, color: "#60a5fa" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: 8, padding: "10px 14px",
              }}>
                <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Loading / Error */}
      {isLoading && (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text-muted)" }}>
          Загрузка...
        </div>
      )}
      {error && (
        <div style={{ padding: 16, borderRadius: 8, background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", color: "#f87171", fontSize: 13 }}>
          Ошибка загрузки данных
        </div>
      )}

      {/* Teams grid */}
      {data && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
          {data.teams.map(team => (
            <div key={team.team} style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 10, overflow: "hidden",
              borderTop: `3px solid ${team.full ? "#34d399" : team.loyalCount >= 3 ? "#fbbf24" : "#f87171"}`,
            }}>
              {/* Team header */}
              <div style={{ padding: "10px 14px 8px", borderBottom: "1px solid var(--border-light)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{
                    fontSize: 13, fontWeight: 700, color: "var(--text-primary)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
                  }} title={team.team.replace("Team ", "")}>
                    {team.team.replace("Team ", "")}
                  </span>
                  <LoyalBar count={team.loyalCount} />
                </div>
              </div>

              {/* Players */}
              <div style={{ padding: "6px 0" }}>
                {team.players.map(p => (
                  <div key={p.nick} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 14px",
                  }}>
                    <div style={{
                      width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                      background: mmrColor(p.mmr),
                      boxShadow: `0 0 6px ${mmrColor(p.mmr)}60`,
                    }} />
                    <span style={{
                      fontSize: 12, color: "var(--text-primary)", flex: 1,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }} title={p.nick}>
                      {p.nick}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      {p.matchesPlayed > 0 && (
                        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                          {p.matchesPlayed}г
                        </span>
                      )}
                      <MmrBadge mmr={p.mmr} />
                    </div>
                  </div>
                ))}
                {team.players.length === 0 && (
                  <div style={{ padding: "8px 14px", fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>
                    Нет верных игроков
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <p style={{ marginTop: 20, fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
        Обновляется каждые 30 секунд · {data?.summary.loyalPlayers ?? "—"} из {data?.summary.totalSlots ?? "—"} игроков никогда не менялись
      </p>
    </div>
  );
}
