"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gavel, ListOrdered, Users2, ShieldCheck, Trophy, ScrollText, CalendarDays, UserCog, Swords, BookOpen, Ban, Moon, Download } from "lucide-react";
import { useUser } from "@/components/UserContext";

const nav = [
  { href: "/queue",        label: "Очередь",               icon: ListOrdered, desc: "TOP-10 кандидатов" },
  { href: "/pool",         label: "Пул",                   icon: ShieldCheck, desc: "Активные кандидаты" },
  { href: "/players",      label: "Игроки",                icon: Users2,      desc: "База игроков" },
  { href: "/teams",        label: "Команды",               icon: Trophy,      desc: "Составы команд" },
  { href: "/logs",         label: "Журнал",                icon: ScrollText,  desc: "История действий" },
  { href: "/night-top",    label: "Ночные стрики",         icon: Moon,        desc: "Рейтинг по ночным" },
  { href: "/disqualified", label: "Дисквалифицированные",  icon: Ban,         desc: "Удалённые игроки" },
];

const judgeNav = [
  { href: "/judge", label: "Судья", icon: Gavel,    desc: "Назначение замен" },
  { href: "/guide", label: "FAQ",   icon: BookOpen, desc: "Инструкция для судьи" },
];

const ownerNav = [
  { href: "/schedule",      label: "Расписание", icon: CalendarDays, desc: "Round-robin турнир" },
  { href: "/admin/import",  label: "Импорт",     icon: Download,     desc: "Импорт из админки" },
];

const PUBLIC_PATHS = ["/login", "/register", "/setup"];

const marketingNav = [
  { href: "/teams",        label: "Команды",              icon: Trophy,      desc: "Составы команд" },
  { href: "/logs",         label: "Журнал",               icon: ScrollText,  desc: "История действий" },
  { href: "/night-top",    label: "Ночные стрики",        icon: Moon,        desc: "Рейтинг по ночным" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useUser();
  const isJudgeOrOwner = user?.role === "OWNER" || user?.role === "JUDGE";
  const isMarketing = user?.role === "MARKETING";

  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) return null;
  const visibleNav = isMarketing
    ? marketingNav
    : [
        ...(isJudgeOrOwner ? judgeNav : []),
        ...nav,
        ...(user?.role === "OWNER" ? ownerNav : []),
      ];

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sidebar-desktop">
        {/* Logo */}
        <div style={{
          padding: "18px 16px 14px",
          borderBottom: "1px solid var(--border)",
          background: "linear-gradient(180deg, rgba(0,212,232,0.05) 0%, transparent 100%)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 7,
              background: "linear-gradient(135deg, rgba(0,212,232,0.2) 0%, rgba(0,212,232,0.05) 100%)",
              border: "1px solid rgba(0,212,232,0.35)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 0 10px rgba(0,212,232,0.15)",
            }}>
              <Swords size={16} color="var(--accent)" />
            </div>
            <div>
              <div style={{
                fontSize: 14, fontWeight: 900, letterSpacing: "0.06em",
                color: "var(--accent)", lineHeight: 1, textTransform: "uppercase",
                textShadow: "0 0 12px rgba(0,212,232,0.4)",
              }}>
                MixerCup
              </div>
              <div style={{
                fontSize: 9, fontWeight: 700, letterSpacing: "0.2em",
                color: "var(--text-secondary)", lineHeight: 1, textTransform: "uppercase",
                marginTop: 2,
              }}>
                Series
              </div>
            </div>
          </div>
          {/* Dota 2 badge */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            background: "rgba(0,0,0,0.3)",
            border: "1px solid rgba(0,212,232,0.15)",
            borderRadius: 4, padding: "3px 8px",
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: "50%",
              background: "var(--accent)",
              boxShadow: "0 0 6px var(--accent)",
            }} />
            <span style={{ fontSize: 10, color: "var(--text-secondary)", letterSpacing: "0.08em", fontWeight: 600 }}>
              DOTA 2 TOURNAMENT
            </span>
          </div>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: "10px 8px", overflowY: "auto" }}>
          {visibleNav.map(({ href, label, icon: Icon, desc }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link key={href} href={href} style={{ textDecoration: "none", display: "block", marginBottom: 2 }}>
                <div
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "9px 10px", borderRadius: 6, transition: "all 0.15s",
                    background: active ? "rgba(0,212,232,0.12)" : "transparent",
                    color: active ? "var(--accent)" : "var(--text-secondary)",
                    borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
                    boxShadow: active ? "inset 0 0 20px rgba(0,212,232,0.05)" : "none",
                  }}
                  onMouseEnter={e => {
                    if (!active) {
                      (e.currentTarget as HTMLElement).style.background = "rgba(0,212,232,0.06)";
                      (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
                    }
                  }}
                  onMouseLeave={e => {
                    if (!active) {
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                      (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
                    }
                  }}
                >
                  <Icon size={16} style={{ flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: active ? 700 : 500, lineHeight: 1.2 }}>{label}</div>
                    <div style={{ fontSize: 10, opacity: 0.6, lineHeight: 1 }}>{desc}</div>
                  </div>
                </div>
              </Link>
            );
          })}
        </nav>

        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
          <UserInfo />
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <MobileNav pathname={pathname} />
    </>
  );
}

function MobileNav({ pathname }: { pathname: string }) {
  const { user } = useUser();
  const isJudgeOrOwner = user?.role === "OWNER" || user?.role === "JUDGE";
  const isMarketing = user?.role === "MARKETING";
  const mobileItems = isMarketing
    ? marketingNav
    : [
        ...(isJudgeOrOwner ? judgeNav : []),
        ...nav,
        ...(user?.role === "OWNER" ? ownerNav : []),
        ...(user?.role === "OWNER"
          ? [{ href: "/admin/users", label: "Юзеры", icon: UserCog, desc: "Управление" }]
          : []),
      ];
  return (
    <nav className="sidebar-mobile">
      {mobileItems.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              padding: "6px 8px",
              textDecoration: "none",
              color: active ? "var(--accent)" : "var(--text-muted)",
              borderTop: active ? "2px solid var(--accent)" : "2px solid transparent",
              transition: "color 0.12s",
              background: active ? "rgba(0,212,232,0.06)" : "transparent",
            }}
          >
            <Icon size={20} />
            <span style={{ fontSize: 10, fontWeight: active ? 700 : 400, lineHeight: 1 }}>
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function UserInfo() {
  const { user } = useUser();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  if (!user) return null;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 130 }}>{user.name}</span>
        <span style={{
          fontSize: 10, padding: "1px 6px", borderRadius: 4,
          background: user.role === "OWNER" ? "rgba(0,212,232,0.15)" : user.role === "MARKETING" ? "rgba(217,70,239,0.12)" : "rgba(96,165,250,0.12)",
          color: user.role === "OWNER" ? "var(--accent)" : user.role === "MARKETING" ? "#e879f9" : "#60a5fa",
          border: user.role === "OWNER" ? "1px solid rgba(0,212,232,0.3)" : user.role === "MARKETING" ? "1px solid rgba(217,70,239,0.3)" : "1px solid rgba(96,165,250,0.2)",
          fontWeight: 700,
        }}>{user.role}</span>
      </div>
      <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8, overflow: "hidden", textOverflow: "ellipsis" }}>{user.email}</div>
      <div style={{ display: "flex", gap: 4 }}>
        {user.role === "OWNER" && (
          <Link href="/admin/users" style={{ flex: 1, textDecoration: "none" }}>
            <button style={{
              width: "100%",
              background: "rgba(0,212,232,0.07)",
              border: "1px solid rgba(0,212,232,0.2)",
              color: "var(--accent)", borderRadius: 4, padding: "4px 0", fontSize: 10, cursor: "pointer",
            }}>
              👥 Пользователи
            </button>
          </Link>
        )}
        <button
          onClick={logout}
          style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid var(--border-light)", color: "var(--text-secondary)", borderRadius: 4, padding: "4px 0", fontSize: 10, cursor: "pointer" }}
        >
          Выйти
        </button>
      </div>
    </div>
  );
}
