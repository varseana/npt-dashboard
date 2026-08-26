import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { palette } from "../theme";
import { computeDay, dedupePersonDay, fmtHms, type NptDailyRow } from "../lib/npt";
import { Bar } from "./skeleton";
import { Dropdown } from "./Dropdown";

// UUID fijo del team Unassigned (igual que en el trigger set_team_from_code)
const UNASSIGNED_ID = "00000000-0000-0000-0000-000000000001";

interface Team { id: string; name: string }
interface Row { alias: string; nptSeconds: number; days: number }

// vista admin: gente que reporta NPT pero cayo en "Unassigned" (codigo invalido/sin manager).
// Al asignarlos a un team real, su NPT (incluso historico) pasa a contar bajo ese team.
export default function Unassigned({ teams, refreshKey }: { teams: Team[]; refreshKey: number }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const targets = useMemo(() => teams.filter((t) => t.id !== UNASSIGNED_ID), [teams]);

  async function load(spin = false) {
    if (spin) setLoading(true);
    const { data, error } = await supabase.from("npt_daily")
      .select("alias,aux_seconds,work_date").eq("team_id", UNASSIGNED_ID);
    if (error) setMsg("Error: " + error.message);
    const m = new Map<string, Row>();
    for (const r of dedupePersonDay((data as NptDailyRow[]) ?? [])) {
      const a = m.get(r.alias) || { alias: r.alias, nptSeconds: 0, days: 0 };
      a.nptSeconds += computeDay(r.aux_seconds).nptSeconds;
      a.days += 1;
      m.set(r.alias, a);
    }
    setRows([...m.values()].sort((a, b) => a.alias.localeCompare(b.alias)));
    setLoading(false);
  }

  useEffect(() => { load(true); /* eslint-disable-next-line */ }, []);
  useEffect(() => { if (refreshKey > 0) load(false); /* eslint-disable-next-line */ }, [refreshKey]);

  async function assign(alias: string) {
    const team = pick[alias];
    if (!team) { setMsg("Pick a team for " + alias + " first."); return; }
    setMsg("");
    const { error } = await supabase.rpc("admin_assign_alias", { p_alias: alias, p_team: team });
    if (error) { setMsg("Error: " + error.message); load(false); return; }
    setRows((rs) => rs.filter((r) => r.alias !== alias));   // ya salio de Unassigned
  }

  if (loading) return <UnassignedSkeleton />;

  return (
    <div>
      <div className="npt-title" style={{ fontWeight: 700, fontSize: 28, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
        "Unassigned" // no manager ({rows.length})
      </div>
      <div style={{ color: palette.textDim, fontSize: 18, marginBottom: 16 }}>
        People reporting NPT with an invalid/empty enrollment code, or not tied to any team. Assign one to
        a team to move their NPT (including history) under that team and its threshold.
      </div>
      {msg && <div style={{ marginBottom: 12, color: msg.startsWith("Error") ? palette.bad : palette.warn, fontSize: 18 }}>{msg}</div>}

      <div style={{ border: `1px solid ${palette.border}`, borderRadius: 0, overflow: "hidden" }}>
        {rows.length === 0 ? (
          <div style={{ padding: "12px 14px", color: palette.textDim, fontSize: 18 }}>Nobody is unassigned. </div>
        ) : rows.map((r) => (
          <div key={r.alias} style={{ display: "grid", gridTemplateColumns: "1.2fr auto 1fr auto", gap: 12, alignItems: "center", padding: "12px 14px", borderBottom: `1px solid ${palette.border}` }}>
            <span style={{ fontWeight: 600, fontSize: 19 }}>{r.alias}</span>
            <span style={{ color: palette.textDim, fontSize: 16, whiteSpace: "nowrap" }}>{r.days}d :: {fmtHms(r.nptSeconds)} NPT</span>
            <Dropdown fill value={pick[r.alias] ?? ""} ariaLabel="Move to team"
              onChange={(v) => setPick((p) => ({ ...p, [r.alias]: v }))}
              options={[{ value: "", label: "Move to team..." }, ...targets.map((t) => ({ value: t.id, label: t.name }))]} />
            <button onClick={() => assign(r.alias)} disabled={!pick[r.alias]} style={btn}>Assign</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// skeleton 1:1: titulo + descripcion -> caja bordeada de filas (alias, stats, dropdown "move to team", boton assign)
function UnassignedSkeleton() {
  return (
    <div>
      <Bar w={320} h={28} style={{ marginBottom: 10 }} />
      <Bar w="90%" h={16} style={{ marginBottom: 6 }} />
      <Bar w="70%" h={16} style={{ marginBottom: 16 }} />
      <div style={{ border: `1px solid ${palette.border}`, borderRadius: 0, overflow: "hidden" }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1.2fr auto 1fr auto", gap: 12, alignItems: "center", padding: "12px 14px", borderBottom: i < 3 ? `1px solid ${palette.border}` : "none" }}>
            <Bar w={140} h={16} /><Bar w={120} h={14} /><Bar w={180} h={40} /><Bar w={80} h={38} />
          </div>
        ))}
      </div>
    </div>
  );
}

const btn: React.CSSProperties = {
  background: palette.accent, color: palette.accentText, border: "none", borderRadius: 0,
  padding: "7px 14px", fontSize: 18, cursor: "pointer", fontWeight: 600,
};
