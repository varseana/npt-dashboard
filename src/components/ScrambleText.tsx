import * as React from "react";
import { useEffect, useRef } from "react";

// Efecto "scrambled text" (inspirado en el ScrambledText de React Bits / Tom Miller de la comunidad
// GSAP), pero REIMPLEMENTADO en React puro SIN gsap/SplitText/ScrambleTextPlugin (nada de deps nuevas).
// Cada caracter cercano al puntero se scramblea (cicla por scrambleChars) durante un ratito proporcional
// a la cercania y vuelve a su letra original. Se ancla el ancho de cada char para que no haya reflow.
interface Props {
  text: string;                 // usar "\n" para saltos de linea (ej. login: "STAR NPT\nDashboard")
  radius?: number;
  duration?: number;            // segundos que dura el scramble de un char (al estar pegado al puntero)
  speed?: number;               // 0..1: mas alto = flips mas lentos
  scrambleChars?: string;
  className?: string;
  style?: React.CSSProperties;
}

export default function ScrambleText({
  text, radius = 100, duration = 1.2, speed = 0.5, scrambleChars = ".:", className = "", style,
}: Props) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const charsRef = useRef<{ el: HTMLElement; ch: string; until: number; next: number }[]>([]);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>("[data-c]"));

    // ancla el ancho de cada char (asi el scramble no reflow-ea el titulo). se re-mide cuando la
    // webfont termina de cargar (sino los anchos saldrian con la fuente fallback).
    const measure = () => {
      for (const el of els) {
        el.style.width = "";
        el.style.display = "inline-block";
        el.style.textAlign = "center";
        el.style.width = el.getBoundingClientRect().width + "px";
      }
    };
    measure();
    (document as any).fonts?.ready?.then(measure).catch?.(() => {});

    charsRef.current = els.map((el) => ({ el, ch: el.dataset.c || "", until: 0, next: 0 }));
    const flip = Math.max(18, 55 * speed);   // ms entre cambios de char mientras scramblea

    const loop = () => {
      const now = performance.now();
      let any = false;
      for (const c of charsRef.current) {
        if (now < c.until) {
          any = true;
          if (now >= c.next) {
            c.el.textContent = scrambleChars[Math.floor(Math.random() * scrambleChars.length)] || c.ch;
            c.next = now + flip;
          }
        } else if (c.el.textContent !== c.ch) {
          c.el.textContent = c.ch;   // restaura la letra original
        }
      }
      rafRef.current = any ? requestAnimationFrame(loop) : undefined;
    };
    const onMove = (e: PointerEvent) => {
      const now = performance.now();
      for (const c of charsRef.current) {
        const r = c.el.getBoundingClientRect();
        const dist = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
        if (dist < radius) c.until = Math.max(c.until, now + duration * (1 - dist / radius) * 1000);
      }
      if (rafRef.current === undefined) rafRef.current = requestAnimationFrame(loop);
    };
    root.addEventListener("pointermove", onMove);
    return () => {
      root.removeEventListener("pointermove", onMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [text, radius, duration, speed, scrambleChars]);

  const lines = text.split("\n");
  return (
    <span ref={rootRef} className={className} style={style}>
      {lines.map((line, li) => (
        <span key={li}>
          {li > 0 && <br />}
          {Array.from(line).map((ch, i) =>
            ch === " "
              ? <span key={i} aria-hidden="true">{" "}</span>
              : <span key={i} data-c={ch}>{ch}</span>,
          )}
        </span>
      ))}
    </span>
  );
}
