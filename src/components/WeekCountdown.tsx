import { useEffect, useMemo, useState } from "react";
import { palette } from "../theme";

// contador LIVE junto al titulo "Week". Tres estados segun la semana elegida:
//  - FUTURA (aun no empieza): cuenta hasta el INICIO (domingo 00:00), en AMARILLO Bauhaus ("starts in").
//  - EN CURSO: cuenta hasta el FIN (sabado medianoche = domingo 00:00), color texto ("ends in").
//  - PASADA: no renderiza nada.
// `standalone` quita el separador "·" del principio (para usarlo suelto, no despues de "Week").
// `sep` reemplaza el separador (ej. ":: " para ponerlo a la derecha del dropdown). Si el timer no
// aplica (semana pasada) NO renderiza nada, asi el separador nunca queda colgando solo.
// compartido por Summary (Overview), Breakdown (Distribution) y ahora Planned (planear semana futura).
export default function WeekCountdown({ start, standalone, sep }: { start: Date; standalone?: boolean; sep?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const startMs = start.getTime();
  const end = useMemo(() => {
    const e = new Date(start);
    e.setDate(e.getDate() + 7);
    e.setHours(0, 0, 0, 0);
    return e.getTime();
  }, [startMs]);

  if (now >= end) return null; // semana pasada: no aplica

  const future = now < startMs;
  const total = Math.floor(((future ? startMs : end) - now) / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const clock = d > 0 ? `${d}d ${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}:${pad(s)}`;

  return (
    <span
      title={future ? "Time until this week starts (Sunday 00:00)" : "Time left until this week ends (Saturday midnight)"}
      style={{ color: future ? palette.warn : palette.text, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
    >
      {sep != null ? sep : standalone ? "" : "· "}{future ? "starts in " : "ends in "}{clock}
    </span>
  );
}
