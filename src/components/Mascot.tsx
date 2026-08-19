import { useEffect, useRef, useState } from "react";
import { palette } from "../theme";

// mascota: un blob negro abajo a la derecha. idle flota + morphea (border-radius animado),
// parpadea, cada tanto hace una animacion random, y reacciona al hover/click. CSS puro.
// capas separadas para que no choquen los transforms: wrap(fijo) > float(bob) > react(one-shot) > blob(morph+hover).

const ANIMS = ["hop", "wiggle", "spin"];

export default function Mascot() {
  const [anim, setAnim] = useState("");
  const [blink, setBlink] = useState(false);
  const schedRef = useRef<number | undefined>(undefined);

  // parpadeo periodico
  useEffect(() => {
    const id = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 150);
    }, 3500);
    return () => clearInterval(id);
  }, []);

  // animacion random cada 6-14s
  useEffect(() => {
    let stopped = false;
    const rnd = () => Math.random();
    function schedule() {
      const delay = 6000 + rnd() * 8000;
      schedRef.current = window.setTimeout(() => {
        if (stopped) return;
        play(ANIMS[Math.floor(rnd() * ANIMS.length)]);
        schedule();
      }, delay);
    }
    schedule();
    return () => { stopped = true; if (schedRef.current) clearTimeout(schedRef.current); };
  }, []);

  function play(a: string) {
    setAnim("");
    // reinicia la animacion aunque sea la misma
    requestAnimationFrame(() => {
      setAnim(a);
      setTimeout(() => setAnim(""), 950);
    });
  }

  return (
    <div className="mascot-wrap" onClick={() => play("hop")} role="button" aria-label="mascota" title="hola">
      <style>{CSS}</style>
      <div className="mascot-float">
        <div className={`mascot-react ${anim}`}>
          <div className="mascot-blob" style={{ background: palette.text }}>
            <span className={`mascot-eye ${blink ? "blink" : ""}`} style={{ left: "22%" }} />
            <span className={`mascot-eye ${blink ? "blink" : ""}`} style={{ right: "22%" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.mascot-wrap {
  position: fixed; right: 22px; bottom: 22px; z-index: 40;
  width: 60px; height: 60px; cursor: pointer; user-select: none;
  -webkit-tap-highlight-color: transparent;
}
.mascot-float { width: 100%; height: 100%; animation: mascot-float 4s ease-in-out infinite; }
.mascot-react { width: 100%; height: 100%; }
.mascot-blob {
  position: relative; width: 100%; height: 100%;
  border-radius: 42% 58% 60% 40% / 55% 48% 52% 45%;
  animation: mascot-morph 8s ease-in-out infinite;
  transition: transform .18s ease;
  box-shadow: 0 6px 14px rgba(0,0,0,.18);
}
.mascot-wrap:hover .mascot-blob { transform: scale(1.1); }
.mascot-wrap:active .mascot-blob { transform: scale(.92); }
.mascot-eye {
  position: absolute; top: 34%; width: 9px; height: 9px;
  background: #fff; border-radius: 50%;
  transition: transform .1s ease;
}
.mascot-eye.blink { transform: scaleY(.1); }

.mascot-react.hop { animation: mascot-hop .9s ease; }
.mascot-react.wiggle { animation: mascot-wiggle .9s ease; }
.mascot-react.spin { animation: mascot-spin .9s ease; }

@keyframes mascot-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
@keyframes mascot-morph {
  0%,100% { border-radius: 42% 58% 60% 40% / 55% 48% 52% 45%; }
  33% { border-radius: 60% 40% 45% 55% / 50% 60% 40% 50%; }
  66% { border-radius: 48% 52% 58% 42% / 42% 45% 55% 58%; }
}
@keyframes mascot-hop {
  0% { transform: translateY(0); } 30% { transform: translateY(-18px); }
  55% { transform: translateY(0); } 72% { transform: translateY(-7px); } 100% { transform: translateY(0); }
}
@keyframes mascot-wiggle {
  0%,100% { transform: rotate(0); } 20% { transform: rotate(-12deg); }
  50% { transform: rotate(12deg); } 80% { transform: rotate(-6deg); }
}
@keyframes mascot-spin { 0% { transform: rotate(0); } 100% { transform: rotate(360deg); } }

@media (prefers-reduced-motion: reduce) {
  .mascot-float, .mascot-blob, .mascot-react { animation: none !important; }
}
`;
