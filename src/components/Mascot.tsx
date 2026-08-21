import { useEffect, useRef, useState } from "react";

// mascota: un orbe 3D sombreado abajo a la derecha. flota + respira, tiene un brillo
// especular que titila, parpadea, los ojos siguen el cursor, y al hacer click cicla
// animaciones suaves (pulse / spin / gaze). monocromatico y theme-aware via CSS vars:
// en light es un orbe oscuro sobre off-white, en dark un orbe palido sobre negro.
// capas separadas para que no choquen los transforms: wrap(fijo) > float(bob) > react(one-shot) > breathe.

const ANIMS = ["pulse", "spin", "gaze"];

export default function Mascot() {
  const [anim, setAnim] = useState("");
  const [blink, setBlink] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const eyesRef = useRef<SVGGElement | null>(null);
  const gazingRef = useRef(false);
  const idxRef = useRef(0);
  const schedRef = useRef<number | undefined>(undefined);

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

  // los ojos siguen el cursor (movimiento ambiental)
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (gazingRef.current || !wrapRef.current) return;
      const r = wrapRef.current.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height * 0.42;
      const ang = Math.atan2(e.clientY - cy, e.clientX - cx);
      const dist = Math.min(2.2, Math.hypot(e.clientX - cx, e.clientY - cy) / 90);
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

  // mira alrededor en un circulo suave, despues devuelve el control al cursor
  function gaze() {
    gazingRef.current = true;
    const pts = [[1.8, -1.3], [1.8, 1.3], [-1.8, 1.3], [-1.8, -1.3], [0, 0]];
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
      setTimeout(() => setAnim(""), a === "spin" ? 1060 : 920);
    });
  }

  function onClick() {
    const a = ANIMS[idxRef.current % ANIMS.length];
    idxRef.current += 1;
    play(a);
  }

  return (
    <div className="orb-wrap" ref={wrapRef} onClick={onClick} role="button" aria-label="mascota" title="hola">
      <style>{CSS}</style>
      <div className="orb-float">
        <div className={`orb-react ${anim}`}>
          <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
            <defs>
              <radialGradient id="orbFill" cx="36%" cy="28%" r="78%">
                <stop className="o-hi" offset="0%" />
                <stop className="o-mid" offset="58%" />
                <stop className="o-lo" offset="100%" />
              </radialGradient>
              <radialGradient id="orbSpec" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
                <stop offset="70%" stopColor="#ffffff" stopOpacity="0.06" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
              </radialGradient>
            </defs>
            <ellipse className="orb-shadow" cx="32" cy="61" rx="17" ry="2.6" />
            <g className="orb-breathe">
              <circle className="orb-body" cx="32" cy="30" r="25" fill="url(#orbFill)" />
              <ellipse className="orb-spec" cx="24" cy="20" rx="9" ry="6" fill="url(#orbSpec)" />
              <circle className="orb-glint" cx="21" cy="17" r="1.8" />
              <g className="orb-eyes" ref={eyesRef}>
                <ellipse className={`orb-eye ${blink ? "blink" : ""}`} cx="24" cy="31" rx="3.2" ry="4.2" />
                <ellipse className={`orb-eye ${blink ? "blink" : ""}`} cx="40" cy="31" rx="3.2" ry="4.2" />
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
.orb-float { width: 100%; height: 100%; perspective: 300px; animation: orb-float 4.2s ease-in-out infinite; }
.orb-react { width: 100%; height: 100%; transform-origin: 50% 50%; }
.orb-react svg { display: block; width: 100%; height: 100%; overflow: visible; transition: transform .4s cubic-bezier(.34,1.4,.6,1); }
.orb-wrap:hover .orb-react svg { transform: scale(1.08); }
.orb-wrap:active .orb-react svg { transform: scale(.94); }

.orb-body { stroke: color-mix(in srgb, var(--accent) 16%, transparent); stroke-width: .6; }
.orb-breathe { transform-box: fill-box; transform-origin: center; animation: orb-breathe 3.4s ease-in-out infinite; }
.orb-spec { transform-box: fill-box; transform-origin: center; animation: orb-spec 6s ease-in-out infinite; }
.orb-glint { fill: #ffffff; animation: orb-glint 6s ease-in-out infinite; }
.orb-shadow { fill: rgba(0,0,0,.28); animation: orb-shadow 4.2s ease-in-out infinite; }

.orb-eyes { transform-box: fill-box; transition: transform .28s cubic-bezier(.4,0,.2,1); }
.orb-eye { fill: var(--bg); transform-box: fill-box; transform-origin: center; transition: transform .1s ease; }
.orb-eye.blink { transform: scaleY(.1); }

/* sombreado de la esfera, theme-aware: light = orbe oscuro, dark = orbe palido */
.o-hi { stop-color: #5a5a5a; }
.o-mid { stop-color: #1b1b1b; }
.o-lo { stop-color: #000000; }
html.dark .o-hi { stop-color: #ffffff; }
html.dark .o-mid { stop-color: #cfcfcf; }
html.dark .o-lo { stop-color: #7c7c7c; }

.orb-react.pulse { animation: orb-pulse .92s cubic-bezier(.34,1.56,.64,1); }
.orb-react.spin { animation: orb-spin 1.06s cubic-bezier(.55,0,.45,1); }

@keyframes orb-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
@keyframes orb-breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.035); } }
@keyframes orb-spec { 0%,100% { opacity: .5; transform: translate(0,0); } 50% { opacity: .8; transform: translate(1.5px,1px); } }
@keyframes orb-glint { 0%,100% { opacity: .4; } 50% { opacity: .7; } }
@keyframes orb-shadow { 0%,100% { opacity: .28; } 50% { opacity: .18; } }
@keyframes orb-pulse { 0% { transform: scale(1); } 34% { transform: scale(1.12); } 100% { transform: scale(1); } }
@keyframes orb-spin { 0% { transform: rotateY(0deg); } 100% { transform: rotateY(360deg); } }

@media (prefers-reduced-motion: reduce) {
  .orb-float, .orb-breathe, .orb-spec, .orb-glint, .orb-shadow { animation: none !important; }
}
`;
