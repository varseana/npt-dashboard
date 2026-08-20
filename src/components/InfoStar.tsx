import * as React from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { palette } from "../theme";
import { IconX } from "./icons";

// asterisco SVG simetrico (8 puntas, centrado en el viewBox) -> gira sobre su propio eje
// en loop perfecto sin tirones. la animacion vive en .npt-aster (index.html).
export function AsterMark({ size = 11, active = false, spin = true }: { size?: number; active?: boolean; spin?: boolean }) {
  return (
    // highlighted (color de texto full) cuando su card esta abierta: hover, click-fijado, o abierto.
    // spin=false -> asterisco FLAT (no gira), para casos chicos como headers de columna.
    <span className={spin ? "npt-aster" : undefined} style={{ display: "inline-flex", color: active ? palette.text : palette.textDim }}>
      <svg viewBox="0 0 24 24" width={size} height={size} style={{ display: "block" }} aria-hidden="true">
        <g stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
          <line x1="12" y1="3" x2="12" y2="21" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="5.6" y1="5.6" x2="18.4" y2="18.4" />
          <line x1="18.4" y1="5.6" x2="5.6" y2="18.4" />
        </g>
      </svg>
    </span>
  );
}

// texto tipo hyperlink (bold + subrayado, monocromatico) que dispara una accion (navegar de tab).
export function StoryLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <span
      role="link"
      tabIndex={0}
      className="npt-storylink"
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      style={{ fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 3, color: palette.text, cursor: "pointer" }}
    >
      {children}
    </span>
  );
}

// asterisco giratorio + popover de storytelling.
// interaccion: HOVER lo muestra y al salir se quita al instante; CLICK en el asterisco lo FIJA
// (queda abierto aunque saques el hover) y otro click lo cierra; la X del cuadro tambien lo cierra.
// el cuadro se reubica solo (flip vertical + clamp horizontal) para no salirse NUNCA del viewport.
export function InfoStar({ children, size = 11, spin = true, pages }:
  { children?: React.ReactNode; size?: number; spin?: boolean; pages?: React.ReactNode[] }) {
  const [open, setOpen] = useState(false);
  const [locked, setLocked] = useState(false);   // fijado por click: ignora el hover-out
  const [page, setPage] = useState(0);            // pagina actual (solo si se pasan `pages`)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const trigRef = useRef<HTMLSpanElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // al cerrar, volver a la primera pagina
  useEffect(() => { if (!open) setPage(0); }, [open]);

  // calcula top/left en coords de viewport (position: fixed) sin dejar que se corte.
  const place = () => {
    const trig = trigRef.current?.getBoundingClientRect();
    if (!trig) return;
    const box = boxRef.current;
    const w = box?.offsetWidth ?? 300;
    const h = box?.offsetHeight ?? 120;
    const m = 8; // margen contra el borde de la ventana
    let left = trig.left;
    if (left + w > window.innerWidth - m) left = window.innerWidth - m - w;
    if (left < m) left = m;
    let top = trig.bottom + 6;
    // si abajo no cabe, la ponemos ARRIBA del asterisco
    if (top + h > window.innerHeight - m) {
      const above = trig.top - h - 6;
      top = above >= m ? above : Math.max(m, window.innerHeight - m - h);
    }
    setPos({ top, left });
  };

  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    place();
    const on = () => place();
    window.addEventListener("scroll", on, true);
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on, true);
      window.removeEventListener("resize", on);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, page]);

  // cierre por hover: NO cierra si esta fijado, y usa un pequeño puente (120ms) para poder viajar
  // del asterisco al card (a clickear el hyperlink) sin que se cierre en el hueco. entrar al
  // asterisco O al card cancela el cierre; salir de ambos lo dispara.
  const closeT = useRef<number | undefined>(undefined);
  const cancelClose = () => { if (closeT.current) { clearTimeout(closeT.current); closeT.current = undefined; } };
  const scheduleClose = () => { if (locked) return; cancelClose(); closeT.current = window.setTimeout(() => setOpen(false), 120); };
  useEffect(() => () => cancelClose(), []);

  const onEnter = () => { cancelClose(); setOpen(true); };
  const onLeave = () => scheduleClose();
  // toggle de fijado: si esta fijo lo suelta y cierra; si no, lo fija abierto
  const toggle = () => { cancelClose(); if (locked) { setLocked(false); setOpen(false); } else { setLocked(true); setOpen(true); } };
  const close = () => { cancelClose(); setLocked(false); setOpen(false); };

  return (
    <span
      ref={trigRef}
      role="button"
      tabIndex={0}
      aria-label="More info"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      onClick={(e) => { e.stopPropagation(); toggle(); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }}
      style={{ display: "inline-block", verticalAlign: "super", marginLeft: 3, cursor: "pointer", lineHeight: 0 }}
    >
      <AsterMark size={size} active={open} spin={spin} />
      {open && (
        <div
          ref={boxRef}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: pos?.top ?? -9999,
            left: pos?.left ?? -9999,
            visibility: pos ? "visible" : "hidden",
            zIndex: 60,
            width: "min(300px, calc(100vw - 16px))",
            background: palette.bg,                       // mismo color que el fondo de la pagina (light y dark)
            border: `2px solid ${palette.text}`,          // linea gruesa alrededor de TODO el cuadro
            borderRadius: 0,
            padding: "12px 14px",
            fontSize: 15,
            lineHeight: 1.5,
            fontWeight: 400,
            color: palette.textDim,
            boxShadow: "none",
            textAlign: "left",
            whiteSpace: "normal",   // que envuelva SIEMPRE, aunque este dentro de una tabla con nowrap
            cursor: "auto",
          }}
        >
          {/* X: hover -> roja (.npt-close), click cierra solo esta card */}
          <button
            className="npt-close"
            onClick={(e) => { e.stopPropagation(); close(); }}
            aria-label="Close"
            title="Close"
            style={{ position: "absolute", top: 6, right: 6, background: "transparent", border: "none", cursor: "pointer", padding: 2, lineHeight: 0, display: "inline-flex" }}
          >
            <IconX size={13} />
          </button>
          <div style={{ paddingRight: 16 }}>{pages ? pages[Math.min(page, pages.length - 1)] : children}</div>
          {pages && pages.length > 1 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 8, borderTop: `1px solid ${palette.border}` }}>
              <span style={{ fontSize: 13, color: palette.textDim }}>{page + 1} / {pages.length}</span>
              <span style={{ display: "flex", gap: 14 }}>
                {page > 0 && (
                  <button type="button" className="npt-storylink" style={pgBtn}
                    onClick={(e) => { e.stopPropagation(); setPage((p) => Math.max(0, p - 1)); }}>Back</button>
                )}
                {page < pages.length - 1 && (
                  <button type="button" className="npt-storylink" style={pgBtn}
                    onClick={(e) => { e.stopPropagation(); setPage((p) => Math.min(pages.length - 1, p + 1)); }}>Next</button>
                )}
              </span>
            </div>
          )}
        </div>
      )}
    </span>
  );
}

const pgBtn: React.CSSProperties = {
  background: "transparent", border: "none", padding: 0, cursor: "pointer",
  fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 3, color: palette.text, fontSize: 13,
};
