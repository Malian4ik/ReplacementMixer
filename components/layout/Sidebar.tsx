"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gavel, ListOrdered, Users2, ShieldCheck, Trophy, ScrollText, CalendarDays, UserCog } from "lucide-react";
import { useUser } from "@/components/UserContext";

const nav = [
  { href: "/queue",   label: "Очередь",  icon: ListOrdered, desc: "TOP-10 кандидатов" },
  { href: "/pool",    label: "Пул",      icon: ShieldCheck, desc: "Активные кандидаты" },
  { href: "/players", label: "Игроки",   icon: Users2,      desc: "База игроков" },
  { href: "/teams",   label: "Команды",  icon: Trophy,      desc: "Составы команд" },
  { href: "/logs",    label: "Журнал",   icon: ScrollText,  desc: "История действий" },
];

const judgeNav = [
  { href: "/judge", label: "Судья", icon: Gavel, desc: "Назначение замен" },
];

const ownerNav = [
  { href: "/schedule", label: "Расписание", icon: CalendarDays, desc: "Round-robin турнир" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useUser();
  const isJudgeOrOwner = user?.role === "OWNER" || user?.role === "JUDGE";
  const visibleNav = [
    ...(isJudgeOrOwner ? judgeNav : []),
    ...nav,
    ...(user?.role === "OWNER" ? ownerNav : []),
  ];

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sidebar-desktop">
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
        <nav style={{ flex: 1, padding: "10px 8px", overflowY: "auto" }}>
          {visibleNav.map(({ href, label, icon: Icon, desc }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link key={href} href={href} style={{ textDecoration: "none", display: "block", marginBottom: 2 }}>
                <div
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "9px 10px", borderRadius: 6, transition: "all 0.12s",
                    background: active ? "var(--accent)" : "transparent",
                    color: active ? "#000" : "var(--text-secondary)",
                  }}
                  onMouseEnter={e => {
                    if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
                    (e.currentTarget as HTMLElement).style.color = active ? "#000" : "var(--text-primary)";
                  }}
                  onMouseLeave={e => {
                    if (!active) (e.currentTarget as HTMLElement).style.background = "transparent";
                    (e.currentTarget as HTMLElement).style.color = active ? "#000" : "var(--text-secondary)";
                  }}
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
        <div style={{
          padding: "12px 16px", borderTop: "1px solid var(--border)",
        }}>
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
  const mobileItems = [
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
        <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: user.role === "OWNER" ? "rgba(240,165,0,0.2)" : "rgba(96,165,250,0.15)", color: user.role === "OWNER" ? "var(--accent)" : "#60a5fa" }}>{user.role}</span>
      </div>
      <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8, overflow: "hidden", textOverflow: "ellipsis" }}>{user.email}</div>
      <div style={{ display: "flex", gap: 4 }}>
        {user.role === "OWNER" && (
          <Link href="/admin/users" style={{ flex: 1, textDecoration: "none" }}>
            <button style={{ width: "100%", background: "rgba(240,165,0,0.08)", border: "1px solid rgba(240,165,0,0.2)", color: "var(--accent)", borderRadius: 4, padding: "4px 0", fontSize: 10, cursor: "pointer" }}>
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
