import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { palette } from "../theme";
import {
  NPT_AUX, fmtHms, resolvePlanned, statusFor,
  weekInfo, weekLabel, recentWeeks, isoDate,
  type NptDailyRow, type NptStatus, type PlannedRow,
} from "../lib/npt";
import { StatusChip } from "./status";
import { InfoStar } from "./InfoStar";
import { TableSkeleton } from "./skeleton";

interface Team { id: string; name: string; npt_target_pct: number; }
// highlight monocromatico dentro del texto del popover (bold en color de texto full)
const hi = { color: palette.text, fontWeight: 700 } as React.CSSProperties;

interface Row {
  alias: string;
  perAux: Record<string, number>;   // segundos por cada uno de los 5 AUX de NPT
  nptSeconds: number;               // total NPT (= actual)
  planned: number | null;
  remaining: number | null;
  status: NptStatus;
}

const STATUS_RANK: Record<NptStatus, number> = { bad: 0, warn: 1, ok: 2, none: 3 };

// desglose por AUX de NPT (los 5 que cuentan), estilo Excel, con Planned/Actual/Remaining/status.
export default function Distribution({ team, refreshKey }: { team: Team; refreshKey?: number }) {
  const weeks = useMemo(() => recentWeeks(new Date(), 16), []);
  const [weekKey, setWeekKey] = useState(() => weekInfo(new Date()).key);
  const [rows, setRows] = useState<NptDailyRow[]>([]);
  const [planned, setPlanned] = useState<PlannedRow[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const first = useRef(true);

  const sel = useMemo(() => weekInfo(new Date(weekKey + "T12:00:00")), [weekKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (first.current) setLoading(true);
      setErr("");
      const [{ data: d, error }, { data: p }] = await Promise.all([
        supabase
          .from("npt_daily")
          .select("alias,tenant,work_date,profile,aux_seconds")
          .eq("team_id", team.id)
          .gte("work_date", isoDate(sel.start))
          .lte("work_date", isoDate(sel.end)),
        supabase.from("npt_planned").select("alias,week_key,planned_seconds").eq("team_id", team.id),
      ]);
      if (cancelled) return;
      if (error) setErr(error.message);
      setRows((d as NptDailyRow[]) ?? []);
      setPlanned((p as PlannedRow[]) ?? []);
      first.current = false;
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [team.id, weekKey, refreshKey, sel.start, sel.end]);

  const matrix: Row[] = useMemo(() => {
    const byUser = new Map<string, Row>();
    for (const r of rows) {
      let u = byUser.get(r.alias);
      if (!u) {
        const perAux: Record<string, number> = {};
        for (const c of NPT_AUX) perAux[c] = 0;
        u = { alias: r.alias, perAux, nptSeconds: 0, planned: null, remaining: null, status: "none" };
        byUser.set(r.alias, u);
      }
      for (const c of NPT_AUX) {
        const s = (r.aux_seconds && r.aux_seconds[c]) || 0;
        u.perAux[c] += s;
        u.nptSeconds += s;
      }
    }
    const out = Array.from(byUser.values());
    for (const u of out) {
      u.planned = resolvePlanned(planned, u.alias, weekKey);
      u.remaining = u.planned != null ? u.planned - u.nptSeconds : null;
      u.status = statusFor(u.planned, u.nptSeconds);
    }
    out.sort((a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      b.nptSeconds - a.nptSeconds ||
      a.alias.localeCompare(b.alias));
    return out;
  }, [rows, planned, weekKey]);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? matrix.filter((u) => u.alias.toLowerCase().includes(q)) : matrix;
  }, [matrix, filter]);

  function exportCsv() {
    const head = ["Employee", ...NPT_AUX, "Planned", "Total NPT", "Remaining", "Status"];
    const lines = [head.map(csv).join(",")];
    for (const u of shown) {
      const cells = [
        u.alias,
        ...NPT_AUX.map((c) => fmtHms(u.perAux[c] || 0)),
        u.planned != null ? fmtHms(u.planned) : "",
        fmtHms(u.nptSeconds),
        u.remaining != null ? fmtHms(u.remaining) : "",
        u.status,
      ];
      lines.push(cells.map((x) => csv(String(x))).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `npt-distribution_week${sel.week}_${sel.key}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 16 }}>
        <Field label="Week">
          <select value={weekKey} onChange={(e) => setWeekKey(e.target.value)} style={select}>
            {weeks.map((w) => (<option key={w.key} value={w.key}>{weekLabel(w)}</option>))}
          </select>
        </Field>
        <Field label="Filter user">
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="username" style={input} />
        </Field>
        <button onClick={exportCsv} disabled={!shown.length} style={csvBtn}>Export CSV</button>
      </div>

      {err && <div style={{ color: palette.bad, marginBottom: 12 }}>{err}</div>}
      {loading ? (
        <TableSkeleton rows={6} cols={8} />
      ) : matrix.length === 0 ? (
        <div style={{ color: palette.textDim }}>No reported data for {weekLabel(sel)}.</div>
      ) : (
        <div style={{ overflowX: "auto", border: `1px solid ${palette.border}`, borderRadius: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 18, whiteSpace: "nowrap" }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left" }}>Employee</th>
                {NPT_AUX.map((c) => (<th key={c} style={th}>{c}</th>))}
                <th style={th}>Planned<InfoStar spin={false}>{
                  <>Weekly NPT target for this employee, set in the Planned tab. Shown in Hh:mm:ss.</>
                }</InfoStar></th>
                <th style={th}>Total NPT<InfoStar spin={false}>{
                  <><strong style={hi}>Total NPT = Actual</strong> = the sum of the 5 activity columns / <strong style={hi}>Meeting + Training + Project + Personal + System</strong>. Those columns are the <strong style={hi}>why over target</strong>. Shown in Hh:mm:ss.</>
                }</InfoStar></th>
                <th style={th}>Remaining<InfoStar spin={false}>{
                  <><strong style={hi}>Remaining = Planned - Actual</strong>. Positive means plan left, negative means over. Shown in Hh:mm:ss.</>
                }</InfoStar></th>
                <th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((u, i) => (
                <tr key={u.alias} style={{ background: i % 2 ? palette.panelAlt : palette.panel }}>
                  <td style={{ ...td, textAlign: "left", fontWeight: 600 }}>{u.alias}</td>
                  {NPT_AUX.map((c) => (
                    <td key={c} style={{ ...td, color: u.perAux[c] ? palette.text : palette.textDim }}>{u.perAux[c] ? fmtHms(u.perAux[c]) : "-"}</td>
                  ))}
                  <td style={{ ...td, color: palette.textDim }}>{u.planned != null ? fmtHms(u.planned) : "-"}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{fmtHms(u.nptSeconds)}</td>
                  <td style={{ ...td, color: remainingColor(u.status) }}>{u.remaining != null ? fmtHms(u.remaining) : "-"}</td>
                  <td style={td}><StatusChip status={u.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function remainingColor(s: NptStatus): string {
  return s === "bad" ? palette.bad : s === "warn" ? palette.warn : s === "ok" ? palette.ok : palette.textDim;
}

function csv(s: string) { return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 16, color: palette.textDim, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

const th: React.CSSProperties = { textAlign: "right", padding: "9px 12px", color: palette.textDim, fontWeight: 600, borderBottom: `1px solid ${palette.border}`, position: "sticky", top: 0, background: palette.bg };
const td: React.CSSProperties = { textAlign: "right", padding: "8px 12px", borderBottom: `1px solid ${palette.border}` };
const input: React.CSSProperties = { background: palette.panel, color: palette.text, border: `1px solid ${palette.border}`, borderRadius: 8, padding: "7px 9px", fontSize: 19 };
const select: React.CSSProperties = { ...input, minWidth: 260 };
const csvBtn: React.CSSProperties = { marginLeft: "auto", background: palette.text, color: palette.accentText, border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 18, cursor: "pointer", fontWeight: 600 };
