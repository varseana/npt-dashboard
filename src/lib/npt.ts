// logica pura de NPT. espeja el calculo de la extension:
// Available = productivo, Offline = ancla de turno (se excluye del universo),
// todo lo demas cuenta como NPT salvo lo que el manager ponga en excluded.

export const PRODUCTIVE = "Available";
export const ANCHOR = "Offline";

// vocabulario conocido de AUX (de profiles/ssr/popup.js AUX_ORDER)
export const AUX_ORDER = [
  "Available", "Offline", "Break", "Break2", "Break3", "Email", "Lunch",
  "Meeting", "Personal", "Project", "System", "Training", "Upcoming Non Available",
];

export type AuxSeconds = Record<string, number>;

export interface NptDailyRow {
  alias: string;
  tenant: string | null;
  work_date: string;
  profile: string;
  aux_seconds: AuxSeconds;
}

export interface DayNpt {
  nptSeconds: number;
  trackedSeconds: number;
  nptPct: number;
}

// NPT de un solo dia/fila
export function computeDay(aux: AuxSeconds, excluded: string[]): DayNpt {
  const ex = new Set(excluded);
  let npt = 0;
  let tracked = 0;
  for (const [name, sec] of Object.entries(aux || {})) {
    if (name === ANCHOR) continue;          // Offline no entra al universo
    tracked += sec;
    if (name === PRODUCTIVE) continue;       // Available = productivo, no NPT
    if (ex.has(name)) continue;              // excluido por el manager
    npt += sec;
  }
  return { nptSeconds: npt, trackedSeconds: tracked, nptPct: tracked ? npt / tracked : 0 };
}

export interface UserAgg {
  alias: string;
  tenant: string | null;
  daysReported: number;
  nptSeconds: number;
  trackedSeconds: number;
  avgNptPct: number;    // ponderado por tiempo trackeado
  overTarget: boolean;
}

// agrega por usuario a traves de todas sus filas del rango
export function aggregateByUser(
  rows: NptDailyRow[],
  excluded: string[],
  targetPct: number
): UserAgg[] {
  const byUser = new Map<string, UserAgg>();
  for (const row of rows) {
    const d = computeDay(row.aux_seconds, excluded);
    let u = byUser.get(row.alias);
    if (!u) {
      u = { alias: row.alias, tenant: row.tenant, daysReported: 0, nptSeconds: 0, trackedSeconds: 0, avgNptPct: 0, overTarget: false };
      byUser.set(row.alias, u);
    }
    u.daysReported += 1;
    u.nptSeconds += d.nptSeconds;
    u.trackedSeconds += d.trackedSeconds;
  }
  const out = Array.from(byUser.values());
  for (const u of out) {
    u.avgNptPct = u.trackedSeconds ? u.nptSeconds / u.trackedSeconds : 0;
    u.overTarget = u.avgNptPct > targetPct;
  }
  out.sort((a, b) => b.avgNptPct - a.avgNptPct);   // ranking desc
  return out;
}

// todos los AUX vistos en la data (para el editor de exclusion)
export function discoverAux(rows: NptDailyRow[]): string[] {
  const seen = new Set<string>(AUX_ORDER);
  for (const r of rows) for (const k of Object.keys(r.aux_seconds || {})) seen.add(k);
  // Available y Offline no son excluibles (no son NPT nunca)
  return Array.from(seen).filter((a) => a !== PRODUCTIVE && a !== ANCHOR).sort();
}

export function fmtHrs(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

export function fmtPct(p: number): string {
  return (p * 100).toFixed(2) + "%";
}
