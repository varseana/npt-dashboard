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
import { InlineEdit } from "./InlineEdit";
import { Dropdown } from "./Dropdown";
import { BracketSearch } from "./Inputs";
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
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

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

  const headcount = aliases.length;
  const budgetSeconds = resolveTeamBudget(budgetRows, scopeKey);
  const overrides = useMemo(() => buildPlanOverrides(rows, scopeKey), [rows, scopeKey]);
  const ctx: PlanContext = { budgetSeconds, headcount, overrides };
  const fair = fairShareSeconds(ctx);
  // el buscador SOLO filtra las filas visibles; headcount/fair share siguen usando el team completo
  const shownAliases = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? aliases.filter((a) => a.includes(q)) : aliases;
  }, [aliases, query]);

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

  // guardado inline del budget. valida que no baje por debajo de la suma de customs ya puestos
  // (mismo CAP de antes, pero por-campo). Vacio = borra el budget.
  async function onSaveBudget(next: string) {
    const secs = parseDuration(next);
    if (next.trim() !== "" && secs == null) throw new Error("Use hours like 10 or H:MM (e.g. 10:00).");
    if (secs != null) {
      let sum = 0;
      for (const r of rows) if (r.week_key === scopeKey && r.planned_seconds) sum += r.planned_seconds;
      if (sum > secs) throw new Error(`Custom targets add up to ${fmtHms(sum)}, more than this budget ${fmtHms(secs)}. Lower them first.`);
    }
    await upsertOrDeleteBudget(next);
    await load();
  }

  // guardado inline de un custom. valida que la suma de todos los customs no pase el budget.
  // Vacio = borra el custom (esa persona vuelve al fair share).
  async function onSaveCustom(alias: string, next: string) {
    const secs = parseDuration(next);
    if (next.trim() !== "" && secs == null) throw new Error("Use hours like 2 or H:MM (e.g. 2:30).");
    const budgetSecs = resolveTeamBudget(budgetRows, scopeKey);
    if (secs != null && budgetSecs != null) {
      let sum = secs;
      for (const r of rows) if (r.week_key === scopeKey && r.alias !== alias && r.planned_seconds) sum += r.planned_seconds;
      if (sum > budgetSecs) throw new Error(`Custom targets would total ${fmtHms(sum)}, over the budget ${fmtHms(budgetSecs)}.`);
    }
    await upsertOrDelete(alias, next);
    await load();
  }

  if (loading) return <BlockSkeleton />;

  const scopeLabel = scope === "standing" ? "every week" : weekLabel(weekInfo(new Date(weekKey + "T12:00:00")));

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", margin: "0 0 16px" }}>
        <Field label="Applies to">
          <Dropdown value={scope} onChange={(v) => setScope(v as Scope)} minWidth={200} ariaLabel="Applies to"
            options={[{ value: "standing", label: "Every week" }, { value: "week", label: "Just one week" }]} />
        </Field>
        {scope === "week" && (
          <Field label="Week">
            <Dropdown value={weekKey} onChange={setWeekKey} minWidth={260} ariaLabel="Select week"
              options={weeks.map((w) => ({ value: w.key, label: weekLabel(w) }))} />
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
        <InlineEdit
          value={(() => { const b = budgetRows.find((r) => r.week_key === scopeKey); return b ? fmtHms(b.planned_seconds) : ""; })()}
          onSave={onSaveBudget}
          format={normalize}
          placeholder="H:MM (e.g. 10:00)"
          emptyHint={<span style={{ color: palette.textDim }}>Set budget</span>}
          width={180}
          align="left"
          fontSize={19}
          fontWeight={600}
          ariaLabel="team weekly budget"
          inputMode="numeric"
        />
        {budgetSeconds == null && <div style={{ fontSize: 17, color: palette.textDim, marginTop: 8 }}>No budget set. Click above to give everyone a target.</div>}
      </div>

      {aliases.length > 0 && (
        <BracketSearch value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="find a person" aria-label="Search employees"
          containerStyle={{ marginBottom: 12, width: 320 }} />
      )}

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 19, tableLayout: "fixed" }}>
        <colgroup>
          <col />
          <col style={{ width: 210 }} />
          <col style={{ width: 210 }} />
        </colgroup>
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
          ) : shownAliases.length === 0 ? (
            <tr><td colSpan={3} style={{ ...td, color: palette.textDim }}>No employees match "{query.trim()}".</td></tr>
          ) : shownAliases.map((a, i) => {
            const eff = resolvePersonPlan(a, ctx);
            const isCustom = overrides.has(a);
            return (
              <tr key={a} style={{ background: i % 2 ? palette.panel : palette.panelAlt }}>
                <td style={{ ...td, textAlign: "left", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a}</td>
                <td style={{ ...td, textAlign: "center" }}>
                  <InlineEdit
                    value={(() => { const r = rows.find((x) => x.alias === a && x.week_key === scopeKey); return r ? fmtHms(r.planned_seconds) : ""; })()}
                    onSave={(v) => onSaveCustom(a, v)}
                    format={normalize}
                    placeholder={fair != null ? fmtHms(fair) : "H:MM"}
                    emptyHint={<span style={{ color: palette.textDim }}>{fair != null ? fmtHms(fair) : "-"}</span>}
                    width={170}
                    align="center"
                    fontSize={19}
                    ariaLabel={`custom target for ${a}`}
                    inputMode="numeric"
                  />
                </td>
                <td style={{ ...td, textAlign: "center", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", color: eff != null ? palette.text : palette.textDim, fontWeight: isCustom ? 700 : 400 }}>
                  {eff != null ? fmtHms(eff) : "no budget"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ marginTop: 14, fontSize: 16, color: palette.textDim }}>
        Changes save on their own. Click any budget or custom value to edit it.
      </div>
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

const th: React.CSSProperties = { textAlign: "center", padding: "8px 10px", color: palette.textDim, fontWeight: 600, borderBottom: `1px solid ${palette.border}` };
const td: React.CSSProperties = { padding: "8px 10px", borderBottom: `1px solid ${palette.border}` };
