"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SetupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch("/api/setup").then(r => r.json()).then(d => {
      if (d.hasOwner) router.replace("/login");
      else setChecking(false);
    });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();
    if (res.ok) router.replace("/judge");
    else { setError(data.error); setLoading(false); }
  }

  if (checking) return <div style={pageStyle}><div style={{ color: "var(--text-secondary)" }}>Загрузка...</div></div>;

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--accent)", marginBottom: 4 }}>MixerCup</div>
          <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>Первоначальная настройка</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>Создайте аккаунт владельца</div>
        </div>
        <form onSubmit={handleSubmit}>
          <Field label="Ваше имя"><input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Иван Иванов" required /></Field>
          <Field label="Email"><input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@example.com" required /></Field>
          <Field label="Пароль (мин. 6 символов)"><input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)} required /></Field>
          {error && <div style={{ color: "#f87171", fontSize: 12, marginBottom: 12 }}>{error}</div>}
          <button className="btn btn-accent" style={{ width: "100%", justifyContent: "center", padding: "10px 0" }} disabled={loading}>
            {loading ? "Создаю..." : "Создать аккаунт владельца"}
          </button>
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
