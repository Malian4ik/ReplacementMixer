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

export default function QueuePage() {
  const [maxDeviation, setMaxDeviation] = useState(800);
  const [neededRole, setNeededRole] = useState(1);

  const { data: stats } = useQuery<{ targetAvgMmr: number }>({
    queryKey: ["stats"],
    queryFn: () => fetch("/api/stats").then(r => r.json()),
  });

  const targetAvgMmr = stats?.targetAvgMmr ?? 9000;

  const { data: candidates = [], isLoading } = useQuery<CandidateScore[]>({
    queryKey: ["queue-page", { maxDeviation, neededRole, targetAvgMmr }],
    queryFn: () => {
      const sp = new URLSearchParams({
        targetAvgMmr: String(targetAvgMmr),
        maxDeviation: String(maxDeviation),
        neededRole: String(neededRole),
      });
      return fetch(`/api/replacement-queue?${sp}`).then(r => r.json());
    },
    enabled: !!stats,
  });

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div className="page-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div className="page-title">Очередь кандидатов</div>
          <div className="page-subtitle">TOP-10 активных игроков по SubScore</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Target MMR — readonly, from teams */}
          <div>
            <div className="lbl">Target MMR (авто)</div>
            <div style={{
              padding: "5px 12px",
              background: "rgba(240,165,0,0.1)",
              border: "1px solid rgba(240,165,0,0.3)",
              borderRadius: 5,
              color: "var(--accent)",
              fontWeight: 700,
              fontSize: 15,
              minWidth: 90,
              textAlign: "center",
            }}>
              {targetAvgMmr.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="lbl">Max Deviation</div>
            <input
              type="number"
              className="form-input"
              style={{ width: 110 }}
              value={maxDeviation}
              onChange={e => setMaxDeviation(Number(e.target.value))}
            />
          </div>
          <div>
            <div className="lbl">Нужная роль</div>
            <select
              className="form-select"
              style={{ width: 120 }}
              value={neededRole}
              onChange={e => setNeededRole(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5].map(r => <option key={r} value={r}>Role {r}</option>)}
            </select>
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
                  {["#", "НИК", "MMR", "STAKE", "РОЛЬ", "STAKENORM", "MMRNORM", "ROLEFIT", "BASESCORE", "BF", "SUBSCORE", "MMR ПОСЛЕ"].map(h => (
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
                      }}>{i + 1}</span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{c.nick}</td>
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
      </div>
    </div>
  );
}
