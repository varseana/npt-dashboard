import * as React from "react";
import { useRef, useState } from "react";

// Gimmick pull-to-reveal (solo con mouse/puntero). Se agarran los 3 puntos de arriba-centro y se tira
// hacia abajo: baja TODA la pagina (pageRef) y arriba se revela una seccion del color opuesto con una
// frase existencial pixelada (Press Start 2P). Al soltar sube con bounce. Cada pull = otra frase.
// Sigue los principios de pull-to-refresh: threshold, resistencia elastica, handoff (la frase aparece
// segun el pull), haptic (vibrate al cruzar el umbral) y bounce al soltar.
const PHRASES = [
  "Are you really you?",
  "Who are you offline?",
  "Just a role you play?",
  "Do you exist after work?",
  "Whose life are you living?",
  "Present, or just performing?",
  "What remains when you leave?",
  "Is this you, or them?",
  "Does the title define you?",
  "Who logs off tonight?",
];
const MAX = 260;        // pull maximo (asintota de la resistencia elastica)
const THRESHOLD = 120;  // umbral: haptic + frase full

export default function PullReveal({ pageRef }: { pageRef: React.RefObject<HTMLDivElement | null> }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const phraseRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const [phrase, setPhrase] = useState("");
  const st = useRef({ dragging: false, startY: 0, armed: false, last: -1 });

  function pick(): string {
    let i: number;
    do { i = Math.floor(Math.random() * PHRASES.length); } while (i === st.current.last && PHRASES.length > 1);
    st.current.last = i;
    return PHRASES[i];
  }

  function setReveal(h: number) {
    if (panelRef.current) panelRef.current.style.height = h + "px";
    if (pageRef.current) pageRef.current.style.transform = `translateY(${h}px)`;
    if (handleRef.current) handleRef.current.style.transform = `translate(-50%, ${h}px)`;
    if (phraseRef.current) phraseRef.current.style.opacity = String(Math.min(1, h / THRESHOLD));
  }
  function setSettle(on: boolean) {
    for (const el of [panelRef.current, pageRef.current, handleRef.current]) {
      if (el) el.classList.toggle("npt-pull-settle", on);
    }
  }

  function onMove(e: PointerEvent) {
    if (!st.current.dragging) return;
    let raw = e.clientY - st.current.startY;
    if (raw < 0) raw = 0;
    const h = MAX * (1 - Math.exp(-raw / MAX));   // resistencia elastica (rubber band)
    setReveal(h);
    if (h >= THRESHOLD && !st.current.armed) { st.current.armed = true; if (navigator.vibrate) navigator.vibrate(12); }
    if (h < THRESHOLD) st.current.armed = false;
  }
  function onUp() {
    if (!st.current.dragging) return;
    st.current.dragging = false;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    setSettle(true);      // sube con bounce
    setReveal(0);
  }
  function onDown(e: React.PointerEvent) {
    st.current.dragging = true;
    st.current.armed = false;
    st.current.startY = e.clientY;
    setPhrase(pick());
    setSettle(false);     // durante el arrastre, sin transicion (sigue el dedo 1:1 con resistencia)
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    e.preventDefault();
  }

  return (
    <>
      <div ref={panelRef} className="npt-pull-panel">
        <div ref={phraseRef} className="npt-pull-phrase">{phrase}</div>
      </div>
      <div ref={handleRef} className="npt-pull-handle" onPointerDown={onDown} role="button" aria-label="Pull down">
        <span className="npt-pull-dot" /><span className="npt-pull-dot" /><span className="npt-pull-dot" />
      </div>
    </>
  );
}
