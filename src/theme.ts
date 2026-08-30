// paleta via CSS variables: los valores light/dark viven en index.html (:root y html.dark).
// asi todo el palette.X inline re-tematiza al togglear la clase 'dark' (dark mode).
export const palette = {
  bg: "var(--bg)",
  panel: "var(--panel)",
  panelAlt: "var(--panelAlt)",
  panelSolid: "var(--panel-solid)",   // opaco de verdad (modales, popovers que deben taparse)
  border: "var(--border)",
  text: "var(--text)",
  textDim: "var(--textDim)",
  accent: "var(--accent)",
  accentSoft: "var(--accentSoft)",
  accentText: "var(--accent-text)",   // texto sobre botones accent (blanco en light, negro en dark)
  deep: "var(--deep)",
  over: "var(--over)",
  under: "var(--under)",
  // status semaforo (verde/amarillo/rojo) + sus fondos tenues
  ok: "var(--ok)",
  okBg: "var(--okBg)",
  warn: "var(--warn)",
  warnBg: "var(--warnBg)",
  bad: "var(--bad)",
  badBg: "var(--badBg)",
  // azul Bauhaus: token disponible (aun sin uso en la UI). ej: estado "info" o acento puntual.
  blue: "var(--blue)",
  blueBg: "var(--blueBg)",
  clock: "var(--clock)",   // color del LCD del reloj (verde casio fosforescente en dark)
};

// geometric sans (Outfit Variable, OFL, self-hosteada via @fontsource-variable/outfit en main.tsx).
// alternativa documentada a la "Endless" (no distribuible en npm/Google Fonts). fallbacks del sistema.
export const font =
  "'Outfit Variable', 'Segoe UI', system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif";
