import * as React from "react";
import { AsciiReveal } from "ascii-reveal";

// wrapper de ascii-reveal para el swap skeleton -> data: mientras `loading` se ve el skeleton (Bar /
// TableSk, que la lib deja quieto), y cuando pasa a false el contenido real se decodifica de glyphs a
// texto en una ola desde arriba-izquierda (~400 ms) en vez de aparecer de golpe. sin shimmer propio
// (el skeleton ya lo tiene) y sin reveal al montar (solo anima la transicion de carga).
// `fill`: el wrapper hereda la cadena de alto (flex column + minHeight 0) para vistas cuya raiz es
// PinnedView o una columna flex de 100%, asi el cuerpo sigue scrolleando adentro y no la pagina.
const FILL: React.CSSProperties = { display: "flex", flexDirection: "column", flex: "1 1 auto", height: "100%", minHeight: 0 };
export default function Decode({ loading, children, fill, style }:
  { loading: boolean; children: React.ReactNode; fill?: boolean; style?: React.CSSProperties }) {
  return (
    <AsciiReveal loading={loading} revealOnMount={false} shimmer={false} preset="decode" origin="top-left"
      style={fill ? { ...FILL, ...style } : style}>
      {children}
    </AsciiReveal>
  );
}
