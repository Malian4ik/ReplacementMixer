"use client";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@/components/UserContext";
import { useRouter } from "next/navigation";
import { ConfirmModal } from "@/components/ConfirmModal";

interface AdminUser { id: string; email: string; name: string; role: string; isApproved: number; createdAt: string; }

const ROLES = ["OWNER", "JUDGE", "MARKETING", "VIEWER", "PENDING"];

const ROLE_BADGE: Record<string, React.CSSProperties> = {
  OWNER:     { background: "rgba(240,165,0,0.15)",  color: "#f0a500", border: "1px solid rgba(240,165,0,0.3)" },
  JUDGE:     { background: "rgba(52,211,153,0.12)", color: "#34d399", border: "1px solid rgba(52,211,153,0.3)" },
  MARKETING: { background: "rgba(217,70,239,0.12)", color: "#e879f9", border: "1px solid rgba(217,70,239,0.3)" },
  VIEWER:    { background: "rgba(96,165,250,0.12)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.3)" },
  PENDING:   { background: "rgba(100,116,139,0.12)",color: "#94a3b8", border: "1px solid rgba(100,116,139,0.3)" },
};

export default function AdminUsersPage() {
  const { user } = useUser();
  const router = useRouter();
  const qc = useQueryClient();

  useEffect(() => {
    if (user && user.role !== "OWNER") router.replace("/judge");
  }, [user, router]);

  const { data: users = [], isLoading } = useQuery<AdminUser[]>({
    queryKey: ["admin-users"],
    queryFn: () => fetch("/api/admin/users").then(r => r.json()),
    enabled: user?.role === "OWNER",
  });

  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null);

  const patchMutation = useMutation({
    mutationFn: ({ id, role, isApproved }: { id: string; role?: string; isApproved?: boolean }) =>
      fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, isApproved }),
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/admin/users/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  return (
    <>
    {confirmState && <ConfirmModal message={confirmState.message} onConfirm={confirmState.onConfirm} onCancel={() => setConfirmState(null)} />}
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div className="page-header">
        <div className="page-title">Управление пользователями</div>
        <div className="page-subtitle">{users.length} пользователей · только OWNER</div>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "16px 24px" }}>
        {isLoading ? (
          <div style={{ color: "var(--text-secondary)", textAlign: "center", padding: 40 }}>Загрузка...</div>
        ) : (
          <div className="card" style={{ overflow: "hidden" }}>
            <table className="tbl">
              <thead>
                <tr>{["ИМЯ", "EMAIL", "РОЛЬ", "СТАТУС", "ДАТА", "ДЕЙСТВИЯ"].map(h => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.name}</td>
                    <td style={{ color: "var(--text-secondary)", fontSize: 12 }}>{u.email}</td>
                    <td>
                      <select
                        value={u.role}
                        onChange={e => patchMutation.mutate({ id: u.id, role: e.target.value })}
                        style={{ background: "rgba(0,0,0,0.4)", border: "1px solid var(--border-light)", color: "var(--text-primary)", borderRadius: 4, padding: "3px 6px", fontSize: 12 }}
                      >
                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, ...ROLE_BADGE[u.role] }}>
                        {u.role}
                      </span>
                    </td>
                    <td style={{ fontSize: 11, color: "var(--text-secondary)" }}>{u.createdAt?.slice(0, 10)}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        {!u.isApproved ? (
                          <button className="btn btn-sm btn-success" onClick={() => patchMutation.mutate({ id: u.id, isApproved: true, role: "JUDGE" })}>
                            ✓ Одобрить
                          </button>
                        ) : (
                          <button className="btn btn-sm btn-danger" onClick={() => patchMutation.mutate({ id: u.id, isApproved: false })}>
                            Заблокировать
                          </button>
                        )}
                        <div style={{ width: 1, height: 20, background: "var(--border)", alignSelf: "center", margin: "0 2px" }} />
                        <button
                          className="btn btn-sm"
                          style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}
                          onClick={() => setConfirmState({ message: `Удалить пользователя ${u.name} (${u.email})?`, onConfirm: () => { deleteMutation.mutate(u.id); setConfirmState(null); } })}
                        >
                          Удалить
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--text-muted)", padding: 32 }}>Нет пользователей</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
