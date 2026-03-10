"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (res.ok) { window.location.href = "/judge"; }
    else { setError(data.error); setLoading(false); }
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--accent)", marginBottom: 4 }}>MixerCup</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Replacement Manager</div>
        </div>
        <form onSubmit={handleSubmit}>
          <Field label="Email"><input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required autoFocus /></Field>
          <Field label="Пароль"><input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)} required /></Field>
          {error && <div style={{ color: "#f87171", fontSize: 12, marginBottom: 12, padding: "8px 10px", background: "rgba(248,113,113,0.08)", borderRadius: 6 }}>{error}</div>}
          <button className="btn btn-accent" style={{ width: "100%", justifyContent: "center", padding: "10px 0", marginBottom: 12 }} disabled={loading}>
            {loading ? "Вход..." : "Войти"}
          </button>
          <div style={{ textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>
            Нет аккаунта? <Link href="/register" style={{ color: "var(--accent)" }}>Запрос доступа</Link>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 14 }}><label style={{ display: "block", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-secondary)", marginBottom: 6 }}>{label}</label>{children}</div>;
}

const pageStyle: React.CSSProperties = { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-base)", padding: 16 };
const cardStyle: React.CSSProperties = { width: "100%", maxWidth: 380, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "32px 28px" };
