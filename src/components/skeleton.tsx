import * as React from "react";
import { AsciiSkeleton } from "ascii-reveal";

// skeleton shimmer (en vez de "Loading..." de texto). el CSS de abajo queda para .npt-sk legacy; Bar usa ascii-reveal.
const CSS = `
.npt-sk { background: linear-gradient(90deg, var(--skel1) 25%, var(--skel2) 37%, var(--skel1) 63%);
  background-size: 400% 100%; animation: npt-sk 1.4s ease infinite; border-radius: 6px; }
@keyframes npt-sk { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }
@media (prefers-reduced-motion: reduce) { .npt-sk { animation: none; } }
`;

// Bar = bloque de glyphs dither (ascii-reveal) en vez de la barra gris. filas de ~12px escaladas a `h`
// para que el bloque ocupe EXACTO el mismo alto que antes (los skeletons siguen siendo 1:1). radio 0
// como el resto del sistema, salvo que el caller pase borderRadius (ej. chips de Folders).
// la lib dibuja 96 glyphs por fila (~58em): alcanza para anchos en px, pero un ancho en % ("100%")
// puede ser mas ancho que eso, asi que ahi se encadenan tiles dentro de un wrapper que recorta.
const COLS_EM = 96 * 0.6;
export function Bar({ w = "100%", h = 14, style }: { w?: number | string; h?: number; style?: React.CSSProperties }) {
  const rows = Math.max(1, Math.round(h / 12));
  const fs = h / rows;
  const { borderRadius, ...rest } = style || {};
  const radius = borderRadius !== undefined ? (typeof borderRadius === "number" ? `${borderRadius}px` : borderRadius) : 0;
  const seed = Math.round(h * 7 + (typeof w === "number" ? w : 0));
  const tile = (key: number, width: number | string) => (
    <AsciiSkeleton key={key} variant="dither" rows={rows} width={width} height={h} seed={seed + key * 31}
      style={{ fontSize: fs, flex: "0 0 auto", "--ars-radius": radius } as React.CSSProperties} />
  );
  if (typeof w === "number") return <span style={{ display: "block", width: w, height: h, ...rest }}>{tile(0, w)}</span>;
  return (
    <span style={{ display: "flex", width: w, height: h, overflow: "hidden", borderRadius: radius, ...rest }}>
      {[0, 1, 2].map((i) => tile(i, COLS_EM * fs))}
    </span>
  );
}

// marco de esquinas (mismo patron .npt-bracket que las cards reales), para skeletons 1:1
export function BracketFrame({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ position: "relative", padding: "18px 22px", boxSizing: "border-box", ...style }}>
      <span className="npt-bracket tl" /><span className="npt-bracket tr" /><span className="npt-bracket bl" /><span className="npt-bracket br" />
      {children}
    </div>
  );
}

// tabla skeleton por COLUMNAS: `template` = gridTemplateColumns (mismas proporciones que la tabla
// real, ej "40px 2fr 1fr 1fr 90px 40px"). header (barras finas) + N filas. boxed = con caja bordeada.
export function TableSk({ template, rows = 6, boxed = false }: { template: string; rows?: number; boxed?: boolean }) {
  const cols = template.trim().split(/\s+/).length;
  const line = (h: number, w: number, key: React.Key) => (
    <div key={key} style={{ display: "grid", gridTemplateColumns: template, gap: 12, padding: "11px 12px",
      borderBottom: "1px solid var(--border)", alignItems: "center" }}>
      {Array.from({ length: cols }).map((_, i) => <Bar key={i} w={`${w}%`} h={h} />)}
    </div>
  );
  const inner = (
    <div>
      <style>{CSS}</style>
      {line(12, 60, "h")}
      {Array.from({ length: rows }).map((_, r) => line(16, 80, r))}
    </div>
  );
  return boxed ? <div style={{ border: "1px solid var(--border)", borderRadius: 0, overflow: "hidden" }}>{inner}</div> : inner;
}
