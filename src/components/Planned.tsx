import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { palette } from "../theme";
import {
  parseDuration, fmtHms, resolvePlanned,
  weekInfo, weekLabel, recentWeeks,
  type PlannedRow,
} from "../lib/npt";
import { BlockSkeleton } from "./skeleton";

interface Team { id: string; name: string; npt_target_pct: number; }
type Scope = "standing" | "week";

export default function Planned({ team }: { team: Team }) {
  const weeks = useMemo(() => recentWeeks(new Date(), 16), []);
  const [scope, setScope] = useState<Scope>("standing");
  const [weekKey, setWeekKey] = useState(() => weekInfo(new Date()).key);
  const [rows, setRows] = useState<PlannedRow[]>([]);
  const [budgetRows, setBudgetRows] = useState<{ week_key: string; planned_seconds: number }[]>([]);
  const [aliases, setAliases] = useState<string[]>([]);
  const [budgetInput, setBudgetInput] = useState("");
  const [teamInput, setTeamInput] = useState("");
  const [personInputs, setPersonInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const scopeKey = scope === "standing" ? "" : weekKey;

  async function load() {
    setLoading(true);
    const [{ data: p }, { data: b }, { data: d }] = await Promise.all([
      supabase.from("npt_planned").select("alias,week_key,planned_seconds").eq("team_id", team.id),
      supabase.from("npt_team_budget").select("week_key,planned_seconds").eq("team_id", team.id),
      supabase.from("npt_daily").select("alias").eq("team_id", team.id).limit(2000),
    ]);
    setRows((p as PlannedRow[]) ?? []);
    setBudgetRows((b as { week_key: string; planned_seconds: number }[]) ?? []);
    const set = new Set<string>();
    for (const r of (d as { alias: string }[]) ?? []) set.add(r.alias);
    setAliases(Array.from(set).sort());
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [team.id]);

  // prefill de los inputs cuando cambia el scope o llega data
  useEffect(() => {
    const t = rows.find((r) => r.alias === "" && r.week_key === scopeKey);
    setTeamInput(t ? fmtHms(t.planned_seconds) : "");
    const bud = budgetRows.find((r) => r.week_key === scopeKey);
    setBudgetInput(bud ? fmtHms(bud.planned_seconds) : "");
    const pi: Record<string, string> = {};
    for (const a of aliases) {
      const row = rows.find((r) => r.alias === a && r.week_key === scopeKey);
      pi[a] = row ? fmtHms(row.planned_seconds) : "";
    }
    setPersonInputs(pi);
  }, [rows, budgetRows, aliases, scopeKey]);

  async function upsertOrDelete(alias: string, input: string) {
    const secs = parseDuration(input);
    if (secs == null) {
      // vacio o invalido: si habia fila para este scope, borrarla (vuelve a heredar)
      const existed = rows.some((r) => r.alias === alias && r.week_key === scopeKey);
      if (existed) {
        const { error } = await supabase.from("npt_planned").delete()
          .match({ team_id: team.id, alias, week_key: scopeKey });
        if (error) throw error;
      }
      return;
    }
    const { error } = await supabase.from("npt_planned").upsert(
      { team_id: team.id, alias, week_key: scopeKey, planned_seconds: secs, updated_at: new Date().toISOString() },
      { onConflict: "team_id,alias,week_key" });
    if (error) throw error;
  }

  // presupuesto TOTAL del team (tabla npt_team_budget, distinta de npt_planned por-persona)
  async function upsertOrDeleteBudget(input: string) {
    const secs = parseDuration(input);
    if (secs == null) {
      if (budgetRows.some((r) => r.week_key === scopeKey)) {
        const { error } = await supabase.from("npt_team_budget").delete()
          .match({ team_id: team.id, week_key: scopeKey });
        if (error) throw error;
      }
      return;
    }
    const { error } = await supabase.from("npt_team_budget").upsert(
      { team_id: team.id, week_key: scopeKey, planned_seconds: secs, updated_at: new Date().toISOString() },
      { onConflict: "team_id,week_key" });
    if (error) throw error;
  }

  async function save() {
    setSaving(true); setMsg("");
    try {
      await upsertOrDeleteBudget(budgetInput);
      await upsertOrDelete("", teamInput);
      for (const a of aliases) await upsertOrDelete(a, personInputs[a] ?? "");
      await load();
      setMsg("Saved. Team budget and planned applied; Remaining and colors recompute.");
    } catch (e: any) {
      setMsg("Error: " + (e?.message || String(e)));
    }
    setSaving(false);
  }

  if (loading) return <BlockSkeleton />;

  const scopeLabel = scope === "standing" ? "standing (all weeks)" : weekLabel(weekInfo(new Date(weekKey + "T12:00:00")));

  return (
    <div>
      <p style={{ color: palette.textDim, fontSize: 19, lineHeight: 1.6 }}>
        Planned NPT per week. Format <strong>H:MM</strong> (or H:MM:SS, or decimal hours). Empty =
        inherits from the level above. Priority: person+week &gt; person+standing &gt; team+week &gt; team+standing.
      </p>

      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", margin: "16px 0" }}>
        <Field label="Scope">
          <select value={scope} onChange={(e) => setScope(e.target.value as Scope)} style={select}>
            <option value="standing">Standing (reused)</option>
            <option value="week">Override a single week</option>
          </select>
        </Field>
        {scope === "week" && (
          <Field label="Week">
            <select value={weekKey} onChange={(e) => setWeekKey(e.target.value)} style={{ ...select, minWidth: 260 }}>
              {weeks.map((w) => (<option key={w.key} value={w.key}>{weekLabel(w)}</option>))}
            </select>
          </Field>
        )}
      </div>

      <div style={{ background: palette.panel, border: `2px solid ${palette.text}`, borderRadius: 8, padding: "14px 16px", marginBottom: 16 }}>
        <div className="npt-title" style={{ fontWeight: 700, fontSize: 28, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
          "Team" // weekly NPT budget (total)
        </div>
        <div style={{ fontSize: 16, color: palette.textDim, marginBottom: 8 }}>
          Total NPT the whole team can spend this {scope === "standing" ? "week (every week)" : "specific week"}. All members draw down from it. ({scopeLabel})
        </div>
        <input value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)} placeholder="H:MM (e.g. 10:00)" style={{ ...input, width: 180 }} />
      </div>

      <div style={{ background: palette.panelAlt, border: `1px solid ${palette.border}`, borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
        <div style={{ fontSize: 17, color: palette.textDim, marginBottom: 6 }}>Default per person ({team.name}) :: {scopeLabel} <span style={{ opacity: 0.7 }}>(optional individual target, not the team total)</span></div>
        <input value={teamInput} onChange={(e) => setTeamInput(e.target.value)} placeholder="H:MM (e.g. 3:45)" style={{ ...input, width: 160 }} />
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 19 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: "left" }}>Investigator</th>
            <th style={th}>Override (this scope)</th>
            <th style={th}>Effective</th>
          </tr>
        </thead>
        <tbody>
          {aliases.length === 0 ? (
            <tr><td colSpan={3} style={{ ...td, color: palette.textDim }}>No one has reported yet.</td></tr>
          ) : aliases.map((a, i) => {
            const eff = resolvePlanned(rows, a, scopeKey);
            return (
              <tr key={a} style={{ background: i % 2 ? palette.panel : palette.panelAlt }}>
                <td style={{ ...td, textAlign: "left", fontWeight: 600 }}>{a}</td>
                <td style={{ ...td, textAlign: "right" }}>
                  <input value={personInputs[a] ?? ""} onChange={(e) => setPersonInputs((p) => ({ ...p, [a]: e.target.value }))} placeholder="inherit" style={{ ...input, width: 120, textAlign: "right" }} />
                </td>
                <td style={{ ...td, textAlign: "right", color: eff != null ? palette.text : palette.textDim }}>{eff != null ? fmtHms(eff) : "no plan"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <button onClick={save} disabled={saving} style={{ marginTop: 16, background: palette.accent, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 19, cursor: "pointer", fontWeight: 600 }}>
        {saving ? "Saving..." : "Save planned"}
      </button>
      {msg && <div style={{ marginTop: 12, color: msg.startsWith("Error") ? palette.bad : palette.ok, fontSize: 18 }}>{msg}</div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 16, color: palette.textDim, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

const th: React.CSSProperties = { textAlign: "right", padding: "8px 10px", color: palette.textDim, fontWeight: 600, borderBottom: `1px solid ${palette.border}` };
const td: React.CSSProperties = { padding: "8px 10px", borderBottom: `1px solid ${palette.border}` };
const input: React.CSSProperties = { background: palette.panel, color: palette.text, border: `1px solid ${palette.border}`, borderRadius: 8, padding: "7px 9px", fontSize: 19 };
const select: React.CSSProperties = { ...input };
