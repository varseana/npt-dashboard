import * as React from "react";
import { palette } from "../theme";

// modal de confirmacion reusable para acciones DESTRUCTIVAS (borrar folder, quitar miembro, etc.).
// click en el backdrop o en Cancel cierra; Confirm ejecuta. El boton de confirmar es rojo.
// confirmDisabled: deja el boton apagado hasta que el body este completo (ej. elegir un team destino).
export function ConfirmDialog({ title, body, confirmLabel = "Delete", confirmDisabled = false, onCancel, onConfirm }: {
  title: string; body: React.ReactNode; confirmLabel?: string; confirmDisabled?: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: palette.panel, border: `1px solid ${palette.border}`, borderRadius: 0, padding: 24, width: 420, maxWidth: "90vw" }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 27, color: palette.text }}>{title}</h2>
        {/* div (no <p>): el body puede traer bloques como un Dropdown */}
        <div style={{ margin: "0 0 20px", color: palette.textDim, fontSize: 18, lineHeight: 1.5 }}>{body}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onCancel} style={{ background: palette.panel, color: palette.text, border: `1px solid ${palette.border}`, borderRadius: 0, padding: "8px 14px", fontSize: 17, cursor: "pointer" }}>Cancel</button>
          <button onClick={onConfirm} disabled={confirmDisabled} style={{ background: palette.bad, color: "#ffffff", border: "none", borderRadius: 0, padding: "8px 14px", fontSize: 17, cursor: confirmDisabled ? "default" : "pointer", fontWeight: 600, opacity: confirmDisabled ? 0.5 : 1 }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
