"use client";

import { useState, useMemo } from "react";
import { Calendar, Clock, Users } from "lucide-react";

const TEAMS = [
  "Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot",
  "Golf", "Hotel", "India", "Juliet", "Kilo", "Lima",
  "Mike", "November", "Oscar", "Papa", "Quebec", "Romeo",
  "Sierra", "Tango", "Uniform", "Victor", "Whiskey", "Xray",
];

interface Match {
  home: string;
  away: string;
}

interface Round {
  round: number;
  startTime: Date;
  matches: Match[];
}

function generateRoundRobin(teams: string[]): Round[] {
  const n = teams.length;
  const arr = [...teams.slice(1)]; // rotate these, fix teams[0]
  const fixed = teams[0];
  const rounds: Round[] = [];

  // Start: 2026-03-13 00:00 MSK (UTC+3)
  const baseMs = Date.UTC(2026, 2, 12, 21, 0, 0); // 21:00 UTC = 00:00 MSK

  for (let r = 0; r < n - 1; r++) {
    const matches: Match[] = [];

    // fixed vs arr[0]
    if (r % 2 === 0) {
      matches.push({ home: fixed, away: arr[0] });
    } else {
      matches.push({ home: arr[0], away: fixed });
    }

    // pair up the rest
    for (let i = 1; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      matches.push(r % 2 === 0 ? { home: a, away: b } : { home: b, away: a });
    }

    rounds.push({
      round: r + 1,
      startTime: new Date(baseMs + r * 12 * 60 * 60 * 1000),
      matches,
    });

    // rotate arr left by 1
    arr.push(arr.shift()!);
  }

  return rounds;
}

function formatMsk(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDayMsk(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatTimeMsk(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function SchedulePage() {
  const [filterTeam, setFilterTeam] = useState("");
  const [expandedRound, setExpandedRound] = useState<number | null>(1);

  const rounds = useMemo(() => generateRoundRobin(TEAMS), []);

  const filtered = useMemo(() => {
    if (!filterTeam) return rounds;
    return rounds
      .map((r) => ({
        ...r,
        matches: r.matches.filter(
          (m) => m.home === filterTeam || m.away === filterTeam
        ),
      }))
      .filter((r) => r.matches.length > 0);
  }, [rounds, filterTeam]);

  // Group by day (MSK)
  const byDay = useMemo(() => {
    const map = new Map<string, Round[]>();
    for (const r of filtered) {
      const day = formatDayMsk(r.startTime);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(r);
    }
    return [...map.entries()];
  }, [filtered]);

  const totalMatches = rounds.reduce((s, r) => s + r.matches.length, 0);

  return (
    <div style={{ padding: "24px 20px", maxWidth: 900, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <Calendar size={20} color="var(--accent)" />
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>
            Расписание турнира
          </h1>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
          Round-robin · {TEAMS.length} команд · {rounds.length} туров · {totalMatches} матчей
        </p>
        <div style={{
          marginTop: 10,
          display: "flex", gap: 16, flexWrap: "wrap",
          fontSize: 11, color: "var(--text-muted)",
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Clock size={12} /> Длительность матча: макс. 1.5 ч
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Clock size={12} /> Перерыв между играми команды: ~10.5 ч
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Users size={12} /> Туры каждые 12 ч · 24/7
          </span>
        </div>
        <p style={{ marginTop: 8, fontSize: 11, color: "rgba(240,165,0,0.6)", fontStyle: "italic" }}>
          * Пример расписания. Реальные команды добавляются отдельно.
        </p>
      </div>

      {/* Filter */}
      <div style={{ marginBottom: 20 }}>
        <select
          value={filterTeam}
          onChange={(e) => setFilterTeam(e.target.value)}
          style={{
            background: "var(--bg-card)", border: "1px solid var(--border)",
            color: "var(--text-primary)", borderRadius: 6,
            padding: "7px 12px", fontSize: 13, cursor: "pointer",
            minWidth: 200,
          }}
        >
          <option value="">Все команды</option>
          {TEAMS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        {filterTeam && (
          <span style={{ marginLeft: 10, fontSize: 12, color: "var(--accent)" }}>
            {filtered.length} туров для команды «{filterTeam}»
          </span>
        )}
      </div>

      {/* Schedule */}
      {byDay.map(([day, dayRounds]) => (
        <div key={day} style={{ marginBottom: 24 }}>
          <div style={{
            fontSize: 12, fontWeight: 700, color: "var(--text-secondary)",
            textTransform: "uppercase", letterSpacing: "0.08em",
            marginBottom: 8, paddingLeft: 4,
          }}>
            {day}
          </div>

          {dayRounds.map((round) => {
            const isOpen = expandedRound === round.round;
            return (
              <div
                key={round.round}
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  marginBottom: 8,
                  overflow: "hidden",
                }}
              >
                {/* Round header */}
                <div
                  onClick={() => setExpandedRound(isOpen ? null : round.round)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 16px", cursor: "pointer",
                    background: isOpen ? "rgba(240,165,0,0.05)" : "transparent",
                    transition: "background 0.15s",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: "#000",
                      background: "var(--accent)", borderRadius: 4,
                      padding: "2px 8px", minWidth: 60, textAlign: "center",
                    }}>
                      Тур {round.round}
                    </span>
                    <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 600 }}>
                      {formatTimeMsk(round.startTime)} МСК
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {round.matches.length} матч{round.matches.length === 12 ? "ей" : "а"}
                    </span>
                  </div>
                  <span style={{ fontSize: 14, color: "var(--text-muted)", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>›</span>
                </div>

                {/* Matches */}
                {isOpen && (
                  <div style={{ borderTop: "1px solid var(--border)" }}>
                    {round.matches.map((m, i) => (
                      <div
                        key={i}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr auto 1fr",
                          alignItems: "center",
                          padding: "8px 16px",
                          borderBottom: i < round.matches.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                          background: (m.home === filterTeam || m.away === filterTeam) && filterTeam
                            ? "rgba(240,165,0,0.06)" : "transparent",
                        }}
                      >
                        <span style={{
                          fontSize: 13, fontWeight: 600,
                          color: m.home === filterTeam ? "var(--accent)" : "var(--text-primary)",
                          textAlign: "right",
                        }}>
                          {m.home}
                        </span>
                        <span style={{
                          fontSize: 11, color: "var(--text-muted)",
                          padding: "0 16px", fontWeight: 700,
                        }}>
                          vs
                        </span>
                        <span style={{
                          fontSize: 13, fontWeight: 600,
                          color: m.away === filterTeam ? "var(--accent)" : "var(--text-primary)",
                        }}>
                          {m.away}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
