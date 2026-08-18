// paleta minimalista blanco y negro. sin emojis, sin em-dash en la UI.
export const palette = {
  bg: "#ffffff",
  panel: "#ffffff",
  panelAlt: "#f6f6f6",
  border: "#e4e4e4",
  text: "#111111",
  textDim: "#767676",
  accent: "#111111",
  accentSoft: "#111111",
  deep: "#000000",
  over: "#111111",    // sobre target: negro (enfasis)
  under: "#9a9a9a",   // on target: gris
  // status semaforo (unico color permitido, solo para el estado de NPT):
  ok: "#1a7f37",      // verde: dentro de planned
  okBg: "#e6f4ea",
  warn: "#9a6700",    // amarillo/ambar: le queda <= 1h de remaining
  warnBg: "#fdf3d8",
  bad: "#b42318",     // rojo: se paso del planned
  badBg: "#fbeae8",
};

export const font =
  "'Segoe UI', system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif";
