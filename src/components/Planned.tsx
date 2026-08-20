import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { palette } from "../theme";
import {
  parseDuration, fmtHms, resolveTeamBudget, buildPlanOverrides, fairShareSeconds, resolvePersonPlan,
  weekInfo, weekLabel, recentWeeks,
  type PlannedRow, type PlanContext,
} from "../lib/npt";
import { InfoStar } from "./InfoStar";
import { BlockSkeleton } from "./skeleton";

interface Team { id: string; name: string; npt_target_pct: number; }
type Scope = "standing" | "week";
// highlight monocromatico dentro del texto del popover (bold en color de texto full)
const hi = { color: palette.text, fontWeight: 700 } as React.CSSProperties;

// Modelo BUDGET-FIRST: el manager setea UN budget total; cada persona recibe su fair share
// (budget / headcount) salvo que tenga un custom. Los customs rebalancean el resto, asi el
// total siempre = budget. Ver lib/npt.ts (resolvePersonPlan / fairShareSeconds).
export default function Planned({ team }: { team: Team }) {
  const weeks = useMemo(() => recentWeeks(new Date(), 16), []);
  const [scope, setScope] = useState<Scope>("standing");
  const [weekKey, setWeekKey] = useState(() => weekInfo(new Date()).key);
  const [rows, setRows] = useState<PlannedRow[]>([]);
  const [budgetRows, setBudgetRows] = useState<{ week_key: string; planned_seconds: number }[]>([]);
  const [aliases, setAliases] = useState<string[]>([]);
  const [budgetInput, setBudgetInput] = useState("");
  const [personInputs, setPersonInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const scopeKey = scope === "standing" ? "" : weekKey;

  // normaliza el input a Hh:mm:ss al salir del campo (ej: "2" -> "2:00:00"), asi queda claro que un
  // numero suelto = horas. deja el texto igual si esta vacio o es invalido.
  const normalize = (v: string) => { const s = parseDuration(v); return s == null ? v : fmtHms(s); };

  async function load() {
    setLoading(true);
    const [{ data: p }, { data: b }, { data: d }, { data: r }] = await Promise.all([
      supabase.from("npt_planned").select("alias,week_key,planned_seconds").eq("team_id", team.id),
      supabase.from("npt_team_budget").select("week_key,planned_seconds").eq("team_id", team.id),
      supabase.from("npt_daily").select("alias").eq("team_id", team.id).limit(2000),
      supabase.from("roster").select("alias").eq("team_id", team.id),
    ]);
    const planned = (p as PlannedRow[]) ?? [];
    setRows(planned);
    setBudgetRows((b as { week_key: string; planned_seconds: number }[]) ?? []);
    // headcount = union de roster + quienes reportaron + quienes tienen custom
    const set = new Set<string>();
    for (const x of (r as { alias: string }[]) ?? []) set.add(x.alias);
    for (const x of (d as { alias: string }[]) ?? []) set.add(x.alias);
    for (const x of planned) if (x.alias) set.add(x.alias);
    setAliases(Array.from(set).sort());
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [team.id]);

  // prefill de los inputs cuando cambia el scope o llega data
  useEffect(() => {
    const bud = budgetRows.find((r) => r.week_key === scopeKey);
    setBudgetInput(bud ? fmtHms(bud.planned_seconds) : "");
    const pi: Record<string, string> = {};
    for (const a of aliases) {
      const row = rows.find((r) => r.alias === a && r.week_key === scopeKey);
      pi[a] = row ? fmtHms(row.planned_seconds) : "";
    }
    setPersonInputs(pi);
  }, [rows, budgetRows, aliases, scopeKey]);

  const headcount = aliases.length;
  const budgetSeconds = resolveTeamBudget(budgetRows, scopeKey);
  const overrides = useMemo(() => buildPlanOverrides(rows, scopeKey), [rows, scopeKey]);
  const ctx: PlanContext = { budgetSeconds, headcount, overrides };
  const fair = fairShareSeconds(ctx);

  async function upsertOrDelete(alias: string, input: string) {
    const secs = parseDuration(input);
    if (secs == null) {
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
    // CAP: los customs (targets individuales) nunca pueden sumar mas que el budget (evita el bug de
    // asignar mas NPT del que hay). Priorizamos los individuales; lo que sobra = fair share al resto.
    const budgetSecs = parseDuration(budgetInput);
    if (budgetSecs != null) {
      let sum = 0;
      for (const a of aliases) { const s = parseDuration(personInputs[a] ?? ""); if (s != null) sum += s; }
      if (sum > budgetSecs) {
        setMsg(`Custom targets add up to ${fmtHms(sum)}, more than the budget ${fmtHms(budgetSecs)}. Lower them so they fit.`);
        return;
      }
    }
    setSaving(true); setMsg("");
    try {
      await upsertOrDeleteBudget(budgetInput);
      for (const a of aliases) await upsertOrDelete(a, personInputs[a] ?? "");
      await load();
      setMsg("Saved. Everyone's target and the colors recompute.");
    } catch (e: any) {
      setMsg("Error: " + (e?.message || String(e)));
    }
    setSaving(false);
  }

  if (loading) return <BlockSkeleton />;

  const scopeLabel = scope === "standing" ? "every week" : weekLabel(weekInfo(new Date(weekKey + "T12:00:00")));

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", margin: "0 0 16px" }}>
        <Field label="Applies to">
          <select value={scope} onChange={(e) => setScope(e.target.value as Scope)} style={select}>
            <option value="standing">Every week</option>
            <option value="week">Just one week</option>
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

      {/* UNICO input principal: el budget total del team */}
      <div style={{ background: palette.panel, border: `2px solid ${palette.text}`, borderRadius: 8, padding: "14px 16px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
          <div className="npt-title" style={{ fontWeight: 700, fontSize: 28 }}>
            Team weekly budget<InfoStar pages={[
              <>The <strong style={hi}>total NPT the whole team can spend</strong> in a week (the number ops hands you). Everyone draws from it. Type hours like <strong style={hi}>10</strong> (= 10:00:00) or H:MM. Applies to <strong style={hi}>{scopeLabel}</strong>.</>,
              <><strong style={hi}>How it splits.</strong> Individual custom targets come <strong style={hi}>first</strong> and can never add up to more than the budget. Whatever is left over becomes the <strong style={hi}>fair share</strong>, split equally among everyone without a custom. Example: budget <strong style={hi}>10:00</strong>, one person set to <strong style={hi}>4:00</strong> leaves <strong style={hi}>6:00</strong> for the rest of the team.</>,
            ]} />
          </div>
          {budgetSeconds != null && fair != null && (
            <div style={{ fontSize: 18, color: palette.textDim, whiteSpace: "nowrap" }}>
              Fair share <strong style={{ color: palette.text }}>{fmtHms(fair)}</strong>
              <InfoStar spin={false}>{
                <>What each person without a custom gets: <strong style={hi}>{fmtHms(budgetSeconds)}</strong> / {headcount} {headcount === 1 ? "person" : "people"}{overrides.size ? <>, after <strong style={hi}>{overrides.size}</strong> custom</> : null}.</>
              }</InfoStar>
            </div>
          )}
        </div>
        <input value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)} onBlur={() => setBudgetInput(normalize(budgetInput))} placeholder="H:MM (e.g. 10:00)" style={{ ...input, width: 180 }} />
        {budgetSeconds == null && <div style={{ fontSize: 17, color: palette.textDim, marginTop: 8 }}>No budget set. Set it above to give everyone a target.</div>}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 19 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: "left" }}>Employee</th>
            <th style={th}>Custom<InfoStar spin={false}>{
              <>Optional <strong style={hi}>custom target</strong> for this person, {scopeLabel}. Leave blank to use the fair share; when you set customs, the rest split what is left. Type hours like <strong style={hi}>2</strong> (= 2:00:00) or H:MM.</>
            }</InfoStar></th>
            <th style={th}>Target<InfoStar spin={false}>{
              <>What this person is measured against: their <strong style={hi}>custom</strong> if set, otherwise the <strong style={hi}>fair share</strong>.</>
            }</InfoStar></th>
          </tr>
        </thead>
        <tbody>
          {aliases.length === 0 ? (
            <tr><td colSpan={3} style={{ ...td, color: palette.textDim }}>No one on this team yet. Add employees or wait for uploads.</td></tr>
          ) : aliases.map((a, i) => {
            const eff = resolvePersonPlan(a, ctx);
            const isCustom = overrides.has(a);
            return (
              <tr key={a} style={{ background: i % 2 ? palette.panel : palette.panelAlt }}>
                <td style={{ ...td, textAlign: "left", fontWeight: 600 }}>{a}</td>
                <td style={{ ...td, textAlign: "right" }}>
                  <input value={personInputs[a] ?? ""} onChange={(e) => setPersonInputs((p) => ({ ...p, [a]: e.target.value }))}
                    onBlur={() => setPersonInputs((p) => ({ ...p, [a]: normalize(p[a] ?? "") }))}
                    placeholder={fair != null ? fmtHms(fair) : "H:MM"} style={{ ...input, width: 120, textAlign: "right" }} />
                </td>
                <td style={{ ...td, textAlign: "right", color: eff != null ? palette.text : palette.textDim, fontWeight: isCustom ? 700 : 400 }}>
                  {eff != null ? fmtHms(eff) : "no budget"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <button onClick={save} disabled={saving} style={{ marginTop: 16, background: palette.accent, color: palette.accentText, border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 19, cursor: "pointer", fontWeight: 600 }}>
        {saving ? "Saving..." : "Save"}
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
