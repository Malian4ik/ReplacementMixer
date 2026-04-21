export function MatchBadge({ count }: { count: number }) {
  if (count === 0) return <span style={{ color: "var(--text-muted)", fontSize: 11 }}>—</span>;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      background: "rgba(99,102,241,0.12)",
      border: "1px solid rgba(99,102,241,0.3)",
      color: "#818cf8",
      borderRadius: 4,
      padding: "1px 6px",
      fontSize: 11,
      fontWeight: 700,
      fontFamily: "monospace",
    }}>
      ▶ {count}
    </span>
  );
}
