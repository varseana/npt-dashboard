import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  computeDay, dedupePersonDay, weekInfo, isoDate, resolveTeamBudget,
  type NptDailyRow, type TeamBudgetRow,
} from "../lib/npt";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const CELL = 15, GAP = 5;
const FALLBACK_THRESHOLD = 10 * 3600;   // si el team no tiene threshold seteado esa semana

interface WeekCell { key: string; start: Date; wnum: number; month: number; }
interface Tip { show: boolean; x: number; y: number; month: number; wnum: number; }

// escala de MATIZ (color pleno, no opacidad): sano=verde y se mantiene verde hasta ~medio budget,
// de ahi vira a amarillo al acercarse al limite; pasado el limite -> rojo; muy pasado -> rojo oscuro.
// (celdas sin data se pintan negras via CSS .nodata, no pasan por aca)
function fillFor(used: number, threshold: number): string {
  if (threshold <= 0) return "var(--ok)";
  const r = used / threshold;
  if (r <= 1) {                                             // dentro del budget: verde -> amarillo
    const t = Math.round(Math.max(0, (r - 0.5) / 0.5) * 100);
    return `color-mix(in srgb, var(--warn) ${t}%, var(--ok))`;
  }
  if (r <= 1.5) {                                           // pasado el budget: amarillo -> rojo pleno a 1.5x
    const t = Math.round(((r - 1) / 0.5) * 100);
    return `color-mix(in srgb, var(--bad) ${t}%, var(--warn))`;
  }
  const t = Math.round(Math.min(1, (r - 1.5) / 1) * 100);   // muy pasado: rojo -> rojo oscuro a 2.5x
  return `color-mix(in srgb, var(--bad2) ${t}%, var(--bad))`;
}

// Heatmap semanal (estilo GitHub, horizontal): 1 cuadro por semana del ultimo anio. Columnas = meses
// (izq->der), filas = semanas del mes (bajan), padding para cerrar el rectangulo. Color = NPT usado del
// team vs su threshold de esa semana. Click en una semana CON data -> setea la semana del dashboard.
export default function WeekHeatmap({ teamId, weekKey, onSelectWeek, refreshKey }:
  { teamId?: string; weekKey: string; onSelectWeek: (k: string) => void; refreshKey?: number }) {
  const [rows, setRows] = useState<NptDailyRow[]>([]);
  const [budget, setBudget] = useState<TeamBudgetRow[]>([]);
  const [tip, setTip] = useState<Tip>({ show: false, x: 0, y: 0, month: 0, wnum: 0 });

  // fetch de la data del team (rango amplio; el pilot es chico). la grilla se deriva de la data.
  useEffect(() => {
    if (!teamId) { setRows([]); setBudget([]); return; }
    let alive = true;
    (async () => {
      const lower = new Date(); lower.setFullYear(lower.getFullYear() - 2);
      const [{ data: d }, { data: b }] = await Promise.all([
        supabase.from("npt_daily").select("alias,work_date,aux_seconds")
          .eq("team_id", teamId).gte("work_date", isoDate(lower)),
        supabase.from("npt_team_budget").select("week_key,planned_seconds").eq("team_id", teamId),
      ]);
      if (!alive) return;
      setRows((d as NptDailyRow[]) ?? []);
      setBudget((b as TeamBudgetRow[]) ?? []);
    })();
    return () => { alive = false; };
  }, [teamId, refreshKey]);

  // NPT usado por semana (dedup por alias+dia) + primera semana con data.
  // presencia de la key = hubo data esa semana.
  const { usedByWeek, firstWeekStart } = useMemo(() => {
    const m = new Map<string, number>();
    let earliest: Date | null = null;
    for (const r of dedupePersonDay(rows)) {
      const wi = weekInfo(new Date(r.work_date + "T12:00:00"));
      m.set(wi.key, (m.get(wi.key) || 0) + computeDay(r.aux_seconds).nptSeconds);
      if (!earliest || wi.start < earliest) earliest = wi.start;
    }
    return { usedByWeek: m, firstWeekStart: earliest };
  }, [rows]);

  // grilla horizontal: arranca en la PRIMERA semana con data (izquierda) y se extiende un ANIO completo
  // (52 semanas) hacia la derecha aunque no haya data aun, para que el dashboard se vea "lleno"/preparado
  // y los cuadros futuros se vayan poblando con el avance del pilot. si el pilot supera el anio, sigue
  // creciendo. sin data todavia -> arranca en la semana actual.
  const weeks = useMemo<WeekCell[]>(() => {
    const cur = weekInfo(new Date()).start;
    const startBase = firstWeekStart ? new Date(firstWeekStart) : new Date(cur);
    const FULL_YEAR = 52, WEEKS_AHEAD = 8;
    const elapsed = Math.max(0, Math.round((cur.getTime() - startBase.getTime()) / (7 * 864e5)));
    const total = Math.max(FULL_YEAR, elapsed + 1 + WEEKS_AHEAD);
    const out: WeekCell[] = [];
    for (let i = 0; i < total; i++) {
      const d = new Date(startBase); d.setDate(d.getDate() + i * 7);
      const wi = weekInfo(d);
      out.push({ key: wi.key, start: wi.start, wnum: wi.week, month: wi.start.getMonth() });
    }
    return out;
  }, [firstWeekStart]);

  // agrupar semanas por mes -> columnas
  const { groups, maxRows } = useMemo(() => {
    const gs: WeekCell[][] = []; let curKey = -1;
    for (const w of weeks) {
      if (w.month !== curKey) { gs.push([]); curKey = w.month; }
      gs[gs.length - 1].push(w);
    }
    return { groups: gs, maxRows: gs.reduce((mx, g) => Math.max(mx, g.length), 0) };
  }, [weeks]);

  function onMove(e: React.MouseEvent) {
    const el = (e.target as HTMLElement).closest("[data-wk]") as HTMLElement | null;
    // sin data (o padding): no dice nada, no tooltip
    if (!el || el.dataset.hasdata !== "1") { setTip((t) => ({ ...t, show: false })); return; }
    const r = el.getBoundingClientRect();
    setTip({ show: true, x: r.left + r.width / 2, y: r.top - 8, month: +el.dataset.mo!, wnum: +el.dataset.wn! });
  }
  function onClickCell(e: React.MouseEvent) {
    const el = (e.target as HTMLElement).closest("[data-wk]") as HTMLElement | null;
    if (!el || el.dataset.hasdata !== "1") return;   // sin data: no clickeable
    onSelectWeek(el.dataset.wk!);
  }

  return (
    <div className="npt-hm" onMouseLeave={() => setTip((t) => ({ ...t, show: false }))}>
      <div className="npt-hm-matrix" onMouseMove={onMove} onClick={onClickCell}
        style={{ display: "grid", gridAutoFlow: "column", gap: GAP,
          gridTemplateColumns: `repeat(${groups.length}, ${CELL}px)`, gridTemplateRows: `repeat(${maxRows}, ${CELL}px)` }}>
        {groups.map((g, gi) => (
          Array.from({ length: maxRows }, (_, r) => {
            if (r >= g.length) return <span key={gi + "-" + r} className="npt-hm-cell pad" />;
            const w = g[r];
            const hasData = usedByWeek.has(w.key);
            const used = usedByWeek.get(w.key) ?? 0;
            const thr = resolveTeamBudget(budget, w.key) ?? FALLBACK_THRESHOLD;
            const fill = hasData ? fillFor(used, thr) : "";
            const sel = w.key === weekKey;
            return (
              <span key={w.key} data-wk={w.key} data-mo={w.month} data-wn={w.wnum} data-hasdata={hasData ? "1" : "0"}
                className={"npt-hm-cell" + (hasData ? "" : " nodata") + (sel ? " sel" : "")}
                style={fill ? { background: fill, borderColor: "transparent" } : undefined} />
            );
          })
        ))}
      </div>

      {tip.show && (
        <div className="npt-hm-tip" style={{ position: "fixed", left: tip.x, top: tip.y, transform: "translate(-50%, -100%)" }}>
          <div className="npt-hm-tip-mo">&gt;&gt;{MONTHS[tip.month].toUpperCase()}</div>
          <div className="npt-hm-tip-wk">::Week {tip.wnum}::</div>
        </div>
      )}
    </div>
  );
}
