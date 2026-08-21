import { useEffect, useRef, useState } from "react";

// mascota: un disco plano 2D, minimalista, abajo a la derecha. sin gradientes ni brillo:
// fill solido monocromatico (theme-aware). idle flota + respira suave, parpadea, los ojos
// siguen el mouse manteniendo SIEMPRE la misma separacion, y al hacer click cicla
// animaciones 2D-friendly (hop / wiggle / gaze). nada de rotacion sobre su eje ni fake-3D.
// capas separadas para que no choquen los transforms: wrap(fijo) > float(bob) > react(one-shot) > breathe.

const ANIMS = ["hop", "wiggle", "gaze"];

export default function Mascot({ inline = false }: { inline?: boolean }) {
  const [anim, setAnim] = useState("");
  const [blink, setBlink] = useState(false);
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

  function onClick() {
    const a = ANIMS[idxRef.current % ANIMS.length];
    idxRef.current += 1;
    play(a);
  }

  return (
    <div className={`orb-wrap ${inline ? "inline" : ""}`} ref={wrapRef} onClick={onClick} role="button" aria-label="mascota" title="hola">
      <style>{CSS}</style>
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
/* inline: junto al titulo, sin fijar. tamano fijo -> el bob no empuja el layout */
.orb-wrap.inline {
  position: static; right: auto; bottom: auto; z-index: auto;
  width: 46px; height: 46px; display: inline-block; vertical-align: middle; flex: 0 0 auto;
}
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
