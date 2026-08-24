// Toggle de tema animado con la View Transitions API: el cambio light/dark se revela con un clip-path
// en forma de ESTRELLA que se expande desde el boton que se clickeo. Sin dependencias (portado de
// magicui/animated-theme-toggler, solo la variante "star"). Fallback: si el navegador no soporta
// startViewTransition (Safari/Firefox), togglea el tema sin animacion.

// clip-path inicial (colapsado) y final (estrella que cubre todo), en % del viewport.
function starClips(cx: number, cy: number, R: number, vw: number, vh: number): [string, string] {
  const X = (x: number) => `${(x / vw) * 100}%`;
  const Y = (y: number) => `${(y / vh) * 100}%`;
  const P = (x: number, y: number) => `${X(x)} ${Y(y)}`;
  const r = R * Math.SQRT2 * 1.03;   // leve overscan para que no quede una costura de 1px al final
  const inner = 0.42;
  const star = (rad: number) => {
    const v: string[] = [];
    for (let i = 0; i < 5; i++) {
      const oa = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      v.push(P(cx + rad * Math.cos(oa), cy + rad * Math.sin(oa)));
      const ia = oa + Math.PI / 5;
      v.push(P(cx + rad * inner * Math.cos(ia), cy + rad * inner * Math.sin(ia)));
    }
    return `polygon(${v.join(", ")})`;
  };
  return [star(Math.max(2, r * 0.025)), star(r)];
}

// next = valor de dark al que vamos. applyState = flip del estado de React (setDark). El reveal sale
// SIEMPRE desde el centro del viewport (pedido de Sean, header y login). El cambio de clase se hace
// DENTRO del callback de la view transition (sincrono) para que el snapshot capture el tema nuevo.
export function runThemeToggle(next: boolean, applyState: () => void) {
  const root = document.documentElement;
  const apply = () => { root.classList.toggle("dark", next); applyState(); };

  const start = (document as unknown as { startViewTransition?: (cb: () => void) => any }).startViewTransition;
  if (typeof start !== "function") { apply(); return; }

  const vw = window.innerWidth, vh = window.innerHeight;
  const x = vw / 2, y = vh / 2;                 // origen = centro del viewport
  const R = Math.hypot(vw / 2, vh / 2);         // radio del centro a cualquier esquina
  const [from, to] = starClips(x, y, R, vw, vh);
  const DUR = 450;

  root.dataset.vt = "active";
  root.style.setProperty("--vt-dur", DUR + "ms");
  root.style.setProperty("--vt-clip-from", from);   // pin del clip inicial (evita flash en algunos browsers)
  const cleanup = () => {
    delete root.dataset.vt;
    root.style.removeProperty("--vt-dur");
    root.style.removeProperty("--vt-clip-from");
  };

  const t = start.call(document, apply);
  t?.ready?.then(() => {
    root.animate(
      { clipPath: [from, to] },
      { duration: DUR, easing: "linear", fill: "forwards", pseudoElement: "::view-transition-new(root)" },
    );
  }).catch(() => {});
  if (t?.finished?.finally) t.finished.finally(cleanup); else cleanup();
}
