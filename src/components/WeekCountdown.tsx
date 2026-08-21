import { useEffect, useMemo, useState } from "react";
import { palette } from "../theme";

// contador LIVE junto al titulo "Week": tiempo restante hasta que termine la semana
// (sabado medianoche, o sea domingo 00:00). solo se muestra si la semana elegida es la
// que esta en curso; para semanas pasadas/futuras no aplica y no renderiza nada.
// compartido por Summary (Overview) y Breakdown (Distribution).
export default function WeekCountdown({ start }: { start: Date }) {
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

  if (now < startMs || now >= end) return null; // solo la semana en curso

  const total = Math.floor((end - now) / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const clock = d > 0 ? `${d}d ${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}:${pad(s)}`;

  return (
    <span
      title="Time left until this week ends (Saturday midnight)"
      style={{ color: palette.text, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
    >
      {"·"} ends in {clock}
    </span>
  );
}
