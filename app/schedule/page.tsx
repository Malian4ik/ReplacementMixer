"use client";

import { useState, useMemo } from "react";
import { Calendar, Clock, Users } from "lucide-react";

const TEAMS = [
  "Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot",
  "Golf", "Hotel", "India", "Juliet", "Kilo", "Lima",
  "Mike", "November", "Oscar", "Papa", "Quebec", "Romeo",
  "Sierra", "Tango", "Uniform", "Victor", "Whiskey", "Xray",
];

const MATCH_MS = 1.5 * 60 * 60 * 1000;  // 1.5h in ms
const ROUND_MS = 19.5 * 60 * 60 * 1000; // 19.5h between round starts

interface ScheduledMatch {
  home: string;
  away: string;
  startTime: Date;
  endTime: Date;
  round: number;
  slot: number;
}

interface Round {
  round: number;
  roundStart: Date;
  matches: ScheduledMatch[];
}

function generateRoundRobin(teams: string[]): Round[] {
  const n = teams.length;
  const arr = [...teams.slice(1)];
  const fixed = teams[0];

  // Start: 2026-03-13 00:00 MSK = 2026-03-12 21:00 UTC
  const baseMs = Date.UTC(2026, 2, 12, 21, 0, 0);

  const rounds: Round[] = [];

  for (let r = 0; r < n - 1; r++) {
    const roundStart = baseMs + r * ROUND_MS;
    const pairs: { home: string; away: string }[] = [];

    if (r % 2 === 0) {
      pairs.push({ home: fixed, away: arr[0] });
    } else {
      pairs.push({ home: arr[0], away: fixed });
    }

    for (let i = 1; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      pairs.push(r % 2 === 0 ? { home: a, away: b } : { home: b, away: a });
    }

    const matches: ScheduledMatch[] = pairs.map((p, slot) => {
      const start = new Date(roundStart + slot * MATCH_MS);
      return {
        ...p,
        startTime: start,
        endTime: new Date(start.getTime() + MATCH_MS),
        round: r + 1,
        slot,
      };
    });

    rounds.push({ round: r + 1, roundStart: new Date(roundStart), matches });
    arr.push(arr.shift()!);
  }

  return rounds;
}

function calcRest(rounds: Round[], team: string): { min: number; max: number; avg: number } {
  const times: number[] = [];
  for (const r of rounds) {
    const m = r.matches.find((x) => x.home === team || x.away === team);
    if (m) times.push(m.startTime.getTime());
  }
  if (times.length < 2) return { min: 0, max: 0, avg: 0 };
  const rests: number[] = [];
  for (let i = 1; i < times.length; i++) {
    rests.push((times[i] - times[i - 1] - MATCH_MS) / 3600000);
  }
  return {
    min: Math.min(...rests),
    max: Math.max(...rests),
    avg: rests.reduce((a, b) => a + b, 0) / rests.length,
  };
}

const fmt = (d: Date) =>
  new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);

const fmtDay = (d: Date) =>
  new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(d);

export default function SchedulePage() {
  const [filterTeam, setFilterTeam] = useState("");
  const [expandedRound, setExpandedRound] = useState<number | null>(1);

  const rounds = useMemo(() => generateRoundRobin(TEAMS), []);
  const totalMatches = rounds.reduce((s, r) => s + r.matches.length, 0);

  const restInfo = useMemo(
    () => (filterTeam ? calcRest(rounds, filterTeam) : null),
    [rounds, filterTeam]
  );

  const filtered = useMemo(() => {
    if (!filterTeam) return rounds;
    return rounds.map((r) => ({
      ...r,
      matches: r.matches.filter((m) => m.home === filterTeam || m.away === filterTeam),
    })).filter((r) => r.matches.length > 0);
  }, [rounds, filterTeam]);

  // group by day
  const byDay = useMemo(() => {
    const map = new Map<string, Round[]>();
    for (const r of filtered) {
      const day = fmtDay(r.roundStart);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(r);
    }
    return [...map.entries()];
  }, [filtered]);

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
        <div style={{ marginTop: 10, display: "flex", gap: 16, flexWrap: "wrap", fontSize: 11, color: "var(--text-muted)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Clock size={12} /> Матч: макс. 1.5 ч
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Clock size={12} /> Отдых команды: ~18 ч
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Users size={12} /> Матчи идут непрерывно 24/7
          </span>
        </div>
        <p style={{ marginTop: 8, fontSize: 11, color: "rgba(240,165,0,0.6)", fontStyle: "italic" }}>
          * Пример расписания. Реальные команды добавляются отдельно.
        </p>
      </div>

      {/* Filter */}
      <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <select
          value={filterTeam}
          onChange={(e) => setFilterTeam(e.target.value)}
          style={{
            background: "var(--bg-card)", border: "1px solid var(--border)",
            color: "var(--text-primary)", borderRadius: 6,
            padding: "7px 12px", fontSize: 13, cursor: "pointer", minWidth: 200,
          }}
        >
          <option value="">Все команды</option>
          {TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        {filterTeam && restInfo && (
          <div style={{
            fontSize: 11, color: "var(--text-muted)",
            background: "var(--bg-card)", border: "1px solid var(--border)",
            borderRadius: 6, padding: "6px 12px",
          }}>
            Отдых: мин <span style={{ color: "var(--accent)" }}>{restInfo.min.toFixed(1)}ч</span>
            {" · "}макс <span style={{ color: "var(--accent)" }}>{restInfo.max.toFixed(1)}ч</span>
            {" · "}avg <span style={{ color: "var(--accent)" }}>{restInfo.avg.toFixed(1)}ч</span>
          </div>
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
            const firstMatch = round.matches[0];
            const lastMatch = round.matches[round.matches.length - 1];

            return (
              <div key={round.round} style={{
                background: "var(--bg-card)", border: "1px solid var(--border)",
                borderRadius: 8, marginBottom: 8, overflow: "hidden",
              }}>
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
                      {fmt(firstMatch.startTime)} — {fmt(lastMatch.endTime)} МСК
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {round.matches.length} матч{round.matches.length === 12 ? "ей" : "а"}
                    </span>
                  </div>
                  <span style={{
                    fontSize: 14, color: "var(--text-muted)",
                    transform: isOpen ? "rotate(90deg)" : "none",
                    transition: "transform 0.15s",
                  }}>›</span>
                </div>

                {isOpen && (
                  <div style={{ borderTop: "1px solid var(--border)" }}>
                    {round.matches.map((m, i) => (
                      <div key={i} style={{
                        display: "grid",
                        gridTemplateColumns: "80px 1fr auto 1fr",
                        alignItems: "center",
                        padding: "8px 16px",
                        borderBottom: i < round.matches.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                        background: (m.home === filterTeam || m.away === filterTeam) && filterTeam
                          ? "rgba(240,165,0,0.06)" : "transparent",
                      }}>
                        <span style={{ fontSize: 11, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                          {fmt(m.startTime)}
                        </span>
                        <span style={{
                          fontSize: 13, fontWeight: 600, textAlign: "right",
                          color: m.home === filterTeam ? "var(--accent)" : "var(--text-primary)",
                        }}>
                          {m.home}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--text-muted)", padding: "0 14px", fontWeight: 700 }}>
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
