"use client";
import { useState } from "react";
import Link from "next/link";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();
    if (res.ok) setSuccess(true);
    else { setError(data.error); setLoading(false); }
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--accent)", marginBottom: 4 }}>MixerCup</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Запрос доступа</div>
        </div>
        {success ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Заявка отправлена</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20 }}>
              Ваш аккаунт создан. Ожидайте подтверждения от администратора.
            </div>
            <Link href="/login" style={{ color: "var(--accent)", fontSize: 13 }}>← Вернуться ко входу</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <Field label="Ваше имя"><input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Иван Иванов" required /></Field>
            <Field label="Email"><input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required /></Field>
            <Field label="Пароль (мин. 6 символов)"><input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)} required /></Field>
            {error && <div style={{ color: "#f87171", fontSize: 12, marginBottom: 12 }}>{error}</div>}
            <button className="btn btn-accent" style={{ width: "100%", justifyContent: "center", padding: "10px 0", marginBottom: 12 }} disabled={loading}>
              {loading ? "Отправка..." : "Отправить заявку"}
            </button>
            <div style={{ textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>
              Уже есть доступ? <Link href="/login" style={{ color: "var(--accent)" }}>Войти</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 14 }}><label style={{ display: "block", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-secondary)", marginBottom: 6 }}>{label}</label>{children}</div>;
}

const pageStyle: React.CSSProperties = { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-base)", padding: 16 };
const cardStyle: React.CSSProperties = { width: "100%", maxWidth: 380, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "32px 28px" };
