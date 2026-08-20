import * as React from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { palette } from "../theme";

// asterisco SVG simetrico (8 puntas, centrado en el viewBox) -> gira sobre su propio eje
// en loop perfecto sin tirones. la animacion vive en .npt-aster (index.html).
export function AsterMark({ size = 11 }: { size?: number }) {
  return (
    <span className="npt-aster" style={{ display: "inline-flex", color: palette.textDim }}>
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

// asterisco giratorio + popover de storytelling. abre por hover o click; se cierra 2s despues
// de que el mouse sale de la caja. se reubica solo (flip vertical + clamp horizontal) para no
// salirse NUNCA del viewport.
export function InfoStar({ children, size = 11 }: { children: React.ReactNode; size?: number }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const trigRef = useRef<HTMLSpanElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const closeT = useRef<number | undefined>(undefined);

  const cancelClose = () => { if (closeT.current) { clearTimeout(closeT.current); closeT.current = undefined; } };
  const scheduleClose = () => { cancelClose(); closeT.current = window.setTimeout(() => setOpen(false), 2000); };
  useEffect(() => () => cancelClose(), []);

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
  }, [open]);

  return (
    <span
      ref={trigRef}
      role="button"
      tabIndex={0}
      aria-label="More info"
      onMouseEnter={() => { cancelClose(); setOpen(true); }}
      onMouseLeave={scheduleClose}
      onFocus={() => { cancelClose(); setOpen(true); }}
      onBlur={scheduleClose}
      onClick={(e) => { e.stopPropagation(); cancelClose(); setOpen(true); }}
      style={{ display: "inline-block", verticalAlign: "super", marginLeft: 3, cursor: "help", lineHeight: 0 }}
    >
      <AsterMark size={size} />
      {open && (
        <div
          ref={boxRef}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: pos?.top ?? -9999,
            left: pos?.left ?? -9999,
            visibility: pos ? "visible" : "hidden",
            zIndex: 60,
            width: "min(300px, calc(100vw - 16px))",
            background: palette.panel,
            border: `1px solid ${palette.border}`,
            borderTop: `2px solid ${palette.text}`,
            borderRadius: 0,
            padding: "12px 14px",
            fontSize: 15,
            lineHeight: 1.5,
            fontWeight: 400,
            color: palette.textDim,
            boxShadow: "none",
            textAlign: "left",
            cursor: "auto",
          }}
        >
          {children}
        </div>
      )}
    </span>
  );
}
