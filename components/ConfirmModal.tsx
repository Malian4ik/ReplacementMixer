"use client";

interface Props {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  danger?: boolean;
}

export function ConfirmModal({ message, onConfirm, onCancel, confirmLabel = "Подтвердить", danger = true }: Props) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--bg-card)",
          border: "1px solid rgba(0,212,232,0.25)",
          borderRadius: 10,
          padding: "24px 28px",
          maxWidth: 400,
          width: "90%",
          boxShadow: "0 0 40px rgba(0,0,0,0.6), 0 0 20px rgba(0,212,232,0.08)",
        }}
      >
        <div style={{
          fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5, marginBottom: 20,
        }}>
          {message}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 12, padding: "5px 16px" }}
            onClick={onCancel}
          >
            Отмена
          </button>
          <button
            className={`btn btn-sm ${danger ? "btn-danger" : "btn-accent"}`}
            style={{ fontSize: 12, padding: "5px 16px", fontWeight: 700 }}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
