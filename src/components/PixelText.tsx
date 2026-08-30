import { useEffect, useState } from "react";

// rasteriza texto en un canvas chico y lo umbraliza a un bitmap 0/1 (misma logica que el playground
// pixel-logos.html). cols = resolucion horizontal de la grilla; rows = cols/2.
function textToBitmap(text: string, cols: number): string[] {
  const rows = Math.round(cols * 0.5) || 12;
  const off = document.createElement("canvas");
  off.width = cols; off.height = rows;
  const o = off.getContext("2d");
  if (!o) return [];
  o.fillStyle = "#000"; o.fillRect(0, 0, cols, rows);
  o.fillStyle = "#fff"; o.textAlign = "center"; o.textBaseline = "middle";
  let fs = rows;
  o.font = "bold " + fs + "px monospace";
  while (o.measureText(text).width > cols - 1 && fs > 3) { fs--; o.font = "bold " + fs + "px monospace"; }
  o.fillText(text, cols / 2, rows / 2 + 0.5);
  const d = o.getImageData(0, 0, cols, rows).data;
  const g: string[] = [];
  for (let y = 0; y < rows; y++) { let r = ""; for (let x = 0; x < cols; x++) { r += d[(y * cols + x) * 4] > 110 ? "1" : "0"; } g.push(r); }
  return g;
}

// logo pixel: un SVG de puntos (circle + transform matrix), un punto por pixel encendido del bitmap.
// vectorial => escala sin perder calidad. currentColor => se adapta al tema.
export default function PixelText({ text, cols = 48, size = 297, r = 0.41, color }: {
  text: string; cols?: number; size?: number; r?: number; color?: string;
}) {
  const [bm, setBm] = useState<string[]>([]);
  useEffect(() => { setBm(textToBitmap(text, cols)); }, [text, cols]);
  if (!bm.length) return null;

  const rows = bm.length;
  const C = Math.max(...bm.map((s) => s.length));
  const coords: Array<[number, number]> = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < bm[y].length; x++) { if (bm[y][x] === "1") coords.push([x, y]); }

  return (
    <svg viewBox={`0 0 ${C} ${rows}`} width={size} height={(size * rows) / C}
      shapeRendering="geometricPrecision" aria-label={text}
      style={{ color, display: "block" }}>
      {coords.map(([x, y]) => (
        <circle key={x + "-" + y} cx={0} cy={0} r={r} fill="currentColor"
          transform={`matrix(1 0 0 1 ${x + 0.5} ${y + 0.5})`} />
      ))}
    </svg>
  );
}
