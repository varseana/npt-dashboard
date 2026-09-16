import * as React from "react";

// layout reusable: cabeza FIJA + cuerpo con scroll propio. la pagina (window) no scrollea; solo
// este cuerpo interno lo hace. requiere que el padre le de altura (flex:1 + minHeight:0 en el shell).
// - head: lo que queda pineado (selector de semana, budget card, stats, toolbar, etc.).
// - children: lo unico que scrollea (la tabla de nombres).
// el trick de `minHeight:0` en el flex column es lo que deja que el hijo con overflow realmente
// pueda encoger y scrollear en vez de empujar la altura hacia afuera.
export default function PinnedView({ head, children }:
  { head?: React.ReactNode; children: React.ReactNode }) {
  return (
    // flex:"1 1 auto" llena contenedores flex-column (Region B, columna derecha de las vistas 2-col)
    // sin depender de que un height:100% resuelva contra un padre con alto no-definido; height:100%
    // cubre el caso de un padre bloque con alto definido. minHeight:0 deja que el cuerpo scrollee.
    <div style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", height: "100%", minHeight: 0 }}>
      {head != null && <div style={{ flex: "0 0 auto" }}>{head}</div>}
      <div className="npt-scroll" style={{ flex: "1 1 auto", minHeight: 0, overflow: "auto" }}>
        {children}
      </div>
    </div>
  );
}
