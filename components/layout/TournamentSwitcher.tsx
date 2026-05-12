"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Trophy, Check, Plus } from "lucide-react";
import { useTournament } from "@/contexts/TournamentContext";
import Link from "next/link";

export function TournamentSwitcher() {
  const { activeTournament, tournaments, switchTournament, isLoading } = useTournament();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (!tournaments.length && !isLoading) return null;

  const label = activeTournament
    ? activeTournament.name.length > 22
      ? activeTournament.name.slice(0, 20) + "…"
      : activeTournament.name
    : "Выберите турнир";

  return (
    <div ref={ref} style={{ position: "relative", padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "7px 10px",
          borderRadius: 6,
          background: open ? "rgba(0,212,232,0.1)" : "rgba(0,0,0,0.2)",
          border: "1px solid rgba(0,212,232,0.2)",
          cursor: "pointer",
          color: activeTournament ? "var(--text-primary)" : "var(--text-muted)",
          textAlign: "left",
          transition: "all 0.15s",
        }}
      >
        <Trophy size={13} color="var(--accent)" style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {isLoading ? "Загрузка…" : label}
        </span>
        <ChevronDown size={13} color="var(--text-muted)" style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>

      {open && (
        <div style={{
          position: "absolute",
          top: "calc(100% - 4px)",
          left: 10,
          right: 10,
          zIndex: 100,
          background: "var(--bg-card, #1a1a2e)",
          border: "1px solid rgba(0,212,232,0.2)",
          borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          overflow: "hidden",
        }}>
          <div style={{ padding: "4px 0" }}>
            {tournaments.map(t => (
              <button
                key={t.id}
                onClick={() => { switchTournament(t.id); setOpen(false); }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  background: t.isActive ? "rgba(0,212,232,0.1)" : "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: t.isActive ? "var(--accent)" : "var(--text-secondary)",
                  textAlign: "left",
                  transition: "background 0.1s",
                }}
                onMouseEnter={e => { if (!t.isActive) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; }}
                onMouseLeave={e => { if (!t.isActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
              >
                <div style={{ width: 16, display: "flex", justifyContent: "center" }}>
                  {t.isActive && <Check size={13} color="var(--accent)" />}
                </div>
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div style={{ fontSize: 12, fontWeight: t.isActive ? 700 : 500, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.name}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", lineHeight: 1 }}>
                    {t.participantCount > 0 ? `${t.participantCount} игроков` : "Импортирован"}
                  </div>
                </div>
              </button>
            ))}
          </div>
          <div style={{ borderTop: "1px solid var(--border)", padding: "4px" }}>
            <Link href="/admin/import" onClick={() => setOpen(false)} style={{ textDecoration: "none", display: "block" }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "6px 10px", borderRadius: 4,
                color: "var(--text-muted)", cursor: "pointer",
              }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)"}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}
              >
                <Plus size={13} />
                <span style={{ fontSize: 11 }}>Импортировать турнир</span>
              </div>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
