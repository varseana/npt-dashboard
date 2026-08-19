import { useEffect, useState } from "react";
import { palette } from "../theme";

// reloj flat con fuente de reloj (7 segmentos DSEG7, fallback monospace).
// color adaptativo (usa el color de texto del tema: negro sobre blanco, se invertiria
// solo en dark mode). sin panel ni bordes; el colon parpadea y cada digito hace un
// fade suave al cambiar (CSS puro, sin libs). el selector de tz es texto plano, sin boton.

const ZONES: { label: string; tz: string }[] = [
  { label: "Local", tz: "local" },
  { label: "SJO (Costa Rica)", tz: "America/Costa_Rica" },
  { label: "Bogota", tz: "America/Bogota" },
  { label: "Mexico City", tz: "America/Mexico_City" },
  { label: "Sao Paulo", tz: "America/Sao_Paulo" },
  { label: "US Pacific", tz: "America/Los_Angeles" },
  { label: "US Eastern", tz: "America/New_York" },
  { label: "London", tz: "Europe/London" },
  { label: "Madrid", tz: "Europe/Madrid" },
  { label: "India", tz: "Asia/Kolkata" },
  { label: "Tokyo", tz: "Asia/Tokyo" },
  { label: "UTC", tz: "UTC" },
];

const TZ_KEY = "nptClockTz";

function timeParts(date: Date, tz: string): { h: string; m: string; s: string } {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz === "local" ? undefined : tz,
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const p = fmt.formatToParts(date);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return { h: get("hour"), m: get("minute"), s: get("second") };
}

// par de digitos "NN"; cada char se re-monta al cambiar (key) y hace un fade corto
function DigitPair({ value, label }: { value: string; label: string }) {
  return (
    <>
      {value.split("").map((ch, i) => (
        <span key={`${label}${i}-${ch}`} className="nptclk-digit">{ch}</span>
      ))}
    </>
  );
}

export default function Clock() {
  const [now, setNow] = useState(() => new Date());
  const [tz, setTz] = useState<string>(() => {
    try { return localStorage.getItem(TZ_KEY) || "local"; } catch { return "local"; }
  });

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  function changeTz(v: string) {
    setTz(v);
    try { localStorage.setItem(TZ_KEY, v); } catch { /* noop */ }
  }

  const { h, m, s } = timeParts(now, tz);
  const zoneLabel = ZONES.find((z) => z.tz === tz)?.label ?? tz;

  return (
    <div className="nptclk-wrap">
      <style>{CSS}</style>
      <div className="nptclk-lcd" style={{ color: palette.text }} title={`Timezone: ${zoneLabel}`}>
        <DigitPair value={h} label="h" />
        <span className="nptclk-colon">:</span>
        <DigitPair value={m} label="m" />
        <span className="nptclk-colon">:</span>
        <DigitPair value={s} label="s" />
      </div>
      <select className="nptclk-tz" style={{ color: palette.textDim }} value={tz} onChange={(e) => changeTz(e.target.value)} title="Change timezone">
        {ZONES.map((z) => (<option key={z.tz} value={z.tz}>{z.label}</option>))}
      </select>
    </div>
  );
}

const CSS = `
@import url("https://cdn.jsdelivr.net/npm/dseg@0.46.0/css/dseg.css");
.nptclk-wrap { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.nptclk-lcd {
  display: inline-flex; align-items: baseline; line-height: 1;
  font-family: "DSEG7 Classic", "Consolas", "Menlo", monospace;
  font-size: 24px; font-weight: 400; letter-spacing: 2px;
}
.nptclk-digit {
  display: inline-block; text-align: center;
  animation: nptclk-fade .22s ease-out;
}
.nptclk-colon { padding: 0 2px; animation: nptclk-blink 1s steps(1) infinite; }
@keyframes nptclk-blink { 0%,50% { opacity: 1; } 50.01%,100% { opacity: .15; } }
@keyframes nptclk-fade { from { opacity: .2; } to { opacity: 1; } }
.nptclk-tz {
  border: none; background: transparent; padding: 0; margin: 0;
  font-size: 11px; cursor: pointer; text-align: right;
  appearance: none; -webkit-appearance: none;
}
.nptclk-tz:focus { outline: none; }
@media (prefers-reduced-motion: reduce) {
  .nptclk-digit, .nptclk-colon { animation: none; }
}
`;
