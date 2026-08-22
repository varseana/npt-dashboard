import { palette } from "../theme";
import type { NptStatus } from "../lib/npt";

// estado con color semaforo. HIBRIDO minimalista (decidido por Sean): el critico "Over" va como chip
// SOLIDO rojo (texto invertido) para que grite; el resto (On track / Near limit / No plan) va como
// SOLO TEXTO de color, sin caja ni borde. unico lugar del dashboard con color.
const MAP: Record<NptStatus, { label: string; fg: string }> = {
  ok: { label: "On track", fg: palette.ok },
  warn: { label: "Near limit", fg: palette.warn },
  bad: { label: "Over", fg: palette.bad },
  none: { label: "No plan", fg: palette.textDim },
};

export function StatusChip({ status }: { status: NptStatus }) {
  const s = MAP[status];
  if (status === "bad") {
    // critico: chip solido rojo, texto blanco.
    return (
      <span style={{
        display: "inline-block", fontSize: 17, fontWeight: 700,
        padding: "2px 10px", borderRadius: 6, color: "#ffffff", background: s.fg,
      }}>{s.label}</span>
    );
  }
  // resto: solo texto de color, sin caja.
  return <span style={{ fontSize: 17, fontWeight: 700, color: s.fg }}>{s.label}</span>;
}
