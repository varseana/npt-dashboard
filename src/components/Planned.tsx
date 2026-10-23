import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { palette } from "../theme";
import {
  parseDuration, fmtHms, resolveTeamBudget, buildPlanOverrides, planSummary, resolvePersonPlan,
  weekInfo, weekLabel, weeksAround,
  type PlannedRow, type PlanContext,
} from "../lib/npt";
import { InfoStar } from "./InfoStar";
import { InlineEdit } from "./InlineEdit";
import { Dropdown } from "./Dropdown";
import { SearchInput } from "./Inputs";
import WeekCountdown from "./WeekCountdown";
import { Bar, BracketFrame, TableSk } from "./skeleton";
import Decode from "./Decode";
import PinnedView from "./PinnedView";

interface Team { id: string; name: string; npt_target_pct: number; }
type Scope = "standing" | "week";
// highlight monocromatico dentro del texto del popover (bold en color de texto full)
const hi = { color: palette.text, fontWeight: 700 } as React.CSSProperties;

// Modelo BUDGET-FIRST: el manager setea UN budget total; cada persona recibe su fair share
// (budget / headcount) salvo que tenga un custom. Los customs rebalancean el resto, asi el
// total siempre = budget. Ver lib/npt.ts (resolvePersonPlan / fairShareSeconds).
export default function Planned({ team }: { team: Team }) {
  // incluye semanas FUTURAS (4 adelante = 1 mes de anticipacion) para planear, + actual + 14 pasadas
  const weeks = useMemo(() => weeksAround(new Date(), 4, 14), []);
  const thisKey = useMemo(() => weekInfo(new Date()).key, []);
  // la semana que viene = la entrada apenas mas futura que la actual (la lista es descendente)
  const nextKey = useMemo(() => { const i = weeks.findIndex((w) => w.key === thisKey); return i > 0 ? weeks[i - 1].key : ""; }, [weeks, thisKey]);
  const [scope, setScope] = useState<Scope>("standing");
  const [weekKey, setWeekKey] = useState(() => weekInfo(new Date()).key);
  const [rows, setRows] = useState<PlannedRow[]>([]);
  const [budgetRows, setBudgetRows] = useState<{ week_key: string; planned_seconds: number }[]>([]);
  const [aliases, setAliases] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);      // carga inicial: skeleton de toda la vista
  const [refreshing, setRefreshing] = useState(false); // re-consulta tras guardar: skeleton solo en los numeros

  const scopeKey = scope === "standing" ? "" : weekKey;

  // normaliza el input a Hh:mm:ss al salir del campo (ej: "2" -> "2:00:00"), asi queda claro que un
  // numero suelto = horas. deja el texto igual si esta vacio o es invalido.
  const normalize = (v: string) => { const s = parseDuration(v); return s == null ? v : fmtHms(s); };

  async function load(silent = false) {
    if (silent) setRefreshing(true); else setLoading(true);
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
    if (silent) setRefreshing(false); else setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [team.id]);

  const headcount = aliases.length;
  const budgetSeconds = resolveTeamBudget(budgetRows, scopeKey);
  const overrides = useMemo(() => buildPlanOverrides(rows, scopeKey), [rows, scopeKey]);
  const ctx: PlanContext = { budgetSeconds, headcount, overrides };
  const { fair, allocated, leftover, restCount, allAssigned, teamTotal } = planSummary(ctx);
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
      if (sum > secs) throw new Error(`Custom targets add up to ${fmtHms(sum)}, more than this threshold ${fmtHms(secs)}. Lower them first.`);
    }
    await upsertOrDeleteBudget(next);
    await load(true);
  }

  // guardado inline de un custom. valida que la suma de todos los customs no pase el budget.
  // Vacio = borra el custom (esa persona vuelve al fair share).
  async function onSaveCustom(alias: string, next: string) {
    const secs = parseDuration(next);
    if (next.trim() !== "" && secs == null) throw new Error("Use hours like 2 or H:MM (e.g. 2:30).");
    const budgetSecs = resolveTeamBudget(budgetRows, scopeKey);
    // El cap threshold solo protege el pool del fair share. Si tras este edit TODOS tienen custom,
    // nadie esta en fair share: el total del equipo pasa a ser la suma de customs y el threshold deja
    // de aplicar, asi que no bloqueamos (era justo lo que impedia balancear con todos asignados).
    const holders = new Set(overrides.keys()); holders.add(alias);
    const everyoneCustom = holders.size >= headcount;
    if (secs != null && budgetSecs != null && !everyoneCustom) {
      let sum = secs;
      for (const r of rows) if (r.week_key === scopeKey && r.alias !== alias && r.planned_seconds) sum += r.planned_seconds;
      if (sum > budgetSecs) throw new Error(`Custom targets would total ${fmtHms(sum)}, over the threshold ${fmtHms(budgetSecs)}.`);
    }
    await upsertOrDelete(alias, next);
    await load(true);
  }

  if (loading) return <Decode loading fill><PlannedSkeleton /></Decode>;

  const scopeLabel = scope === "standing" ? "every week" : weekLabel(weekInfo(new Date(weekKey + "T12:00:00")));

  return (<Decode loading={false} fill>
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ flex: "0 0 auto", display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", margin: "0 0 16px" }}>
        <Field label="Applies to">
          <Dropdown value={scope} onChange={(v) => setScope(v as Scope)} minWidth={200} ariaLabel="Applies to"
            options={[{ value: "standing", label: "Every week" }, { value: "week", label: "Just one week" }]} />
        </Field>
        {scope === "week" && (
          <Field label="Week">
            <Dropdown value={weekKey} onChange={setWeekKey} minWidth={280} ariaLabel="Select week"
              options={weeks.map((w) => ({
                value: w.key,
                label: weekLabel(w) + (w.key === thisKey ? "  (this week)" : w.key === nextKey ? "  (next week)" : ""),
              }))} />
            {/* semana futura: cuenta hasta que arranca (amarillo). semana en curso: cuenta hasta que termina. */}
            <div style={{ marginTop: 6, minHeight: 20, fontSize: 15 }}>
              <WeekCountdown start={weekInfo(new Date(weekKey + "T12:00:00")).start} standalone />
            </div>
          </Field>
        )}
      </div>

      {/* Layout 2 columnas: IZQ = threshold card, DER = buscador + tabla. align-items:flex-start
          => la card izquierda NO se estira cuando la tabla crece (si no, los brackets se rompen). */}
      {/* nowrap a proposito: con wrap el alto de la fila lo fija el CONTENIDO (la tabla entera) y la
          columna derecha nunca se acota => scrollea todo. sin wrap, la columna derecha se estira al
          alto disponible (definido) y solo su tabla scrollea. */}
      <div style={{ flex: "1 1 auto", minHeight: 0, display: "flex", gap: 24, alignItems: "flex-start" }}>
        {/* IZQUIERDA: threshold card. ancho acotado, no crece con la altura de la tabla */}
        <div style={{ flex: "0 1 420px", minWidth: 300 }}>
      {/* UNICO input principal: el budget total del team. Sin caja: 4 marcos esquineros (mismo
          patron que el budget card de Dashboard > Summary). */}
      <div style={{ position: "relative", background: "transparent", padding: "18px 22px" }}>
        <span className="npt-bracket tl" /><span className="npt-bracket tr" /><span className="npt-bracket bl" /><span className="npt-bracket br" />
        {/* titulo en 2 lineas: "Team weekly" / ("Threshold" | "Total"). La 2da linea va mas grande para
            quedar (aprox) tan ancha como "Team weekly". El asterisco va al lado, fuera de las lineas. */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 2, marginBottom: 10 }}>
          <div className="npt-title" style={{ fontWeight: 700, lineHeight: 1.0, paddingLeft: 9 }}>
            <span style={{ display: "block", fontSize: 34 }}>Team weekly</span>
            <span style={{ display: "block", fontSize: 44 }}>{allAssigned ? "Total" : "Threshold"}</span>
          </div>
          <InfoStar pages={[
            <>The <strong style={hi}>total NPT the whole team can spend</strong> in a week (the number ops hands you). Everyone draws from it. Type hours like <strong style={hi}>10</strong> (= 10:00:00) or H:MM. Applies to <strong style={hi}>{scopeLabel}</strong>.</>,
            <><strong style={hi}>How it splits.</strong> Individual custom targets come <strong style={hi}>first</strong>. Whatever is left over becomes the <strong style={hi}>fair share</strong>, split equally among everyone without a custom. When <strong style={hi}>everyone</strong> has a custom there is no fair share: the team total is simply the <strong style={hi}>sum of the individual targets</strong>, with no separate threshold to set. Example: threshold <strong style={hi}>10:00</strong>, one person set to <strong style={hi}>4:00</strong> leaves <strong style={hi}>6:00</strong> for the rest of the team.</>,
          ]} />
        </div>
        {allAssigned ? (
          /* TODOS con custom: el total del equipo = suma de customs (derivado). Sin input ni unassigned. */
          <>
            <div className="npt-title" style={{ fontSize: 48, fontWeight: 700, paddingLeft: 9, lineHeight: 1.1 }}>
              {refreshing
                ? <Bar w={220} h={48} style={{ display: "inline-block", verticalAlign: "middle" }} />
                : fmtHms(teamTotal ?? 0)}
            </div>
            <div style={{ fontSize: 17, color: palette.textDim, marginTop: 10, paddingLeft: 9, lineHeight: 1.5, maxWidth: 380 }}>
              Everyone has a custom target, so the team total is the <strong style={{ color: palette.text }}>sum of the {overrides.size} individual targets</strong>. Nothing is unassigned. To use a shared budget with a fair share instead, clear a custom below.
            </div>
          </>
        ) : (
          <>
            <InlineEdit
              value={(() => { const b = budgetRows.find((r) => r.week_key === scopeKey); return b ? fmtHms(b.planned_seconds) : ""; })()}
              onSave={onSaveBudget}
              format={normalize}
              placeholder="H:MM"
              emptyHint={<span style={{ color: palette.textDim, fontSize: 26 }}>Set threshold</span>}
              width={300}
              align="left"
              fontSize={48}
              fontWeight={700}
              ariaLabel="team weekly threshold"
              inputMode="numeric"
              saveFeedback
            />
            {budgetSeconds == null ? (
              <div style={{ fontSize: 17, color: palette.textDim, marginTop: 8 }}>No threshold set. Click above to give everyone a target.</div>
            ) : (
              /* fair share DEBAJO del tiempo. (Con gente en fair share, "unassigned" siempre es 0: se elimino.) */
              <div style={{ fontSize: 18, color: palette.textDim, textAlign: "left", whiteSpace: "nowrap", lineHeight: 1.5, marginTop: 12, paddingLeft: 9 }}>
                <div>
                  Fair share {refreshing
                    ? <Bar w={92} h={22} style={{ display: "inline-block", verticalAlign: "middle" }} />
                    : <strong style={{ color: palette.text }}>{fmtHms(fair ?? 0)}</strong>}
                  <InfoStar spin={false}>{
                    <>What each of the <strong style={hi}>{restCount}</strong> {restCount === 1 ? "person" : "people"} without a custom gets: <strong style={hi}>{fmtHms(leftover ?? 0)}</strong> left over{overrides.size ? <> after the customs (<strong style={hi}>{fmtHms(allocated)}</strong>)</> : null}, split evenly.</>
                  }</InfoStar>
                </div>
              </div>
            )}
          </>
        )}
      </div>
        </div>{/* /IZQUIERDA */}

        {/* DERECHA: buscador + tabla de employees. flex:1 => usa el resto del ancho horizontal.
            alignSelf stretch + minHeight 0 => la columna toma la altura de la fila y PinnedView le da
            altura acotada para su scroll interno (solo las filas de personas scrollean). */}
        <div style={{ flex: "1 1 520px", minWidth: 300, alignSelf: "stretch", minHeight: 0, display: "flex", flexDirection: "column" }}>
      <PinnedView head={<>
      {aliases.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <SearchInput value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="username" aria-label="Search employees" />
        </div>
      )}
      <div style={{ marginBottom: 12, fontSize: 16, color: palette.textDim }}>
        Changes save on their own. Click any threshold or custom value to edit it.
      </div>
      </>}>
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
                    saveFeedback
                  />
                </td>
                <td style={{ ...td, textAlign: "center", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", color: eff != null ? palette.text : palette.textDim, fontWeight: isCustom ? 700 : 400 }}>
                  {refreshing
                    ? <Bar w={72} h={16} style={{ display: "inline-block" }} />
                    : (eff != null ? fmtHms(eff) : "no threshold")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </PinnedView>
        </div>{/* /DERECHA */}
      </div>{/* /flex 2 columnas */}
    </div>
  </Decode>);
}

// skeleton 1:1: dropdown "Applies to" -> 2 columnas (IZQ card threshold con brackets: titulo 2 lineas +
// numero grande + fair share (o total derivado); DER buscador + tabla de 3 columnas Employee/Custom/Target)
function PlannedSkeleton() {
  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 16 }}>
        <div><Bar w={70} h={14} style={{ marginBottom: 6 }} /><Bar w={200} h={40} /></div>
      </div>
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "0 1 420px", minWidth: 300 }}>
          <BracketFrame>
            <Bar w={190} h={30} style={{ marginBottom: 8 }} />
            <Bar w={200} h={40} style={{ marginBottom: 16 }} />
            <Bar w={220} h={48} style={{ marginBottom: 18 }} />
            <Bar w={170} h={18} style={{ marginBottom: 8 }} />
            <Bar w={170} h={18} />
          </BracketFrame>
        </div>
        <div style={{ flex: "1 1 520px", minWidth: 300 }}>
          <div style={{ marginBottom: 12 }}><Bar w={220} h={42} /></div>
          <TableSk template="2fr 210px 210px" rows={6} />
        </div>
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

// thead congelado dentro del scroll de la tabla de personas: sticky top 0 con fondo opaco.
const th: React.CSSProperties = { textAlign: "center", padding: "8px 10px", color: palette.textDim, fontWeight: 600, borderBottom: `1px solid ${palette.border}`, position: "sticky", top: 0, zIndex: 1, background: palette.bg };
const td: React.CSSProperties = { padding: "8px 10px", borderBottom: `1px solid ${palette.border}` };
