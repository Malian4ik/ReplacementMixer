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
      {/* Background decorations */}
      <div style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
        {/* Big glow orbs */}
        <div style={{ position: "absolute", top: "-10%", left: "15%", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(0,212,232,0.06) 0%, transparent 70%)" }} />
        <div style={{ position: "absolute", bottom: "-5%", right: "10%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(0,212,232,0.04) 0%, transparent 70%)" }} />

        {/* Role labels — scattered */}
        {[
          { label: "CARRY", sub: "Position 1", x: "8%", y: "18%" },
          { label: "MID", sub: "Position 2", x: "82%", y: "12%" },
          { label: "OFFLANE", sub: "Position 3", x: "6%", y: "72%" },
          { label: "SOFT SUP", sub: "Position 4", x: "78%", y: "68%" },
          { label: "HARD SUP", sub: "Position 5", x: "44%", y: "88%" },
        ].map(({ label, sub, x, y }) => (
          <div key={label} style={{ position: "absolute", left: x, top: y, opacity: 0.18 }}>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.15em", color: "var(--accent)", textTransform: "uppercase" }}>{label}</div>
            <div style={{ fontSize: 9, color: "var(--text-secondary)", letterSpacing: "0.08em" }}>{sub}</div>
          </div>
        ))}

        {/* Stat lines */}
        {[
          { label: "SubScore", val: "0.8741", x: "3%", y: "42%" },
          { label: "RoleFit", val: "1.000", x: "80%", y: "38%" },
          { label: "BalanceFactor", val: "0.923", x: "3%", y: "55%" },
          { label: "Target MMR", val: "9 000", x: "79%", y: "50%" },
        ].map(({ label, val, x, y }) => (
          <div key={label} style={{ position: "absolute", left: x, top: y, opacity: 0.13, fontFamily: "monospace" }}>
            <span style={{ fontSize: 9, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label} </span>
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)" }}>{val}</span>
          </div>
        ))}

        {/* Corner brand watermark */}
        <div style={{ position: "absolute", bottom: 24, left: 32, opacity: 0.12 }}>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: "0.1em", color: "var(--accent)", fontStyle: "italic", textTransform: "uppercase", lineHeight: 1 }}>MIXERCUP</div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.3em", color: "var(--text-secondary)", textTransform: "uppercase", marginTop: 2 }}>SERIES · DOTA 2 TOURNAMENT</div>
        </div>
        <div style={{ position: "absolute", top: 24, right: 32, opacity: 0.1, textAlign: "right" }}>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: "0.1em", color: "var(--accent)", fontStyle: "italic", textTransform: "uppercase", lineHeight: 1 }}>MIXER</div>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: "0.1em", color: "var(--accent)", fontStyle: "italic", textTransform: "uppercase", lineHeight: 1 }}>CUP</div>
        </div>

        {/* Thin horizontal grid lines */}
        {[20, 40, 60, 80].map(pct => (
          <div key={pct} style={{ position: "absolute", left: 0, right: 0, top: `${pct}%`, height: 1, background: "rgba(0,212,232,0.04)" }} />
        ))}
      </div>

      <div style={{ ...cardStyle, position: "relative", zIndex: 1 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 26, fontWeight: 900, color: "var(--accent)", letterSpacing: "0.08em", textTransform: "uppercase", textShadow: "0 0 20px rgba(0,212,232,0.4)", lineHeight: 1 }}>MixerCup</div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.25em", color: "var(--text-secondary)", textTransform: "uppercase", marginTop: 3, marginBottom: 10 }}>Series</div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(0,212,232,0.07)", border: "1px solid rgba(0,212,232,0.15)", borderRadius: 4, padding: "3px 10px" }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--accent)", boxShadow: "0 0 6px var(--accent)" }} />
            <span style={{ fontSize: 10, color: "var(--text-secondary)", letterSpacing: "0.08em", fontWeight: 600 }}>DOTA 2 TOURNAMENT</span>
          </div>
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
const cardStyle: React.CSSProperties = { width: "100%", maxWidth: 380, background: "var(--bg-card)", border: "1px solid rgba(0,212,232,0.15)", borderRadius: 12, padding: "32px 28px", boxShadow: "0 0 40px rgba(0,212,232,0.06)" };
