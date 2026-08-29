import { useEffect, useRef, useState } from "react";
import { palette } from "../theme";
import { IconLogout } from "./icons";

// set de glyphs = el mismo del ScrambleText del titulo (scrambleChars="._/:<>*=") + extras
const GLYPHS = "._/:<>*=+#%".split("");
const REDUCE = typeof window !== "undefined" && !!window.matchMedia
  && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// decodifica el texto desde glyphs random cuando `trigger` cambia (al abrir el menu). cada char
// cicla glyphs y se asienta en cascada izq->der; `delay` escalona los items de arriba a abajo.
function ScrambleLabel({ text, delay, trigger }: { text: string; delay: number; trigger: number }) {
  const [out, setOut] = useState(text);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (trigger === 0 || REDUCE) { setOut(text); return; }
    const chars = [...text];
    const stagger = 55, hold = 90;   // ms entre chars / ms de scramble antes de asentarse
    let start = 0;
    const step = (now: number) => {
      if (!start) start = now;
      const t = now - start;
      let s = "", done = true;
      for (let i = 0; i < chars.length; i++) {
        const ch = chars[i];
        if (ch === " ") { s += " "; continue; }
        if (t >= i * stagger + hold) s += ch;
        else { s += GLYPHS[(Math.random() * GLYPHS.length) | 0]; done = false; }
      }
      setOut(s);
      if (!done) raf.current = requestAnimationFrame(step);
      else setOut(text);
    };
    const to = setTimeout(() => { start = 0; raf.current = requestAnimationFrame(step); }, delay);
    return () => { clearTimeout(to); if (raf.current) cancelAnimationFrame(raf.current); };
  }, [trigger, text, delay]);
  return <span style={{ whiteSpace: "pre" }}>{out}</span>;
}

// dropdown de perfil en el header: un solo frame de 4 esquinas que crece al abrir (las esquinas de
// abajo bajan via .npt-collapse). fondo = MISMO color de la pagina (var(--bg)). el holder fantasma
// reserva el tamano del chip en reposo => abrir NO mueve la pagina. logout = mismo confirm del App.
export default function ProfileMenu({ email, role, onMyNpt, onLogout }:
  { email: string; role: string; onMyNpt: () => void; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const [playKey, setPlayKey] = useState(0);   // bump al abrir => dispara el decode
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  function toggle() {
    setOpen((o) => { if (!o) setPlayKey((k) => k + 1); return !o; });
  }

  const chip = (
    <span>
      <span style={{ color: palette.text, fontWeight: 600 }}>{email}</span>{" "}
      <span style={{ color: palette.blue, fontWeight: 600 }}>({role})</span>
    </span>
  );

  return (
    <div className="npt-profile-holder" ref={ref} style={{ marginTop: 6 }}>
      {/* fantasma en flujo: reserva w/h del chip para que abrir el menu no reflowee la pagina */}
      <div className="npt-profile-ghost" aria-hidden="true"
        style={{ padding: "8px 14px", fontSize: 18, display: "flex", alignItems: "center", gap: 10 }}>
        {chip}<span style={{ marginLeft: "auto", width: 14, flex: "0 0 14px" }} />
      </div>

      <div className="npt-profile" data-open={open ? "true" : "false"}>
        <span className="npt-bracket tl" /><span className="npt-bracket tr" />
        <span className="npt-bracket bl" /><span className="npt-bracket br" />

        <button className="npt-profile-trigger" aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
          {chip}
          <svg className="npt-profile-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 9l7 7 7-7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="npt-collapse" data-open={open ? "true" : "false"}>
          <div className="npt-collapse-inner">
            <div className="npt-profile-menu" role="menu" aria-label="Profile">
              <button className="npt-profile-item" role="menuitem"
                onClick={() => { setOpen(false); onMyNpt(); }}>
                <span className="npt-profile-ico">
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                    <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </span>
                <ScrambleLabel text="My NPT" delay={100} trigger={playKey} />
              </button>

              <button className="npt-profile-item danger" role="menuitem"
                onClick={() => { setOpen(false); onLogout(); }}>
                <span className="npt-profile-ico"><IconLogout size={18} /></span>
                <ScrambleLabel text="Log out" delay={180} trigger={playKey} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
