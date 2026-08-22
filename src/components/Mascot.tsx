import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { palette } from "../theme";
import { AsterMark, StoryLink } from "./InfoStar";
import { IconSearch, IconPlus, IconCheck, IconAlert, IconMail } from "./icons";

// mascota: un disco plano 2D, minimalista, abajo a la derecha. sin gradientes ni brillo:
// fill solido monocromatico (theme-aware). idle flota + respira suave, parpadea, los ojos
// siguen el mouse manteniendo SIEMPRE la misma separacion, y al hacer click cicla
// animaciones 2D-friendly (hop / wiggle / gaze). nada de rotacion sobre su eje ni fake-3D.
// capas separadas para que no choquen los transforms: wrap(fijo) > float(bob) > react(one-shot) > breathe.
// ADEMAS: al pasar el mouse (o click) suelta un bocadillo con consejos que rotan; los consejos llevan
// iconos inline en negrita y hyperlinks (StoryLink) que navegan al lugar que mencionan.

const ANIMS = ["hop", "wiggle", "gaze"];

type NavDest = { section: "dashboard" | "team" | "access"; tab?: string };

// resaltado monocromatico (bold full-contrast) para palabras clave dentro del consejo.
const hiTxt: React.CSSProperties = { color: palette.text, fontWeight: 700 };

// icono inline resaltado (full-contrast) para intercalar en el texto del consejo, en vez de la palabra.
function Ico({ children }: { children: React.ReactNode }) {
  return <span style={{ display: "inline-flex", verticalAlign: "-3px", color: palette.text, margin: "0 2px" }}>{children}</span>;
}

export default function Mascot({ inline = false, onNavigate }: { inline?: boolean; onNavigate?: (dest: NavDest) => void }) {
  const [anim, setAnim] = useState("");
  const [blink, setBlink] = useState(false);
  const [tip, setTip] = useState(0);
  const [bubble, setBubble] = useState(false);
  const closeRef = useRef<number | undefined>(undefined);

  // hyperlink que navega (si hay onNavigate) o texto en negrita si no. cierra el bocadillo al navegar.
  function Loc({ to, children }: { to: NavDest; children: React.ReactNode }) {
    if (!onNavigate) return <strong style={{ color: palette.text }}>{children}</strong>;
    return <StoryLink onClick={() => { onNavigate(to); setBubble(false); }}>{children}</StoryLink>;
  }

  // los 8 consejos generales (rotan). iconos inline en negrita + links a la seccion mencionada.
  const tips = useMemo<React.ReactNode[]>(() => [
    <>See the spinning <Ico><AsterMark size={13} spin={false} /></Ico> beside a heading? Give it a tap. Each one holds a short explainer, so you can answer most questions on your own.</>,
    <>A <Ico><IconSearch size={15} /></Ico> means search what is already here; a <Ico><IconPlus size={15} /></Ico> means add something new. Same language across the whole dashboard.</>,
    <>In <Loc to={{ section: "team", tab: "employees" }}>Team &gt; Employees</Loc>: <strong style={hiTxt}>Connected</strong> is reporting and expected, <strong style={hiTxt}>Pending</strong> is expected but not reporting yet, <strong style={hiTxt}>Unlisted</strong> is reporting but not on your roster.</>,
    <>A <Ico><IconCheck size={15} /></Ico> on an <strong style={hiTxt}>Unlisted</strong> person simply adds them to your roster. They already report under your team; this only stops them showing as unexpected.</>,
    <>Weeks roll over automatically every Sunday. Nothing is deleted: pick any past week from the selector in <Loc to={{ section: "dashboard", tab: "breakdown" }}>Dashboard &gt; Breakdown</Loc> to review it.</>,
    <>Set your team's weekly NPT budget in <Loc to={{ section: "team", tab: "planned" }}>Team &gt; Planned</Loc> once and it carries over on its own. Each person's target is their fair share of it.</>,
    <><Ico><IconAlert size={15} /></Ico> Email flagged nudges only those near or over plan; <Ico><IconMail size={15} /></Ico> Email team sends a shared summary. Both open as drafts to review first, in <Loc to={{ section: "dashboard", tab: "summary" }}>Dashboard &gt; Summary</Loc>.</>,
    <>Adding several people at once? Type or paste usernames separated by commas or spaces in any <Ico><IconPlus size={15} /></Ico> field.</>,
  ], [onNavigate]);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const eyesRef = useRef<SVGGElement | null>(null);
  const gazingRef = useRef(false);
  const idxRef = useRef(0);
  const schedRef = useRef<number | undefined>(undefined);

  // mueve el GRUPO de ojos como una sola pieza -> la separacion entre ojos nunca cambia
  function setEyes(x: number, y: number) {
    if (eyesRef.current) eyesRef.current.style.transform = `translate(${x}px,${y}px)`;
  }

  // parpadeo periodico (con doble-parpadeo ocasional)
  useEffect(() => {
    const id = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 140);
      if (Math.random() < 0.25) {
        setTimeout(() => { setBlink(true); setTimeout(() => setBlink(false), 140); }, 320);
      }
    }, 3400);
    return () => clearInterval(id);
  }, []);

  // los ojos siguen el cursor (movimiento ambiental), con un desplazamiento chico y acotado
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (gazingRef.current || !wrapRef.current) return;
      const r = wrapRef.current.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height * 0.42;
      const ang = Math.atan2(e.clientY - cy, e.clientX - cx);
      const dist = Math.min(4.5, Math.hypot(e.clientX - cx, e.clientY - cy) / 55);
      setEyes(Math.cos(ang) * dist, Math.sin(ang) * dist);
    }
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  // animacion random cada 6-14s
  useEffect(() => {
    let stopped = false;
    function schedule() {
      const delay = 6000 + Math.random() * 8000;
      schedRef.current = window.setTimeout(() => {
        if (stopped) return;
        play(ANIMS[Math.floor(Math.random() * ANIMS.length)]);
        schedule();
      }, delay);
    }
    schedule();
    return () => { stopped = true; if (schedRef.current) clearTimeout(schedRef.current); };
  }, []);

  // el consejo rota solo cada ~9s (se siente vivo aunque no hagas hover)
  useEffect(() => {
    const id = setInterval(() => setTip((t) => (t + 1) % tips.length), 9000);
    return () => clearInterval(id);
  }, [tips.length]);

  // bocadillo: abre en hover del orbe o del propio bocadillo; cierra con un pequeño delay al salir
  // (asi podes viajar del orbe al bocadillo para clickear un link sin que se cierre en el hueco).
  const cancelClose = () => { if (closeRef.current) { clearTimeout(closeRef.current); closeRef.current = undefined; } };
  const openBubble = () => { cancelClose(); setBubble(true); };
  const closeBubble = () => { cancelClose(); closeRef.current = window.setTimeout(() => setBubble(false), 220); };
  useEffect(() => () => cancelClose(), []);

  // mira alrededor en un cuadrado suave, despues devuelve el control al cursor
  function gaze() {
    gazingRef.current = true;
    const pts = [[3.5, -2.6], [3.5, 2.6], [-3.5, 2.6], [-3.5, -2.6], [0, 0]];
    pts.forEach((p, i) => {
      setTimeout(() => {
        setEyes(p[0], p[1]);
        if (i === pts.length - 1) setTimeout(() => { gazingRef.current = false; }, 260);
      }, i * 240);
    });
  }

  function play(a: string) {
    if (a === "gaze") { gaze(); return; }
    setAnim("");
    // reinicia la animacion aunque sea la misma
    requestAnimationFrame(() => {
      setAnim(a);
      setTimeout(() => setAnim(""), 920);
    });
  }

  // click en el orbe: avanza al siguiente consejo, abre el bocadillo y hace una animacion.
  function onClick() {
    const a = ANIMS[idxRef.current % ANIMS.length];
    idxRef.current += 1;
    setTip((t) => (t + 1) % tips.length);
    openBubble();
    play(a);
  }

  return (
    <div className={`orb-wrap ${inline ? "inline" : ""}`} ref={wrapRef} onClick={onClick}
      onMouseEnter={openBubble} onMouseLeave={closeBubble}
      role="button" aria-label="Mascot tips" title="Tips">
      <style>{CSS}</style>
      {bubble && (
        <div className="orb-bubble" onClick={(e) => e.stopPropagation()} onMouseEnter={openBubble} onMouseLeave={closeBubble}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: palette.textDim, fontWeight: 700 }}>Tip {tip + 1} / {tips.length}</span>
            <button type="button" className="npt-storylink" onClick={(e) => { e.stopPropagation(); setTip((t) => (t + 1) % tips.length); }}
              style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 3, color: palette.text, fontSize: 13 }}>Next</button>
          </div>
          <div style={{ lineHeight: 1.5 }}>{tips[tip]}</div>
        </div>
      )}
      <div className="orb-float">
        <div className={`orb-react ${anim}`}>
          <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
            <g className="orb-breathe">
              <circle className="orb-body" cx="32" cy="32" r="25" />
              <g className="orb-eyes" ref={eyesRef}>
                <ellipse className={`orb-eye ${blink ? "blink" : ""}`} cx="24" cy="33" rx="3.2" ry="4.2" />
                <ellipse className={`orb-eye ${blink ? "blink" : ""}`} cx="40" cy="33" rx="3.2" ry="4.2" />
              </g>
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.orb-wrap {
  position: fixed; right: 22px; bottom: 22px; z-index: 40;
  width: 64px; height: 64px; cursor: pointer; user-select: none;
  -webkit-tap-highlight-color: transparent;
}
/* inline: junto al titulo, sin fijar. tamano fijo -> el bob no empuja el layout.
   relative (no static) para anclar el bocadillo absoluto sin mover el flujo. */
.orb-wrap.inline {
  position: relative; right: auto; bottom: auto; z-index: auto;
  width: 46px; height: 46px; display: inline-block; vertical-align: middle; flex: 0 0 auto;
}
/* bocadillo de consejos: mismo lenguaje que los popovers de InfoStar (cuadrado, borde grueso,
   fondo = fondo de pagina, sin sombra). se ubica debajo del orbe. */
.orb-bubble {
  position: absolute; top: 100%; left: 0; margin-top: 10px; z-index: 50;
  width: min(320px, 80vw); background: var(--bg); border: 2px solid var(--text); border-radius: 0;
  padding: 12px 14px; font-size: 14.5px; font-weight: 400; line-height: 1.5; color: var(--textDim);
  text-align: left; box-shadow: none; cursor: auto; white-space: normal;
}
/* si el orbe fijo (no inline) tuviera bocadillo, lo abre hacia arriba-izquierda */
.orb-wrap:not(.inline) .orb-bubble { top: auto; bottom: 100%; left: auto; right: 0; margin: 0 0 10px; }
.orb-float { width: 100%; height: 100%; animation: orb-float 4.2s ease-in-out infinite; }
.orb-react { width: 100%; height: 100%; transform-origin: 50% 50%; }
.orb-react svg { display: block; width: 100%; height: 100%; overflow: visible; transition: transform .4s cubic-bezier(.34,1.4,.6,1); }
.orb-wrap:hover .orb-react svg { transform: scale(1.08); }
.orb-wrap:active .orb-react svg { transform: scale(.94); }

/* disco plano, fill solido monocromatico (negro en light, blanco en dark) */
.orb-body { fill: var(--accent); }
.orb-breathe { transform-box: fill-box; transform-origin: center; animation: orb-breathe 3.4s ease-in-out infinite; }

/* ojos: agujeros del color del fondo. el grupo se mueve entero -> separacion constante */
.orb-eyes { transform-box: fill-box; transition: transform .28s cubic-bezier(.4,0,.2,1); }
.orb-eye { fill: var(--bg); transform-box: fill-box; transform-origin: center; transition: transform .1s ease; }
.orb-eye.blink { transform: scaleY(.1); }

.orb-react.hop { animation: orb-hop .9s ease; }
.orb-react.wiggle { animation: orb-wiggle .9s ease; }

@keyframes orb-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
@keyframes orb-breathe { 0%,100% { transform: scale(1,1); } 50% { transform: scale(1.03,.97); } }
@keyframes orb-hop {
  0% { transform: translateY(0) scale(1,1); }
  25% { transform: translateY(2px) scale(1.08,.92); }
  50% { transform: translateY(-16px) scale(.95,1.06); }
  75% { transform: translateY(0) scale(1.05,.95); }
  100% { transform: translateY(0) scale(1,1); }
}
@keyframes orb-wiggle {
  0%,100% { transform: rotate(0); }
  25% { transform: rotate(-10deg); }
  60% { transform: rotate(9deg); }
  85% { transform: rotate(-4deg); }
}

@media (prefers-reduced-motion: reduce) {
  .orb-float, .orb-breathe { animation: none !important; }
}
`;
