"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CandidateScore } from "@/types";

function rowClass(i: number, total: number): string {
  if (i === 0) return "row-top";
  const norm = total <= 1 ? 0 : i / (total - 1);
  if (norm < 0.5) return "row-top";
  if (norm < 0.75) return "row-mid";
  return "row-low";
}

function roleFitLabel(rf: number) {
  if (rf >= 1) return <span style={{ color: "#34d399", fontWeight: 600 }}>Основная</span>;
  if (rf >= 0.8) return <span style={{ color: "#fbbf24" }}>Флекс</span>;
  return <span style={{ color: "#f87171" }}>Нет</span>;
}

type QueueResponse = { candidates: CandidateScore[]; total: number; totalPages: number; page: number };

export default function QueuePage() {
  const maxDeviation = 1000;
  const neededRole = 1;
  const [page, setPage] = useState(1);

  const { data: stats } = useQuery<{ targetAvgMmr: number }>({
    queryKey: ["stats"],
    queryFn: () => fetch("/api/stats").then(r => r.json()),
  });

  const targetAvgMmr = stats?.targetAvgMmr ?? 0;

  const { data, isLoading } = useQuery<QueueResponse>({
    queryKey: ["queue-page", { maxDeviation, neededRole, targetAvgMmr, page }],
    queryFn: () => {
      const sp = new URLSearchParams({
        targetAvgMmr: String(targetAvgMmr),
        maxDeviation: String(maxDeviation),
        neededRole: String(neededRole),
        page: String(page),
      });
      return fetch(`/api/replacement-queue?${sp}`).then(r => r.json());
    },
    enabled: !!stats,
  });

  const candidates = data?.candidates ?? [];
  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div className="page-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div className="page-title">Очередь кандидатов</div>
          <div className="page-subtitle">
            Стр. {page} из {totalPages} · {total} игроков в пуле
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div>
            <div className="lbl">Target MMR (авто)</div>
            <div style={{
              padding: "5px 12px", background: "rgba(240,165,0,0.1)",
              border: "1px solid rgba(240,165,0,0.3)", borderRadius: 5,
              color: "var(--accent)", fontWeight: 700, fontSize: 15, minWidth: 90, textAlign: "center",
            }}>
              {targetAvgMmr.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="lbl">Max Deviation</div>
            <div style={{
              padding: "5px 12px", background: "rgba(240,165,0,0.1)",
              border: "1px solid rgba(240,165,0,0.3)", borderRadius: 5,
              color: "var(--accent)", fontWeight: 700, fontSize: 15, minWidth: 90, textAlign: "center",
            }}>
              ±{maxDeviation.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: "auto", padding: "16px 24px" }}>
        {isLoading ? (
          <div style={{ color: "var(--text-secondary)", padding: 40, textAlign: "center" }}>Расчёт...</div>
        ) : candidates.length === 0 ? (
          <div style={{ color: "var(--text-secondary)", padding: 40, textAlign: "center" }}>
            Нет активных кандидатов в пуле
          </div>
        ) : (
          <div className="card" style={{ overflow: "hidden" }}>
            <table className="tbl">
              <thead>
                <tr>
                  {["#", "НИК", "КОШЕЛЁК", "MMR", "STAKE", "РОЛЬ", "STAKENORM", "MMRNORM", "ROLEFIT", "BASESCORE", "BF", "SUBSCORE", "MMR ПОСЛЕ"].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {candidates.map((c, i) => (
                  <tr key={c.poolEntryId} className={rowClass(i, candidates.length)}>
                    <td>
                      <span style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        width: 22, height: 22, borderRadius: "50%",
                        background: i === 0 ? "rgba(16,185,129,0.2)" : "rgba(255,255,255,0.05)",
                        color: i === 0 ? "#34d399" : "var(--text-secondary)",
                        fontSize: 11, fontWeight: 700,
                      }}>{(page - 1) * 10 + i + 1}</span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{c.nick}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 12, color: c.wallet ? "var(--accent)" : "var(--text-muted)" }}>
                      {c.wallet ?? "—"}
                    </td>
                    <td>{c.mmr.toLocaleString()}</td>
                    <td>{c.stake}</td>
                    <td>R{c.mainRole}{c.flexRole ? `/R${c.flexRole}` : ""}</td>
                    <td style={{ fontFamily: "monospace", color: "var(--text-secondary)" }}>{c.stakeNorm.toFixed(3)}</td>
                    <td style={{ fontFamily: "monospace", color: "var(--text-secondary)" }}>{c.mmrNorm.toFixed(3)}</td>
                    <td>{roleFitLabel(c.roleFit)}</td>
                    <td style={{ fontFamily: "monospace" }}>{c.baseScore.toFixed(4)}</td>
                    <td style={{ fontFamily: "monospace" }}>{c.balanceFactor.toFixed(3)}</td>
                    <td style={{ fontFamily: "monospace", fontWeight: 700, color: i === 0 ? "#34d399" : undefined }}>
                      {c.subScore.toFixed(4)}
                    </td>
                    <td style={{ color: "var(--text-secondary)", fontFamily: "monospace" }}>
                      {Math.round(c.teamMmrAfter).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 16 }}>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              ← Назад
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                className="btn btn-sm"
                onClick={() => setPage(p)}
                style={{
                  background: p === page ? "rgba(0,212,232,0.2)" : "transparent",
                  border: p === page ? "1px solid var(--accent)" : "1px solid rgba(0,212,232,0.2)",
                  color: p === page ? "var(--accent)" : "var(--text-secondary)",
                  minWidth: 36,
                }}
              >
                {p}
              </button>
            ))}
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Вперёд →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
