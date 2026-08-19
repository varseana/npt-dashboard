// logica pura de NPT.
// DEFINICION GLOBAL (fijada con el manager 2026-08-18): NPT = suma de exactamente estos 5
// auxiliares. Todo lo demas (Available, Offline, Break, Lunch, Bio, etc.) NO cuenta como NPT.
export const NPT_AUX = ["Meeting", "Training", "Project", "Personal", "System"] as const;
const NPT_SET = new Set<string>(NPT_AUX);

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

// NPT de un solo dia/fila. NPT = suma de los 5 AUX globales; tracked = todo menos Offline.
// _excluded queda por compatibilidad de firma pero YA NO se usa (NPT es fijo).
export function computeDay(aux: AuxSeconds, _excluded?: string[]): DayNpt {
  let npt = 0;
  let tracked = 0;
  for (const [name, sec] of Object.entries(aux || {})) {
    if (name === ANCHOR) continue;          // Offline no entra al universo
    tracked += sec;
    if (NPT_SET.has(name)) npt += sec;       // solo los 5 cuentan como NPT
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
  _excluded: string[],
  targetPct: number
): UserAgg[] {
  const byUser = new Map<string, UserAgg>();
  for (const row of rows) {
    const d = computeDay(row.aux_seconds);
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

// todos los AUX vistos en la data (para el editor de exclusion, legacy)
export function discoverAux(rows: NptDailyRow[]): string[] {
  const seen = new Set<string>(AUX_ORDER);
  for (const r of rows) for (const k of Object.keys(r.aux_seconds || {})) seen.add(k);
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

// parsea input del manager a segundos. acepta "H:MM", "H:MM:SS", o horas decimales ("3.5").
// devuelve null si esta vacio, NaN-safe: entrada invalida => null.
export function parseDuration(input: string): number | null {
  const s = (input || "").trim();
  if (!s) return null;
  if (s.includes(":")) {
    const parts = s.split(":").map((p) => parseInt(p, 10));
    if (parts.some((n) => isNaN(n))) return null;
    const [h, m, sec] = [parts[0] || 0, parts[1] || 0, parts[2] || 0];
    return h * 3600 + m * 60 + sec;
  }
  const hours = parseFloat(s);
  if (isNaN(hours)) return null;
  return Math.round(hours * 3600);
}

// formato Hh:mm:ss (pedido del manager). segundos negativos se muestran con signo.
export function fmtHms(seconds: number): string {
  const neg = seconds < 0;
  let s = Math.abs(Math.round(seconds));
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  return `${neg ? "-" : ""}${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Semanas: laborales, empiezan DOMINGO (definido con Sean 2026-08-18).
// week_key para overrides = fecha ISO (YYYY-MM-DD) del domingo de esa semana.
// El numero de semana se muestra junto al rango de fechas para verificar contra ops.
// ---------------------------------------------------------------------------
export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// domingo (00:00 local) de la semana que contiene d
export function weekStart(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay());   // getDay(): 0 = domingo
  return x;
}

export interface WeekInfo {
  year: number;
  week: number;
  start: Date;     // domingo
  end: Date;       // sabado
  key: string;     // isoDate(start), usado como week_key
}

// numero de semana: week 1 = la semana (dom-sab) que contiene el 1 de enero del anio del domingo.
export function weekInfo(d: Date): WeekInfo {
  const start = weekStart(d);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const year = start.getFullYear();
  const firstWeekSun = weekStart(new Date(year, 0, 1));
  const week = Math.floor((start.getTime() - firstWeekSun.getTime()) / (7 * 86400000)) + 1;
  return { year, week, start, end, key: isoDate(start) };
}

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
function shortDate(d: Date): string {
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

// rango de fechas de la semana, ej. "Dom 17 Ago - Sab 23 Ago"
export function weekRangeLabel(w: WeekInfo): string {
  return `Dom ${shortDate(w.start)} - Sab ${shortDate(w.end)}`;
}

// etiqueta tipo "Week 34 :: Dom 17 Ago - Sab 23 Ago"
export function weekLabel(w: WeekInfo): string {
  return `Week ${w.week} :: ${weekRangeLabel(w)}`;
}

// lista de las ultimas n semanas (incluida la de hoy), mas nueva primero
export function recentWeeks(today: Date, n: number): WeekInfo[] {
  const out: WeekInfo[] = [];
  const cur = weekStart(today);
  for (let i = 0; i < n; i++) {
    const d = new Date(cur);
    d.setDate(d.getDate() - i * 7);
    out.push(weekInfo(d));
  }
  return out;
}

export interface PlannedRow { alias: string; week_key: string; planned_seconds: number; }

// resuelve el planned de una persona/semana con la misma prioridad que planned_seconds_for:
// persona+semana > persona+standing > team+semana > team+standing. null si no hay nada.
export function resolvePlanned(rows: PlannedRow[], alias: string, weekKey: string): number | null {
  let best: PlannedRow | null = null;
  let bestScore = -1;
  for (const r of rows) {
    if (r.alias !== alias && r.alias !== "") continue;
    if (r.week_key !== weekKey && r.week_key !== "") continue;
    const score = (r.alias !== "" ? 2 : 0) + (r.week_key !== "" ? 1 : 0);
    if (score > bestScore) { bestScore = score; best = r; }
  }
  return best ? best.planned_seconds : null;
}

export type NptStatus = "ok" | "warn" | "bad" | "none";

// estado segun remaining = planned - actual. amarillo cuando queda <= 1h; rojo si se paso.
export function statusFor(plannedSeconds: number | null, actualSeconds: number): NptStatus {
  if (plannedSeconds == null) return "none";
  const remaining = plannedSeconds - actualSeconds;
  if (remaining < 0) return "bad";
  if (remaining <= 3600) return "warn";
  return "ok";
}
