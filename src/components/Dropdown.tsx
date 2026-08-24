import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Dropdown custom (estilo D3) que reemplaza al <select> nativo. Se hizo propio porque el <select>
// nativo NO deja controlar el popup. Detalles:
//  - abre SIEMPRE hacia abajo; el panel tiene el MISMO ancho que el trigger.
//  - el panel va con position:fixed y createPortal(document.body): asi NUNCA lo recorta un
//    overflow:hidden de una tabla ni lo descoloca un `transform` de un ancestro (ej. el pull-to-reveal).
//  - sin caja en el trigger; chevron grueso a la izquierda; fondo achaflanado en hover/abierto.
// Cierra por click-afuera o Escape; flechas navegan. Props: fill (ocupa 100% del contenedor, para
// celdas de tabla), disabled, title.
interface Opt { value: string; label: string; }
interface Props {
  value: string;
  onChange: (v: string) => void;
  options: Opt[];
  minWidth?: number;
  ariaLabel?: string;
  fill?: boolean;
  disabled?: boolean;
  title?: string;
}

export function Dropdown({ value, onChange, options, minWidth = 0, ariaLabel, fill, disabled, title }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const trigRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  // ubica el panel debajo del trigger, mismo ancho, sin salirse del viewport (clamp horizontal)
  const place = () => {
    const r = trigRef.current?.getBoundingClientRect();
    if (!r) return;
    const m = 8;
    let left = r.left;
    if (left + r.width > window.innerWidth - m) left = window.innerWidth - m - r.width;
    if (left < m) left = m;
    setPos({ top: r.bottom + 4, left, width: r.width });
  };
  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    place();
    const on = () => place();
    window.addEventListener("scroll", on, true);
    window.addEventListener("resize", on);
    return () => { window.removeEventListener("scroll", on, true); window.removeEventListener("resize", on); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setOpen(false); return; }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const i = options.findIndex((o) => o.value === value);
        const n = e.key === "ArrowDown" ? Math.min(options.length - 1, i + 1) : Math.max(0, i - 1);
        if (options[n]) onChange(options[n].value);
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open, options, value, onChange]);

  function pick(v: string) { onChange(v); setOpen(false); }

  return (
    <div ref={wrapRef} className={open ? "npt-dd2 npt-dd2-open" : "npt-dd2"} style={{ minWidth, width: fill ? "100%" : undefined }}>
      <button ref={trigRef} type="button" className="npt-dd2-trigger" disabled={disabled} title={title}
        onClick={() => { if (!disabled) setOpen((o) => !o); }} aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel}>
        <span className="npt-dd2-arrow" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round"><path d="M5 9l7 7 7-7" /></svg>
        </span>
        <span className="npt-dd2-label">{selected ? selected.label : ""}</span>
      </button>
      {open && createPortal(
        <div ref={panelRef} className="npt-dd2-panel" role="listbox"
          style={{ position: "fixed", top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: pos?.width, visibility: pos ? "visible" : "hidden" }}>
          {options.map((o) => (
            <button type="button" key={o.value} role="option" aria-selected={o.value === value}
              className={o.value === value ? "npt-dd2-opt npt-dd2-opt-sel" : "npt-dd2-opt"}
              onClick={() => pick(o.value)}>
              {o.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
