import * as React from "react";

// skeleton shimmer (en vez de "Loading..." de texto). CSS puro, sin libs.
const CSS = `
.npt-sk { background: linear-gradient(90deg, var(--skel1) 25%, var(--skel2) 37%, var(--skel1) 63%);
  background-size: 400% 100%; animation: npt-sk 1.4s ease infinite; border-radius: 6px; }
@keyframes npt-sk { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }
@media (prefers-reduced-motion: reduce) { .npt-sk { animation: none; } }
`;

export function Bar({ w = "100%", h = 14, style }: { w?: number | string; h?: number; style?: React.CSSProperties }) {
  return <div className="npt-sk" style={{ width: w, height: h, ...style }} />;
}

// esqueleto de tabla: unas filas de barras. cols controla cuantas columnas simular.
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div>
      <style>{CSS}</style>
      <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
        {Array.from({ length: cols }).map((_, i) => <Bar key={i} w={i === 1 ? 160 : 90} h={12} />)}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
          {Array.from({ length: cols }).map((_, i) => <Bar key={i} w={i === 1 ? 160 : 90} h={14} />)}
        </div>
      ))}
    </div>
  );
}

// bloque generico (para editores como Planned/Folders)
export function BlockSkeleton() {
  return (
    <div style={{ maxWidth: 640 }}>
      <style>{CSS}</style>
      <Bar w="60%" h={16} style={{ marginBottom: 16 }} />
      <Bar w={220} h={38} style={{ marginBottom: 16 }} />
      {Array.from({ length: 5 }).map((_, i) => <Bar key={i} h={34} style={{ marginBottom: 8 }} />)}
    </div>
  );
}
