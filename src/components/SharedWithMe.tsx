import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { palette } from "../theme";
import { InfoStar } from "./InfoStar";
import { TableSkeleton } from "./skeleton";
import WeekCountdown from "./WeekCountdown";
import {
  NPT_AUX, ANCHOR, fmtHms, weekInfo, weekLabel, weekRangeLabel, recentWeeks, isoDate,
} from "../lib/npt";

// highlight monocromatico dentro del popover
const hi = { color: palette.text, fontWeight: 700 } as React.CSSProperties;

interface Grant { alias: string; }
interface DailyRow { alias: string; work_date: string; aux_seconds: Record<string, number> | null; }
interface PersonNpt { alias: string; days: number; total: number; buckets: Record<string, number>; }

// "Shared with me": personas de OTROS teams que me compartieron (via manager_members). Su NPT es
// visible por RLS (npt_manager_read incluye el grant), pero se muestra APARTE: no entra al budget
// de mi team. Solo lectura + revocar el acceso.
export default function SharedWithMe({ myUserId }: { myUserId: string }) {
  const weeks = useMemo(() => recentWeeks(new Date(), 16), []);
  const [weekKey, setWeekKey] = useState(() => weekInfo(new Date()).key);
  const [aliases, setAliases] = useState<string[]>([]);
  const [rows, setRows] = useState<DailyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const sel = useMemo(() => weekInfo(new Date(weekKey + "T12:00:00")), [weekKey]);

  async function load() {
    setLoading(true);
    setMsg("");
    const { data: g } = await supabase.from("manager_members").select("alias").eq("manager_owner", myUserId);
    const list = ((g as Grant[]) ?? []).map((x) => x.alias);
    setAliases(list);
    if (list.length === 0) { setRows([]); setLoading(false); return; }
    const { data: d, error } = await supabase.from("npt_daily")
      .select("alias,work_date,aux_seconds")
      .in("alias", list)
      .gte("work_date", isoDate(sel.start))
      .lte("work_date", isoDate(sel.end));
    if (error) setMsg("Error: " + error.message);
    setRows((d as DailyRow[]) ?? []);
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
    for (const r of rows) {
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
          <select value={weekKey} onChange={(e) => setWeekKey(e.target.value)} style={select}>
            {weeks.map((w) => (<option key={w.key} value={w.key}>{weekLabel(w)}</option>))}
          </select>
        </div>
      </div>

      <div className="npt-title" style={{ fontWeight: 700, fontSize: 28, margin: "0 0 6px" }}>
        Shared with me<InfoStar spin={false}>{
          <>People from <strong style={hi}>other teams</strong> whose manager granted you access. Shown here <strong style={hi}>separately</strong> so they never affect your own team's budget or numbers. Read-only; you can revoke access anytime.</>
        }</InfoStar>
      </div>
      <div style={{ color: palette.textDim, fontSize: 16, marginBottom: 12 }}>Week {sel.week} :: {weekRangeLabel(sel)}</div>

      {msg && <div style={{ marginBottom: 12, color: msg.startsWith("Error") ? palette.bad : palette.ok, fontSize: 18 }}>{msg}</div>}

      {loading ? (
        <TableSkeleton rows={4} cols={9} />
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

const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", color: palette.textDim, fontWeight: 600, borderBottom: `1px solid ${palette.border}` };
const td: React.CSSProperties = { padding: "8px 10px", borderBottom: `1px solid ${palette.border}` };
const input: React.CSSProperties = { background: palette.panel, color: palette.text, border: `1px solid ${palette.border}`, borderRadius: 8, padding: "7px 9px", fontSize: 19 };
const select: React.CSSProperties = { ...input, minWidth: 260 };
