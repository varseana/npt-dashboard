import * as React from "react";
import { palette } from "../theme";
import type { NptStatus } from "../lib/npt";
import { InfoStar } from "./InfoStar";
import { DotmCircular3 } from "./dotmatrix/dotm-circular-3";   // Plasma Veil
import { DotmCircular4 } from "./dotmatrix/dotm-circular-4";   // Radar Arc

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

// ===== DotStatus: cluster de 9 puntos que laten, color por estado. reemplaza el texto del status en
// el card "Team // weekly NPT threshold". Al hover, el popover LIVE (InfoStar) explica cada color. =====
const DOT_COLOR: Record<NptStatus, string> = {
  ok: "var(--ok)", warn: "var(--warn)", bad: "var(--bad)", none: "var(--textDim)",
};

// loader dot-matrix del registry @dotmatrix, tenido por status. En cada CARGA de pagina sale uno de
// los dos al azar (pick a nivel de modulo: estable durante la sesion, re-roll al recargar).
const StatusLoader = Math.random() < 0.5 ? DotmCircular4 : DotmCircular3;
function DotCluster({ color }: { color: string }) {
  return (
    <span aria-hidden="true" style={{ display: "inline-flex", color }}>
      <StatusLoader color={color} size={22} dotSize={3} />
    </span>
  );
}

function LegendRow({ color, label, children }: { color: string; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 9 }}>
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: color, marginTop: 3, flex: "0 0 auto" }} />
      <span>
        <span style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", fontSize: 13, color }}>{label}</span>
        <span style={{ display: "block", color: palette.textDim, fontSize: 12.5, lineHeight: 1.4, marginTop: 1 }}>{children}</span>
      </span>
    </div>
  );
}

const DOT_LEGEND = (
  <>
    <div style={{ fontSize: 12, letterSpacing: ".06em", textTransform: "uppercase", color: palette.textDim, marginBottom: 10 }}>What the color means</div>
    <LegendRow color={palette.ok} label="On track">The team is comfortably within its weekly NPT threshold.</LegendRow>
    <LegendRow color={palette.warn} label="Near limit">Close to the threshold. Keep an eye on non-essential NPT.</LegendRow>
    <LegendRow color={palette.bad} label="Over">The team has gone over its weekly threshold.</LegendRow>
  </>
);

export function DotStatus({ status }: { status: NptStatus }) {
  return <InfoStar spin={false} trigger={<DotCluster color={DOT_COLOR[status]} />}>{DOT_LEGEND}</InfoStar>;
}
