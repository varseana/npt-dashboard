import { useEffect, useRef, useState } from "react";

// Dropdown custom (estilo D3) que reemplaza al <select> nativo. Se hizo propio porque el <select>
// nativo NO deja controlar el popup: el navegador lo dibuja con su ancho (= al texto) y puede abrir
// hacia arriba. Con este componente:
//  - abre SIEMPRE hacia abajo (panel top:100%).
//  - el panel tiene el MISMO ancho que el trigger (wrapper inline-block + panel left:0/right:0).
//  - sin caja en el trigger; chevron grueso a la izquierda; fondo achaflanado en hover/abierto.
// Estilos en index.html (.npt-dd2*). Cierra al clickear afuera o con Escape; flechas navegan.
interface Opt { value: string; label: string; }
interface Props {
  value: string;
  onChange: (v: string) => void;
  options: Opt[];
  minWidth?: number;                 // fija el ancho minimo (trigger Y panel) para que las opciones no se corten
  ariaLabel?: string;
}

export function Dropdown({ value, onChange, options, minWidth = 0, ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setOpen(false); return; }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const i = options.findIndex((o) => o.value === value);
        const next = e.key === "ArrowDown" ? Math.min(options.length - 1, i + 1) : Math.max(0, i - 1);
        if (options[next]) onChange(options[next].value);
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open, options, value, onChange]);

  function pick(v: string) { onChange(v); setOpen(false); }

  return (
    <div ref={wrapRef} className={open ? "npt-dd2 npt-dd2-open" : "npt-dd2"} style={{ minWidth }}>
      <button type="button" className="npt-dd2-trigger" onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel}>
        <span className="npt-dd2-arrow" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round"><path d="M5 9l7 7 7-7" /></svg>
        </span>
        <span className="npt-dd2-label">{selected ? selected.label : ""}</span>
      </button>
      {open && (
        <div className="npt-dd2-panel" role="listbox">
          {options.map((o) => (
            <button type="button" key={o.value} role="option" aria-selected={o.value === value}
              className={o.value === value ? "npt-dd2-opt npt-dd2-opt-sel" : "npt-dd2-opt"}
              onClick={() => pick(o.value)}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
