import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { palette } from "../theme";
import { InfoStar } from "./InfoStar";
import { TableSk } from "./skeleton";
import WeekCountdown from "./WeekCountdown";
import { Dropdown } from "./Dropdown";
import {
  NPT_AUX, ANCHOR, dedupePersonDay, fmtHms, weekInfo, weekLabel, weekRangeLabel, recentWeeks, isoDate,
} from "../lib/npt";

// highlight monocromatico dentro del popover
const hi = { color: palette.text, fontWeight: 700 } as React.CSSProperties;

interface Grant { alias: string; }
interface DailyRow { alias: string; work_date: string; aux_seconds: Record<string, number> | null; }
interface PersonNpt { alias: string; days: number; total: number; buckets: Record<string, number>; }
// metricas del parent manager (target del usuario + budget del team), via RPC shared_members_metrics
interface Metric { planned: number | null; teamBudget: number | null; teamUsed: number; teamName: string | null; }

// "Shared with me": personas de OTROS teams que me compartieron (via manager_members). Su NPT es
// visible por RLS (npt_manager_read incluye el grant), pero se muestra APARTE: no entra al budget
// de mi team. Solo lectura + revocar el acceso.
export default function SharedWithMe({ myUserId }: { myUserId: string }) {
  const weeks = useMemo(() => recentWeeks(new Date(), 16), []);
  const [weekKey, setWeekKey] = useState(() => weekInfo(new Date()).key);
  const [aliases, setAliases] = useState<string[]>([]);
  const [rows, setRows] = useState<DailyRow[]>([]);
  const [metrics, setMetrics] = useState<Record<string, Metric>>({});
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const sel = useMemo(() => weekInfo(new Date(weekKey + "T12:00:00")), [weekKey]);

  async function load() {
    setLoading(true);
    setMsg("");
    const { data: g } = await supabase.from("manager_members").select("alias").eq("manager_owner", myUserId);
    const list = ((g as Grant[]) ?? []).map((x) => x.alias);
    setAliases(list);
    if (list.length === 0) { setRows([]); setMetrics({}); setLoading(false); return; }
    const [{ data: d, error }, { data: m }] = await Promise.all([
      supabase.from("npt_daily").select("alias,work_date,aux_seconds")
        .in("alias", list).gte("work_date", isoDate(sel.start)).lte("work_date", isoDate(sel.end)),
      // target del parent + budget/usado del team de cada compartido (RPC security definer)
      supabase.rpc("shared_members_metrics", { p_week_key: sel.key }),
    ]);
    if (error) setMsg("Error: " + error.message);
    setRows((d as DailyRow[]) ?? []);
    const mm: Record<string, Metric> = {};
    for (const row of (m as Array<{ member_alias: string; planned_seconds: number | null; team_budget_seconds: number | null; team_used_seconds: number; member_team_name: string | null }>) ?? []) {
      mm[row.member_alias] = {
        planned: row.planned_seconds, teamBudget: row.team_budget_seconds,
        teamUsed: row.team_used_seconds ?? 0, teamName: row.member_team_name,
      };
    }
    setMetrics(mm);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [myUserId, weekKey, sel.start, sel.end]);

  async function revoke(alias: string) {
    setMsg("");
    const { error } = await supabase.from("manager_members").delete().eq("manager_owner", myUserId).eq("alias", alias);
    if (error) setMsg("Error: " + error.message); else await load();
  }

  // acumula NPT por persona: total + desglose por los 5 buckets (Offline no cuenta)
  const people = useMemo<PersonNpt[]>(() => {
    const by = new Map<string, PersonNpt>();
    for (const a of aliases) by.set(a, { alias: a, days: 0, total: 0, buckets: {} });
    const seen = new Map<string, Set<string>>();
    for (const r of dedupePersonDay(rows)) {
      const p = by.get(r.alias); if (!p) continue;
      const days = seen.get(r.alias) ?? new Set<string>(); days.add(r.work_date); seen.set(r.alias, days);
      for (const [name, sec] of Object.entries(r.aux_seconds || {})) {
        if (name === ANCHOR) continue;
        if ((NPT_AUX as readonly string[]).includes(name)) {
          p.buckets[name] = (p.buckets[name] ?? 0) + (sec as number);
          p.total += sec as number;
        }
      }
    }
    for (const [alias, days] of seen) { const p = by.get(alias); if (p) p.days = days.size; }
    return Array.from(by.values()).sort((a, b) => b.total - a.total || a.alias.localeCompare(b.alias));
  }, [rows, aliases]);

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 16, color: palette.textDim, marginBottom: 4 }}>
            <span style={{ display: "inline-flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>Week <WeekCountdown start={sel.start} /></span>
          </div>
          <Dropdown value={weekKey} onChange={setWeekKey} minWidth={260} ariaLabel="Select week"
            options={weeks.map((w) => ({ value: w.key, label: weekLabel(w) }))} />
        </div>
      </div>

      <div className="npt-title" style={{ fontWeight: 700, fontSize: 28, margin: "0 0 6px" }}>
        Shared with me<InfoStar spin={false}>{
          <>People from <strong style={hi}>other teams</strong> whose manager granted you access. Shown here <strong style={hi}>separately</strong> so they never affect your own team's threshold or numbers. Read-only; you can revoke access anytime.</>
        }</InfoStar>
      </div>
      <div style={{ color: palette.textDim, fontSize: 16, marginBottom: 12 }}>Week {sel.week} :: {weekRangeLabel(sel)}</div>

      {msg && <div style={{ marginBottom: 12, color: msg.startsWith("Error") ? palette.bad : palette.ok, fontSize: 18 }}>{msg}</div>}

      {loading ? (
        <SharedSkeleton />
      ) : aliases.length === 0 ? (
        <div style={{ color: palette.textDim, fontSize: 18 }}>
          Nobody shared with you yet. When another manager approves your request (from a folder or Access &gt; Requests), that person appears here.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 18 }}>
            <thead>
              <tr>
                <th style={th}>Employee</th>
                <th style={{ ...th, textAlign: "center" }}>Days</th>
                {NPT_AUX.map((b) => <th key={b} style={{ ...th, textAlign: "center" }}>{b}</th>)}
                <th style={{ ...th, textAlign: "center" }}>NPT</th>
                <th style={{ ...th, textAlign: "center" }}>Target</th>
                <th style={{ ...th, textAlign: "center" }}>Team available<InfoStar spin={false}>{
                  <>Their team's weekly NPT threshold: <strong style={hi}>remaining</strong> / <strong style={hi}>total</strong>. Set by their own manager; shared with you for context. Applies to the whole team, not just this person.</>
                }</InfoStar></th>
                <th style={{ ...th, textAlign: "center" }}></th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.alias}>
                  <td style={td}><strong>{p.alias}</strong></td>
                  <td style={{ ...td, textAlign: "center" }}>{p.days}</td>
                  {NPT_AUX.map((b) => <td key={b} style={{ ...td, textAlign: "center", fontVariantNumeric: "tabular-nums", color: p.buckets[b] ? palette.text : palette.textDim }}>{fmtHms(p.buckets[b] ?? 0)}</td>)}
                  <td style={{ ...td, textAlign: "center", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtHms(p.total)}</td>
                  {(() => {
                    const met = metrics[p.alias];
                    const planned = met?.planned ?? null;
                    const budget = met?.teamBudget ?? null;
                    const remaining = budget != null ? budget - (met?.teamUsed ?? 0) : null;
                    return (
                      <>
                        <td style={{ ...td, textAlign: "center", fontVariantNumeric: "tabular-nums", color: planned != null ? palette.text : palette.textDim }}>
                          {planned != null ? fmtHms(planned) : "-"}
                        </td>
                        <td style={{ ...td, textAlign: "center", fontVariantNumeric: "tabular-nums", color: budget == null ? palette.textDim : (remaining! < 0 ? palette.bad : palette.text) }}>
                          {budget != null ? `${fmtHms(remaining!)} / ${fmtHms(budget)}` : "-"}
                        </td>
                      </>
                    );
                  })()}
                  <td style={{ ...td, textAlign: "center" }}>
                    <button onClick={() => revoke(p.alias)} className="npt-btn-remove" style={{ fontSize: 14, padding: "4px 8px" }}>Revoke</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// skeleton 1:1 (controles + titulo ya se renderizan arriba): tabla de 11 columnas sin caja
// (Employee, Days, Meeting, Training, Project, Personal, System, NPT, Target, Team available, accion)
function SharedSkeleton() {
  return <TableSk template="2fr 60px 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1.2fr 44px" rows={4} />;
}

const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", color: palette.textDim, fontWeight: 600, borderBottom: `1px solid ${palette.border}` };
const td: React.CSSProperties = { padding: "8px 10px", borderBottom: `1px solid ${palette.border}` };
