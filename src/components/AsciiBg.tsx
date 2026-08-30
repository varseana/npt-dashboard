import { useEffect, useRef } from "react";

// fondo ASCII animado full-viewport. campo de glifos que ondula (rampa de densidad) + leve realce
// cerca del cursor. va fijo detras de TODO el contenido (zIndex -1), asi se ve tambien detras de las
// letras (el texto tiene fondo transparente). PRUEBA: gris + opacity baja (85% transparente).
export default function AsciiBg({ opacity = 0.15, rgb = "150,150,150" }: { opacity?: number; rgb?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const cx = cv.getContext("2d");
    if (!cx) return;
    const RAMP = " .:-=+*#%@";
    const CELL = 16;                        // px por celda
    let cols = 0, rows = 0, W = 0, H = 0, raf = 0;
    let mx = 0.5, my = 0.4;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

    function resize() {
      const DPR = Math.min(2, window.devicePixelRatio || 1);
      W = window.innerWidth; H = window.innerHeight;
      cv!.width = W * DPR; cv!.height = H * DPR;
      cx!.setTransform(DPR, 0, 0, DPR, 0, 0);
      cols = Math.ceil(W / CELL); rows = Math.ceil(H / CELL);
      cx!.font = (CELL - 3) + "px ui-monospace, monospace";
      cx!.textBaseline = "top";
    }
    function draw(t: number) {
      cx!.clearRect(0, 0, W, H);
      const time = t * 0.0008;
      const cxp = mx * cols, cyp = my * rows;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const wave = Math.sin(x * 0.16 + time * 1.2) * Math.cos(y * 0.2 - time) * 0.5 + 0.5;
          const glow = Math.max(0, 1 - Math.hypot(x - cxp, y - cyp) / 14);
          let v = wave * 0.7 + glow * 0.5;
          v = v < 0 ? 0 : v > 1 ? 1 : v;
          const ch = RAMP[(v * (RAMP.length - 1)) | 0];
          if (ch === " ") continue;
          cx!.fillStyle = "rgba(" + rgb + "," + (0.15 + v * 0.55).toFixed(3) + ")";
          cx!.fillText(ch, x * CELL, y * CELL);
        }
      }
      if (!reduce) raf = requestAnimationFrame(draw);
    }
    const onMove = (e: PointerEvent) => { mx = e.clientX / W; my = e.clientY / H; };
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
    };
  }, [rgb]);

  return (
    <canvas ref={ref} aria-hidden="true"
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%", zIndex: -1, pointerEvents: "none", opacity }} />
  );
}
