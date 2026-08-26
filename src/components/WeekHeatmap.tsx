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

// escala continua (misma que el mockup): dentro=verde por uso, sobre=rojo, vacio=casi invisible.
function fillFor(used: number, threshold: number): string {
  if (used <= 0 || threshold <= 0) return "";
  const r = used / threshold;
  if (r <= 1) { const p = [12, 24, 38, 54, 72, 92]; return `color-mix(in srgb, var(--ok) ${p[Math.min(5, Math.floor(r * 6))]}%, transparent)`; }
  const o = Math.min(1, (r - 1) / 0.5);
  return `color-mix(in srgb, var(--bad) ${55 + Math.round(o * 45)}%, transparent)`;
}

// Heatmap semanal (estilo GitHub, horizontal): 1 cuadro por semana del ultimo anio. Columnas = meses
// (izq->der), filas = semanas del mes (bajan), padding para cerrar el rectangulo. Color = NPT usado del
// team vs su threshold de esa semana. Click en una semana CON data -> setea la semana del dashboard.
export default function WeekHeatmap({ teamId, weekKey, onSelectWeek, refreshKey }:
  { teamId?: string; weekKey: string; onSelectWeek: (k: string) => void; refreshKey?: number }) {
  const [rows, setRows] = useState<NptDailyRow[]>([]);
  const [budget, setBudget] = useState<TeamBudgetRow[]>([]);
  const [tip, setTip] = useState<Tip>({ show: false, x: 0, y: 0, month: 0, wnum: 0 });

  // ultimas 52 semanas (domingo-based), mas nueva al final
  const weeks = useMemo<WeekCell[]>(() => {
    const cur = weekInfo(new Date()).start;
    const out: WeekCell[] = [];
    for (let i = 51; i >= 0; i--) {
      const d = new Date(cur); d.setDate(d.getDate() - i * 7);
      const wi = weekInfo(d);
      out.push({ key: wi.key, start: wi.start, wnum: wi.week, month: wi.start.getMonth() });
    }
    return out;
  }, []);

  useEffect(() => {
    if (!teamId) { setRows([]); setBudget([]); return; }
    let alive = true;
    (async () => {
      const start = weeks[0].start;
      const end = new Date(weeks[weeks.length - 1].start); end.setDate(end.getDate() + 6);
      const [{ data: d }, { data: b }] = await Promise.all([
        supabase.from("npt_daily").select("alias,work_date,aux_seconds")
          .eq("team_id", teamId).gte("work_date", isoDate(start)).lte("work_date", isoDate(end)),
        supabase.from("npt_team_budget").select("week_key,planned_seconds").eq("team_id", teamId),
      ]);
      if (!alive) return;
      setRows((d as NptDailyRow[]) ?? []);
      setBudget((b as TeamBudgetRow[]) ?? []);
    })();
    return () => { alive = false; };
  }, [teamId, refreshKey, weeks]);

  // NPT usado por semana (dedup por alias+dia). presencia de la key = hubo data esa semana.
  const usedByWeek = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of dedupePersonDay(rows)) {
      const wk = weekInfo(new Date(r.work_date + "T12:00:00")).key;
      m.set(wk, (m.get(wk) || 0) + computeDay(r.aux_seconds).nptSeconds);
    }
    return m;
  }, [rows]);

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
