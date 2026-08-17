import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { palette } from "../theme";
import { AUX_ORDER, ANCHOR, computeDay, type NptDailyRow } from "../lib/npt";

interface Team { id: string; name: string; npt_target_pct: number; }

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

interface Row {
  alias: string;
  tenant: string | null;
  perAux: Record<string, number>;   // segundos por AUX (todos menos Offline)
  nptSeconds: number;
  trackedSeconds: number;
  nptPct: number;
}

// espeja la hoja "NPT Distribution" del Excel: una fila por investigador,
// una columna por bucket de AUX, mas total NPT / % / status.
export default function Distribution({ team }: { team: Team }) {
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
  const exSet = useMemo(() => new Set(excluded), [excluded]);

  // categorias de AUX presentes (Offline es ancla, no entra), ordenadas por AUX_ORDER
  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const r of rows) for (const k of Object.keys(r.aux_seconds || {})) if (k !== ANCHOR) seen.add(k);
    const arr = Array.from(seen);
    arr.sort((a, b) => {
      const ia = AUX_ORDER.indexOf(a), ib = AUX_ORDER.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    });
    return arr;
  }, [rows]);

  const matrix: Row[] = useMemo(() => {
    const byUser = new Map<string, Row>();
    for (const r of rows) {
      let u = byUser.get(r.alias);
      if (!u) { u = { alias: r.alias, tenant: r.tenant, perAux: {}, nptSeconds: 0, trackedSeconds: 0, nptPct: 0 }; byUser.set(r.alias, u); }
      for (const [name, sec] of Object.entries(r.aux_seconds || {})) {
        if (name === ANCHOR) continue;
        u.perAux[name] = (u.perAux[name] || 0) + sec;
      }
      const d = computeDay(r.aux_seconds, excluded);
      u.nptSeconds += d.nptSeconds;
      u.trackedSeconds += d.trackedSeconds;
    }
    const out = Array.from(byUser.values());
    for (const u of out) u.nptPct = u.trackedSeconds ? u.nptSeconds / u.trackedSeconds : 0;
    out.sort((a, b) => b.nptPct - a.nptPct);
    return out;
  }, [rows, excluded]);

  function hrs(sec: number): string {
    if (!sec) return "-";
    return (sec / 3600).toFixed(2);
  }

  function exportCsv() {
    const head = ["Investigator", "Tenant", ...categories.map((c) => c + " (h)" + (exSet.has(c) ? " [excl]" : "")), "Total NPT (h)", "NPT %", "Status"];
    const lines = [head.map(csv).join(",")];
    for (const u of matrix) {
      const cells = [
        u.alias, u.tenant || "",
        ...categories.map((c) => ((u.perAux[c] || 0) / 3600).toFixed(2)),
        (u.nptSeconds / 3600).toFixed(2),
        (u.nptPct * 100).toFixed(2) + "%",
        u.nptPct > target ? "Over" : "On",
      ];
      lines.push(cells.map((x) => csv(String(x))).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `npt-distribution_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 16 }}>
        <Field label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={input} /></Field>
        <Field label="To"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={input} /></Field>
        <div style={{ color: palette.textDim, fontSize: 13 }}>Target: {team.npt_target_pct}%</div>
        <button onClick={exportCsv} disabled={!matrix.length} style={csvBtn}>Export CSV</button>
      </div>

      {err && <div style={{ color: palette.over, marginBottom: 12 }}>{err}</div>}
      {loading ? (
        <div style={{ color: palette.textDim }}>Loading...</div>
      ) : matrix.length === 0 ? (
        <div style={{ color: palette.textDim }}>No reported data in this range yet.</div>
      ) : (
        <div style={{ overflowX: "auto", border: `1px solid ${palette.border}`, borderRadius: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, whiteSpace: "nowrap" }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left" }}>Investigator</th>
                {categories.map((c) => (
                  <th key={c} style={{ ...th, ...(exSet.has(c) ? { color: palette.under, textDecoration: "line-through" } : {}) }} title={exSet.has(c) ? "excluded from NPT by config" : ""}>
                    {c}
                  </th>
                ))}
                <th style={th}>Total NPT</th>
                <th style={th}>NPT %</th>
                <th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {matrix.map((u, i) => (
                <tr key={u.alias} style={{ background: i % 2 ? palette.panelAlt : palette.panel }}>
                  <td style={{ ...td, textAlign: "left", fontWeight: 600 }}>
                    {u.alias}{u.tenant ? <span style={{ color: palette.textDim, fontWeight: 400 }}> ({u.tenant})</span> : null}
                  </td>
                  {categories.map((c) => (
                    <td key={c} style={{ ...td, color: exSet.has(c) ? palette.under : palette.text }}>{hrs(u.perAux[c] || 0)}</td>
                  ))}
                  <td style={{ ...td, fontWeight: 600 }}>{hrs(u.nptSeconds)}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{(u.nptPct * 100).toFixed(2)}%</td>
                  <td style={td}>{u.nptPct > target ? <Chip filled>Over</Chip> : <Chip>On</Chip>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ color: palette.textDim, fontSize: 11, marginTop: 8 }}>
        Values in hours. Columns struck through are excluded from NPT in Config. Offline (shift anchor) is not shown.
      </div>
    </div>
  );
}

function csv(s: string) { return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: palette.textDim, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

function Chip({ children, filled }: { children: React.ReactNode; filled?: boolean }) {
  return (
    <span style={{
      fontSize: 12,
      padding: "2px 8px",
      borderRadius: 999,
      border: `1px solid ${palette.text}`,
      background: filled ? palette.text : "transparent",
      color: filled ? "#fff" : palette.text,
    }}>{children}</span>
  );
}

const th: React.CSSProperties = { textAlign: "right", padding: "9px 12px", color: palette.textDim, fontWeight: 600, borderBottom: `1px solid ${palette.border}`, position: "sticky", top: 0, background: palette.bg };
const td: React.CSSProperties = { textAlign: "right", padding: "8px 12px", borderBottom: `1px solid ${palette.border}` };
const input: React.CSSProperties = { background: palette.panel, color: palette.text, border: `1px solid ${palette.border}`, borderRadius: 8, padding: "7px 9px", fontSize: 14 };
const csvBtn: React.CSSProperties = { marginLeft: "auto", background: palette.text, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer", fontWeight: 600 };
