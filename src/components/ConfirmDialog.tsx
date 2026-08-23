import * as React from "react";
import { palette } from "../theme";

// modal de confirmacion reusable para acciones DESTRUCTIVAS (borrar folder, quitar miembro, etc.).
// click en el backdrop o en Cancel cierra; Confirm ejecuta. El boton de confirmar es rojo.
export function ConfirmDialog({ title, body, confirmLabel = "Delete", onCancel, onConfirm }: {
  title: string; body: React.ReactNode; confirmLabel?: string; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: palette.panel, border: `1px solid ${palette.border}`, borderRadius: 12, padding: 24, width: 420, maxWidth: "90vw" }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 27, color: palette.text }}>{title}</h2>
        <p style={{ margin: "0 0 20px", color: palette.textDim, fontSize: 18, lineHeight: 1.5 }}>{body}</p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onCancel} style={{ background: palette.panel, color: palette.text, border: `1px solid ${palette.border}`, borderRadius: 8, padding: "8px 14px", fontSize: 17, cursor: "pointer" }}>Cancel</button>
          <button onClick={onConfirm} style={{ background: palette.bad, color: "#ffffff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 17, cursor: "pointer", fontWeight: 600 }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
