import { useEffect, useState } from "react";

// reloj LCD estilo casio, dark, arriba a la derecha. selector de timezone.
// transicion suave por digito con CSS puro (sin libs): cada digito se re-monta con
// key=valor y hace un fade corto; el colon parpadea por keyframe independiente.

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

// un par de digitos "NN": cada char sobre un "8" fantasma (look LCD) y con fade al cambiar
function DigitPair({ value, label }: { value: string; label: string }) {
  return (
    <span className="nptclk-pair">
      {value.split("").map((ch, i) => (
        <span key={`${label}${i}-${ch}`} className="nptclk-cell">
          <span className="nptclk-ghost">8</span>
          <span className="nptclk-digit">{ch}</span>
        </span>
      ))}
    </span>
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
      <div className="nptclk-lcd" title={`Timezone: ${zoneLabel}`}>
        <DigitPair value={h} label="h" />
        <span className="nptclk-colon">:</span>
        <DigitPair value={m} label="m" />
        <span className="nptclk-colon">:</span>
        <DigitPair value={s} label="s" />
      </div>
      <select className="nptclk-tz" value={tz} onChange={(e) => changeTz(e.target.value)} title="Change timezone">
        {ZONES.map((z) => (<option key={z.tz} value={z.tz}>{z.label}</option>))}
      </select>
    </div>
  );
}

const CSS = `
.nptclk-wrap { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.nptclk-lcd {
  display: inline-flex; align-items: center;
  background: #0d1411; border: 1px solid #1f2b25; border-radius: 8px;
  padding: 6px 12px; box-shadow: inset 0 1px 6px rgba(0,0,0,.6);
  font-family: "SFMono-Regular", "Consolas", "Menlo", monospace;
  font-size: 26px; font-weight: 700; letter-spacing: 1px; line-height: 1;
}
.nptclk-pair { display: inline-flex; }
.nptclk-cell { position: relative; display: inline-block; width: 0.62em; text-align: center; }
.nptclk-ghost { color: #17f0a01a; }
.nptclk-digit {
  position: absolute; left: 0; right: 0; top: 0;
  color: #24f0a8; text-shadow: 0 0 6px rgba(36,240,168,.55);
  animation: nptclk-fade .22s ease-out;
}
.nptclk-colon {
  color: #24f0a8; text-shadow: 0 0 6px rgba(36,240,168,.55);
  padding: 0 2px; animation: nptclk-blink 1s steps(1) infinite;
}
@keyframes nptclk-blink { 0%,50% { opacity: 1; } 50.01%,100% { opacity: .12; } }
@keyframes nptclk-fade { from { opacity: .15; transform: translateY(-2px); } to { opacity: 1; transform: translateY(0); } }
.nptclk-tz {
  background: #0d1411; color: #9fb8ae; border: 1px solid #1f2b25;
  border-radius: 6px; padding: 2px 6px; font-size: 11px; cursor: pointer;
}
@media (prefers-reduced-motion: reduce) {
  .nptclk-digit { animation: none; }
  .nptclk-colon { animation: none; }
}
`;
