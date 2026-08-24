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

// next = valor de dark al que vamos. applyState = flip del estado de React (setDark). btn = el boton
// clickeado (para el origen del reveal). El cambio de clase se hace DENTRO del callback de la view
// transition (sincrono) para que el snapshot capture el tema nuevo.
export function runThemeToggle(next: boolean, applyState: () => void, btn: HTMLElement | null) {
  const root = document.documentElement;
  const apply = () => { root.classList.toggle("dark", next); applyState(); };

  const start = (document as unknown as { startViewTransition?: (cb: () => void) => any }).startViewTransition;
  if (typeof start !== "function" || !btn) { apply(); return; }

  const vw = window.innerWidth, vh = window.innerHeight;
  const rect = btn.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const R = Math.hypot(Math.max(x, vw - x), Math.max(y, vh - y));   // radio maximo hasta la esquina mas lejana
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
