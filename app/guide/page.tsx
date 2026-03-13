"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface FaqItem {
  q: string;
  a: React.ReactNode;
  tag?: string;
}

const FAQ: FaqItem[] = [
  {
    tag: "Основы",
    q: "Что такое MixerCup и зачем нужна система замен?",
    a: (
      <>
        MixerCup — микс-турнир по Dota 2, где команды собираются из случайных игроков.
        Система замен позволяет оперативно заменить игрока, который не может продолжить
        матч, на кандидата из пула замен — с учётом роли, MMR и баланса команды.
      </>
    ),
  },
  {
    tag: "Основы",
    q: "Какие страницы есть у судьи?",
    a: (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[
          { href: "/judge",   label: "Судья",      desc: "Основная панель — здесь назначаются замены" },
          { href: "/queue",   label: "Очередь",    desc: "TOP-10 лучших кандидатов по SubScore" },
          { href: "/pool",    label: "Пул",        desc: "Все игроки в пуле замен, управление статусами" },
          { href: "/players", label: "Игроки",     desc: "База всех игроков турнира" },
          { href: "/teams",   label: "Команды",    desc: "Составы команд и средний MMR" },
          { href: "/logs",    label: "Журнал",     desc: "История всех замен" },
        ].map(r => (
          <div key={r.href} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
            <code style={{ fontSize: 11, color: "var(--accent)", background: "rgba(0,212,232,0.08)", padding: "1px 6px", borderRadius: 3, flexShrink: 0 }}>{r.href}</code>
            <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 12 }}>{r.label}</span>
            <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>— {r.desc}</span>
          </div>
        ))}
      </div>
    ),
  },

  {
    tag: "Замены",
    q: "Как назначить замену игроку?",
    a: (
      <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 2 }}>
        <li>Открой <b>/judge</b></li>
        <li>Найди команду и нажми на слот игрока, которого нужно заменить</li>
        <li>В правой панели появится информация о нём, роль выставится автоматически</li>
        <li>Ниже отобразится список кандидатов из пула, отсортированных по SubScore</li>
        <li>Нажми на нужного кандидата — он подсветится</li>
        <li>Нажми <b>«Назначить замену»</b></li>
        <li>Заменённый игрок автоматически попадёт в конец пула</li>
      </ol>
    ),
  },
  {
    tag: "Замены",
    q: "Как заполнить пустой слот в команде?",
    a: (
      <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 2 }}>
        <li>Нажми на пустой слот в команде на странице <b>/judge</b></li>
        <li>В шапке вручную выбери нужную роль (R1–R5)</li>
        <li>Выбери кандидата из списка → <b>«Назначить замену»</b></li>
      </ol>
    ),
  },
  {
    tag: "Замены",
    q: "Что означают кнопки R1–R5 в шапке панели судьи?",
    a: (
      <>
        Это <b>нужная роль</b> для замены. Если выбран игрок — роль берётся из его профиля
        и не меняется. Если выбран пустой слот — роль нужно выставить вручную.
        Кандидаты в списке сортируются с учётом совпадения роли (основная = 1.0, запасная = 0.8, другая = 0.5).
      </>
    ),
  },
  {
    tag: "Замены",
    q: "Что такое SubScore и как кандидаты ранжируются?",
    a: (
      <>
        SubScore — итоговый балл кандидата для конкретной замены. Формула:
        <div style={{ margin: "8px 0", padding: "8px 12px", background: "rgba(0,212,232,0.06)", borderRadius: 6, fontFamily: "monospace", fontSize: 12 }}>
          SubScore = (0.6 × Stake + 0.3 × MMR + 0.1 × RoleFit) × BalanceFactor
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          <span><b>Stake</b> — сумма взноса игрока (нормированная)</span>
          <span><b>MMR</b> — рейтинг игрока (нормированный)</span>
          <span><b>RoleFit</b> — соответствие роли: 1.0 / 0.8 / 0.5</span>
          <span><b>BalanceFactor</b> — насколько замена улучшает баланс MMR команды</span>
        </div>
      </>
    ),
  },

  {
    tag: "Пул замен",
    q: "Как игрок попадает в пул замен?",
    a: (
      <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 2 }}>
        <li>Регистрируется как замена вручную (через страницу Игроки)</li>
        <li>Автоматически — после того как его заменили в команде</li>
      </ul>
    ),
  },
  {
    tag: "Пул замен",
    q: "В чём разница между «Деактив.» и «Удалить» в пуле?",
    a: (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
        <div style={{ padding: "6px 10px", background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 5 }}>
          <b style={{ color: "#fbbf24" }}>Деактив.</b> — временно убирает игрока из ротации. Он остаётся в пуле, но не показывается как кандидат. Используй, если игрок временно отошёл.
        </div>
        <div style={{ padding: "6px 10px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 5 }}>
          <b style={{ color: "#f87171" }}>Удалить</b> — полностью убирает игрока из пула. Действие необратимо (потребуется подтверждение). Используй только если игрок окончательно выбыл.
        </div>
      </div>
    ),
  },
  {
    tag: "Пул замен",
    q: "По какому принципу сортируется очередь в пуле?",
    a: (
      <>
        Исключительно по времени попадания в пул — кто раньше вошёл, тот выше.
        После замены заменённый игрок добавляется в <b>конец</b> очереди.
      </>
    ),
  },

  {
    tag: "Технические",
    q: "Что делать если что-то пошло не так при замене?",
    a: (
      <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 2 }}>
        <li>Все замены записываются в <b>/logs</b> — можно проверить историю</li>
        <li>Если игрок не попал в пул после замены — обнови страницу (F5)</li>
        <li>Если кандидат не отображается — проверь его статус в <b>/pool</b> (возможно, деактивирован)</li>
        <li>По любым проблемам обращайтесь к <b style={{ color: "var(--accent)" }}>@mmLLLL1112</b></li>
      </ul>
    ),
  },
];

const TAGS = Array.from(new Set(FAQ.map(f => f.tag).filter(Boolean))) as string[];

export default function GuidePage() {
  const [open, setOpen] = useState<number | null>(0);
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const filtered = activeTag ? FAQ.filter(f => f.tag === activeTag) : FAQ;

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div className="page-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div className="page-title">Инструкция</div>
          <div className="page-subtitle">Руководство для судьи · FAQ</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            className={`btn btn-sm ${activeTag === null ? "btn-accent" : "btn-ghost"}`}
            style={{ fontSize: 11 }}
            onClick={() => setActiveTag(null)}
          >
            Все
          </button>
          {TAGS.map(tag => (
            <button
              key={tag}
              className={`btn btn-sm ${activeTag === tag ? "btn-accent" : "btn-ghost"}`}
              style={{ fontSize: 11 }}
              onClick={() => setActiveTag(t => t === tag ? null : tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
        <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.map((item, i) => {
            const idx = FAQ.indexOf(item);
            const isOpen = open === idx;
            return (
              <div
                key={idx}
                style={{
                  background: "var(--bg-card)",
                  border: `1px solid ${isOpen ? "rgba(0,212,232,0.25)" : "var(--border)"}`,
                  borderRadius: 8,
                  overflow: "hidden",
                  transition: "border-color 0.15s",
                  boxShadow: isOpen ? "0 0 20px rgba(0,212,232,0.05)" : "none",
                }}
              >
                <button
                  onClick={() => setOpen(isOpen ? null : idx)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "13px 16px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                    {item.tag && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
                        color: "var(--accent)", background: "rgba(0,212,232,0.1)",
                        border: "1px solid rgba(0,212,232,0.2)",
                        borderRadius: 3, padding: "1px 6px", textTransform: "uppercase", flexShrink: 0,
                      }}>
                        {item.tag}
                      </span>
                    )}
                    <span style={{
                      fontSize: 13, fontWeight: 600,
                      color: isOpen ? "var(--accent)" : "var(--text-primary)",
                      transition: "color 0.15s",
                    }}>
                      {item.q}
                    </span>
                  </div>
                  <ChevronDown
                    size={15}
                    color="var(--text-muted)"
                    style={{
                      flexShrink: 0,
                      transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 0.2s",
                    }}
                  />
                </button>

                {isOpen && (
                  <div style={{
                    padding: "0 16px 14px",
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    lineHeight: 1.65,
                    borderTop: "1px solid rgba(0,212,232,0.08)",
                    paddingTop: 12,
                  }}>
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
