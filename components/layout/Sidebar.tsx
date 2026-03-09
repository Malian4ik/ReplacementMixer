"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gavel, ListOrdered, Users2, ShieldCheck, Trophy, ScrollText } from "lucide-react";

const nav = [
  { href: "/judge",   label: "Панель судьи",  icon: Gavel,       desc: "Назначение замен" },
  { href: "/queue",   label: "Очередь",        icon: ListOrdered, desc: "TOP-10 кандидатов" },
  { href: "/pool",    label: "Пул замен",      icon: ShieldCheck, desc: "Активные кандидаты" },
  { href: "/players", label: "Игроки",         icon: Users2,      desc: "База игроков" },
  { href: "/teams",   label: "Команды",        icon: Trophy,      desc: "Составы команд" },
  { href: "/logs",    label: "Журнал",         icon: ScrollText,  desc: "История действий" },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside style={{
      width: 220,
      minWidth: 220,
      height: "100vh",
      background: "var(--bg-panel)",
      borderRight: "1px solid var(--border)",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* Logo */}
      <div style={{ padding: "20px 18px 16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: "var(--accent)", display: "flex",
            alignItems: "center", justifyContent: "center",
          }}>
            <Trophy size={15} color="#000" />
          </div>
          <span style={{ fontSize: 16, fontWeight: 800, color: "var(--accent)", letterSpacing: "-0.02em" }}>
            MixerCup
          </span>
        </div>
        <p style={{ fontSize: 11, color: "var(--text-secondary)", paddingLeft: 36, letterSpacing: "0.03em" }}>
          Replacement Manager
        </p>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "10px 8px", overflowY: "auto" }}>
        {nav.map(({ href, label, icon: Icon, desc }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link key={href} href={href} style={{ textDecoration: "none", display: "block", marginBottom: 2 }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 10px",
                borderRadius: 6,
                transition: "all 0.12s",
                background: active ? "var(--accent)" : "transparent",
                color: active ? "#000" : "var(--text-secondary)",
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; (e.currentTarget as HTMLElement).style.color = active ? "#000" : "var(--text-primary)"; }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = active ? "#000" : "var(--text-secondary)"; }}
              >
                <Icon size={16} style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: active ? 700 : 500, lineHeight: 1.2 }}>{label}</div>
                  <div style={{ fontSize: 10, opacity: 0.7, lineHeight: 1 }}>{desc}</div>
                </div>
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{
        padding: "12px 16px",
        borderTop: "1px solid var(--border)",
        fontSize: 10,
        color: "var(--text-muted)",
        letterSpacing: "0.03em",
      }}>
        v0.1 · MixerCup 2026
      </div>
    </aside>
  );
}
