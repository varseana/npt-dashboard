import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { palette } from "../theme";
import { aggregateByUser, fmtHrs, fmtPct, type NptDailyRow } from "../lib/npt";

interface Team { id: string; name: string; npt_target_pct: number; }

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function Overview({ team }: { team: Team }) {
  const [from, setFrom] = useState(isoDaysAgo(13));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [rows, setRows] = useState<NptDailyRow[]>([]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr("");
      const [{ data: cfg }, { data: d, error }] = await Promise.all([
        supabase.from("npt_config").select("excluded_aux").eq("team_id", team.id).maybeSingle(),
        supabase
          .from("npt_daily")
          .select("alias,tenant,work_date,profile,aux_seconds")
          .eq("team_id", team.id)
          .gte("work_date", from)
          .lte("work_date", to),
      ]);
      if (cancelled) return;
      if (error) setErr(error.message);
      setExcluded((cfg?.excluded_aux as string[]) ?? []);
      setRows((d as NptDailyRow[]) ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [team.id, from, to]);

  const target = team.npt_target_pct / 100;
  const users = useMemo(() => aggregateByUser(rows, excluded, target), [rows, excluded, target]);

  const teamNpt = users.reduce((a, u) => a + u.nptSeconds, 0);
  const teamTracked = users.reduce((a, u) => a + u.trackedSeconds, 0);
  const teamPct = teamTracked ? teamNpt / teamTracked : 0;
  const overCount = users.filter((u) => u.overTarget).length;

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 16 }}>
        <Field label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={input} /></Field>
        <Field label="To"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={input} /></Field>
        <div style={{ color: palette.textDim, fontSize: 13 }}>Target: {team.npt_target_pct}%</div>
      </div>

      {err && <div style={{ color: palette.over, marginBottom: 12 }}>{err}</div>}
      {loading ? (
        <div style={{ color: palette.textDim }}>Loading...</div>
      ) : users.length === 0 ? (
        <div style={{ color: palette.textDim }}>No reported data in this range yet.</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
            <Stat label="Investigators reporting" value={String(users.length)} />
            <Stat label="Team NPT (avg)" value={fmtPct(teamPct)} tone={teamPct > target ? "over" : "under"} />
            <Stat label="Over target" value={`${overCount} / ${users.length}`} tone={overCount ? "over" : "under"} />
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr>
                {["#", "Investigator", "Days", "Avg NPT %", "Total NPT", "Status"].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.alias} style={{ background: i % 2 ? palette.panel : palette.panelAlt }}>
                  <td style={td}>{i + 1}</td>
                  <td style={td}>{u.alias}{u.tenant ? <span style={{ color: palette.textDim }}> ({u.tenant})</span> : null}</td>
                  <td style={td}>{u.daysReported}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{fmtPct(u.avgNptPct)}</td>
                  <td style={td}>{fmtHrs(u.nptSeconds)}</td>
                  <td style={{ ...td, color: u.overTarget ? palette.over : palette.under }}>
                    {u.overTarget ? "Over target" : "On target"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: palette.textDim, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "over" | "under" }) {
  return (
    <div style={{ background: palette.panel, border: `1px solid ${palette.border}`, borderRadius: 12, padding: "12px 16px", minWidth: 140 }}>
      <div style={{ fontSize: 12, color: palette.textDim }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: tone === "over" ? palette.over : tone === "under" ? palette.under : palette.accentSoft }}>{value}</div>
    </div>
  );
}

const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", color: palette.textDim, fontWeight: 600, borderBottom: `1px solid ${palette.border}` };
const td: React.CSSProperties = { padding: "8px 10px", borderBottom: `1px solid ${palette.border}` };
const input: React.CSSProperties = { background: palette.panel, color: palette.text, border: `1px solid ${palette.border}`, borderRadius: 8, padding: "7px 9px", fontSize: 14 };
