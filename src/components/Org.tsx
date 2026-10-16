import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { palette } from "../theme";
import {
  computeDay, dedupePersonDay, fmtHms, resolveTeamBudget, buildPlanOverrides, resolvePersonPlan, planSummary, statusFor,
  weekInfo, weekLabel, recentWeeks, isoDate,
  type NptDailyRow, type NptStatus, type PlannedRow, type TeamBudgetRow, type PlanContext,
} from "../lib/npt";
import { StatusChip } from "./status";
import { Bar, TableSk } from "./skeleton";
import { SearchInput, AddButtonInput, splitAliases } from "./Inputs";
import { InfoStar } from "./InfoStar";
import { Dropdown } from "./Dropdown";
import WeekCountdown from "./WeekCountdown";
import PinnedView from "./PinnedView";
import { ConfirmDialog } from "./ConfirmDialog";
import { IconMoveOut, IconX, IconUser } from "./icons";

// UUID fijo del team Unassigned (igual que el trigger set_team_from_code)
const UNASSIGNED_ID = "00000000-0000-0000-0000-000000000001";
// highlight monocromatico dentro del texto del popover (bold en color de texto full)
const hi = { color: palette.text, fontWeight: 700 } as React.CSSProperties;

interface Team { id: string; name: string; }
interface Mgr { user_id: string; email: string; role: string; team_id: string | null; approved: boolean; }
interface DailyT extends NptDailyRow { team_id: string | null; }
interface PlannedT extends PlannedRow { team_id: string; }
interface BudgetT extends TeamBudgetRow { team_id: string; }

interface Member {
  alias: string;
  days: number;
  npt: number;
  planned: number | null;
  remaining: number | null;
  status: NptStatus;
  reporting: boolean;   // false = esta en el roster pero no subio data esta semana
}
interface TeamView {
  team: Team;
  managers: Mgr[];
  members: Member[];
  threshold: number | null;   // teamTotal (suma de customs si todos tienen custom, si no el budget)
  used: number;
  status: NptStatus;
}

const STATUS_RANK: Record<NptStatus, number> = { bad: 0, warn: 1, ok: 2, none: 3 };

// accion pendiente de confirmacion (todas pasan por ConfirmDialog)
type Pending =
  | { kind: "move"; alias: string; from: Team; to: string }
  | { kind: "addMgr"; team: Team; mgr: Mgr; replaces: Mgr[] }
  | { kind: "rmMgr"; team: Team; mgr: Mgr }
  | { kind: "rmGrant"; owner: Mgr; alias: string };

const aliasOfEmail = (email: string) => email.split("@")[0];

// supabase corta cada respuesta en ~1000 filas: paginamos con range hasta que venga una pagina corta.
async function fetchAllDaily(from: string, to: string): Promise<DailyT[]> {
  const PAGE = 1000;
  const out: DailyT[] = [];
  for (let i = 0; ; i += PAGE) {
    const { data, error } = await supabase.from("npt_daily")
      .select("alias,tenant,work_date,profile,aux_seconds,team_id")
      .gte("work_date", from).lte("work_date", to)
      .order("alias").order("work_date").order("profile")
      .range(i, i + PAGE - 1);
    if (error) throw error;
    const rows = (data as DailyT[]) ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

// vista admin: la ORG por TEAMS (el team es el eje, no el manager). cada team = sus managers, su
// threshold/used de la semana (mismo calculo que Summary) y sus miembros REALES (npt_daily.team_id +
// roster). Unassigned va al final.
export default function Org({ refreshKey }: { refreshKey?: number }) {
  const weeks = useMemo(() => recentWeeks(new Date(), 16), []);
  const [weekKey, setWeekKey] = useState(() => weekInfo(new Date()).key);
  const [teams, setTeams] = useState<Team[]>([]);
  const [managers, setManagers] = useState<Mgr[]>([]);
  const [daily, setDaily] = useState<DailyT[]>([]);
  const [planned, setPlanned] = useState<PlannedT[]>([]);
  const [budget, setBudget] = useState<BudgetT[]>([]);
  const [roster, setRoster] = useState<{ alias: string; team_id: string }[]>([]);
  // grants de sharing (manager_members): quien ve a quien FUERA de su team. no es pertenencia.
  const [grants, setGrants] = useState<{ manager_owner: string; alias: string }[]>([]);
  const [grantOwner, setGrantOwner] = useState("");
  const [grantInput, setGrantInput] = useState("");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());   // default: todas colapsadas
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);   // bump tras una accion => refresh silencioso
  const first = useRef(true);   // solo la 1a carga muestra el skeleton; los refresh son silenciosos

  const sel = useMemo(() => weekInfo(new Date(weekKey + "T12:00:00")), [weekKey]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (first.current) setLoading(true);
      setMsg("");
      try {
        const [d, { data: t, error: e1 }, { data: mg, error: e2 }, { data: p, error: e3 }, { data: b, error: e4 }, { data: r, error: e5 }, { data: g, error: e6 }] = await Promise.all([
          fetchAllDaily(isoDate(sel.start), isoDate(sel.end)),
          supabase.from("teams").select("id,name").order("name"),
          supabase.from("managers").select("user_id,email,role,team_id,approved"),
          supabase.from("npt_planned").select("team_id,alias,week_key,planned_seconds"),
          supabase.from("npt_team_budget").select("team_id,week_key,planned_seconds"),
          supabase.from("roster").select("alias,team_id"),
          supabase.from("manager_members").select("manager_owner,alias"),
        ]);
        if (!alive) return;
        const err = e1 || e2 || e3 || e4 || e5 || e6;
        if (err) setMsg("Error: " + err.message);
        setDaily(d);
        setTeams((t as Team[]) ?? []);
        setManagers((mg as Mgr[]) ?? []);
        setPlanned((p as PlannedT[]) ?? []);
        setBudget((b as BudgetT[]) ?? []);
        setRoster((r as { alias: string; team_id: string }[]) ?? []);
        setGrants((g as { manager_owner: string; alias: string }[]) ?? []);
      } catch (e: any) {
        if (alive) setMsg("Error: " + (e?.message || String(e)));
      }
      if (!alive) return;
      first.current = false;
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [weekKey, refreshKey, tick, sel.start, sel.end]);

  // ejecuta la accion confirmada. mensajes en el head; luego refresh silencioso.
  async function run(p: Pending) {
    setBusy(true); setMsg("");
    try {
      if (p.kind === "move") {
        // override + mueve TODO su npt_daily (historia incluida) al team destino
        const { error } = await supabase.rpc("admin_assign_alias", { p_alias: p.alias, p_team: p.to });
        if (error) throw error;
        // el roster sigue a la persona: sale del viejo, entra al nuevo (Unassigned no lleva roster)
        const { error: e1 } = await supabase.from("roster").delete().match({ alias: p.alias, team_id: p.from.id });
        if (e1) throw e1;
        if (p.to !== UNASSIGNED_ID) {
          const { error: e2 } = await supabase.from("roster")
            .upsert({ alias: p.alias, team_id: p.to }, { onConflict: "alias,team_id", ignoreDuplicates: true });
          if (e2) throw e2;
        }
        setMsg(`${p.alias} moved to ${teams.find((t) => t.id === p.to)?.name ?? "the new team"}.`);
      } else if (p.kind === "addMgr") {
        const { error } = await supabase.from("managers").update({ team_id: p.team.id }).eq("user_id", p.mgr.user_id);
        if (error) throw error;
        // reemplazo: los managers que tenia el team salen (quedan sin team hasta que se les asigne otro)
        for (const old of p.replaces) {
          const { error: e2 } = await supabase.from("managers").update({ team_id: null }).eq("user_id", old.user_id);
          if (e2) throw e2;
        }
        setMsg(p.replaces.length
          ? `${aliasOfEmail(p.mgr.email)} replaced ${p.replaces.map((m) => aliasOfEmail(m.email)).join(", ")} on ${p.team.name}.`
          : `${aliasOfEmail(p.mgr.email)} now manages ${p.team.name}.`);
      } else if (p.kind === "rmMgr") {
        const { error } = await supabase.from("managers").update({ team_id: null }).eq("user_id", p.mgr.user_id);
        if (error) throw error;
        setMsg(`${aliasOfEmail(p.mgr.email)} no longer manages ${p.team.name}.`);
      } else {
        const { error } = await supabase.from("manager_members").delete().match({ manager_owner: p.owner.user_id, alias: p.alias });
        if (error) throw error;
        setMsg(`${aliasOfEmail(p.owner.email)} no longer sees ${p.alias}.`);
      }
    } catch (e: any) {
      setMsg("Error: " + (e?.message || String(e)));
    }
    setBusy(false);
    setPending(null);
    setTick((t) => t + 1);
  }

  // alta de grants (no destructivo => sin confirm). upsert ignoreDuplicates: un alias repetido ya no
  // rompe el lote. team_id va null a proposito: shared_members_metrics resuelve el team ACTUAL
  // (team_of_alias), asi el grant no queda apuntando a un team viejo si la persona se mueve.
  async function addGrants() {
    const aliases = splitAliases(grantInput);
    if (!grantOwner || !aliases.length) return;
    setBusy(true); setMsg("");
    const rows = aliases.map((alias) => ({ manager_owner: grantOwner, alias, team_id: null }));
    const { error } = await supabase.from("manager_members")
      .upsert(rows, { onConflict: "manager_owner,alias", ignoreDuplicates: true });
    if (error) setMsg("Error: " + error.message);
    else {
      const owner = managers.find((m) => m.user_id === grantOwner);
      setMsg(`${aliasOfEmail(owner?.email ?? "")} can now see ${aliases.join(", ")}.`);
      setGrantInput("");
    }
    setBusy(false);
    setTick((t) => t + 1);
  }

  // managers/admins aprobados que se pueden sumar a un team (los que ya estan en el, no)
  const staff = useMemo(() => managers
    .filter((m) => m.approved && (m.role === "manager" || m.role === "admin"))
    .sort((a, b) => a.email.localeCompare(b.email)), [managers]);
  const teamName = (id: string | null) => (id ? teams.find((t) => t.id === id)?.name ?? "unknown team" : null);

  // arma cada team con la MISMA logica que Overview (budget-first + fair share, dedupePersonDay)
  const views = useMemo<TeamView[]>(() => {
    const out: TeamView[] = [];
    for (const team of teams) {
      const rows = dedupePersonDay(daily.filter((r) => r.team_id === team.id));
      const teamRoster = roster.filter((x) => x.team_id === team.id).map((x) => x.alias);
      const overrides = buildPlanOverrides(planned.filter((x) => x.team_id === team.id), weekKey);
      const byAlias = new Map<string, { days: number; npt: number }>();
      for (const r of rows) {
        const a = byAlias.get(r.alias) ?? { days: 0, npt: 0 };
        a.days += 1;
        a.npt += computeDay(r.aux_seconds).nptSeconds;
        byAlias.set(r.alias, a);
      }
      const union = new Set<string>([...teamRoster, ...byAlias.keys(), ...overrides.keys()]);
      const ctx: PlanContext = {
        budgetSeconds: resolveTeamBudget(budget.filter((x) => x.team_id === team.id), weekKey),
        headcount: union.size,
        overrides,
      };
      const threshold = planSummary(ctx).teamTotal;

      const members: Member[] = [];
      for (const [alias, a] of byAlias) {
        const pl = resolvePersonPlan(alias, ctx);
        members.push({ alias, days: a.days, npt: a.npt, planned: pl, remaining: pl != null ? pl - a.npt : null, status: statusFor(pl, a.npt), reporting: true });
      }
      members.sort((x, y) => STATUS_RANK[x.status] - STATUS_RANK[y.status] || y.npt - x.npt || x.alias.localeCompare(y.alias));
      // roster sin data esta semana: al final, muted (no entran a ningun numero)
      for (const alias of [...new Set(teamRoster)].filter((a) => !byAlias.has(a)).sort()) {
        members.push({ alias, days: 0, npt: 0, planned: resolvePersonPlan(alias, ctx), remaining: null, status: "none", reporting: false });
      }

      const used = [...byAlias.values()].reduce((s, a) => s + a.npt, 0);
      const mgrs = managers
        .filter((m) => m.team_id === team.id && m.approved && (m.role === "manager" || m.role === "admin"))
        .sort((x, y) => x.email.localeCompare(y.email));
      out.push({ team, managers: mgrs, members, threshold, used, status: statusFor(threshold, used) });
    }
    // Unassigned siempre al final; el resto por nombre (ya vienen ordenados)
    return out.sort((x, y) => Number(x.team.id === UNASSIGNED_ID) - Number(y.team.id === UNASSIGNED_ID));
  }, [teams, daily, planned, budget, roster, managers, weekKey]);

  // el buscador filtra miembros (y managers) en todos los teams; teams sin coincidencias se ocultan
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    if (!q) return views;
    return views
      .map((v) => {
        const mgrHit = v.managers.some((m) => m.email.toLowerCase().includes(q));
        const nameHit = v.team.name.toLowerCase().includes(q);
        return { ...v, members: mgrHit || nameHit ? v.members : v.members.filter((m) => m.alias.includes(q)) };
      })
      .filter((v) => v.members.length > 0 || v.team.name.toLowerCase().includes(q) || v.managers.some((m) => m.email.toLowerCase().includes(q)));
  }, [views, q]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const people = views.reduce((s, v) => s + v.members.length, 0);
  // alias -> nombre de su team (reporta esta semana > roster), para etiquetar los grants
  const aliasTeam = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of views) for (const x of v.members) if (x.reporting) m.set(x.alias, v.team.name);
    for (const v of views) for (const x of v.members) if (!m.has(x.alias)) m.set(x.alias, v.team.name);
    return m;
  }, [views]);

  return (
    <PinnedView head={<>
      {/* cabeza PINEADA, mismo panel que el "New team" de Access > Teams: titulo + semana + buscador */}
      <div style={{ background: palette.panelAlt, border: `1px solid ${palette.border}`, borderRadius: 0, padding: "14px 16px", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <span className="npt-title" style={{ fontWeight: 700, fontSize: 28 }}>Org</span>
          <InfoStar spin={false} pages={[
            <>Every <strong style={hi}>team</strong> with its <strong style={hi}>managers</strong>, its weekly <strong style={hi}>threshold</strong> and the people who <strong style={hi}>really belong</strong> to it: whoever reports NPT under that team (by enrollment code or an admin move) plus its expected roster.</>,
            <>Numbers match each team's Summary: same threshold, fair share and status. Roster people with no upload this week show <strong style={hi}>muted</strong> at the bottom and do not count. <strong style={hi}>Unassigned</strong> is always last.</>,
          ]} />
          {!loading && <span style={{ color: palette.textDim, fontSize: 17, marginLeft: 8 }}>{views.length} teams :: {people} people</span>}
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <Dropdown value={weekKey} onChange={setWeekKey} minWidth={260} ariaLabel="Select week"
            options={weeks.map((w) => ({ value: w.key, label: weekLabel(w) }))} />
          <span style={{ fontSize: 17 }}><WeekCountdown start={sel.start} sep=":: " /></span>
          <SearchInput value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="team, manager or username" aria-label="Search the org"
            containerStyle={{ marginLeft: "auto", minWidth: 280 }} style={{ width: "100%" }} />
        </div>
      </div>
      {msg && <div style={{ color: msg.startsWith("Error") ? palette.bad : palette.ok, marginBottom: 12, fontSize: 18 }}>{msg}</div>}
    </>}>
      {loading ? (
        <OrgSkeleton />
      ) : views.length === 0 ? (
        <div style={{ color: palette.textDim }}>No teams yet. Create them in Access / Teams.</div>
      ) : shown.length === 0 ? (
        <div style={{ color: palette.textDim }}>Nothing matches "{query.trim()}".</div>
      ) : shown.map((v) => (
        <TeamCard key={v.team.id} view={v} open={!!q || expanded.has(v.team.id)} onToggle={() => toggle(v.team.id)}
          busy={busy}
          addable={staff.filter((m) => m.team_id !== v.team.id)}
          teamName={teamName}
          onMove={(alias) => setPending({ kind: "move", alias, from: v.team, to: "" })}
          onAddMgr={(mgr) => setPending({ kind: "addMgr", team: v.team, mgr, replaces: v.managers })}
          onRmMgr={(mgr) => setPending({ kind: "rmMgr", team: v.team, mgr })} />
      ))}

      {/* sharing al FINAL, aparte de los teams: es visibilidad (Shared with me), no pertenencia */}
      {!loading && views.length > 0 && !q && (
        <SharingCard grants={grants} staff={staff} aliasTeam={aliasTeam} busy={busy}
          owner={grantOwner} onOwner={setGrantOwner} input={grantInput} onInput={setGrantInput}
          onAdd={addGrants} onRemove={(owner, alias) => setPending({ kind: "rmGrant", owner, alias })} />
      )}

      {pending?.kind === "rmGrant" && (
        <ConfirmDialog title="Revoke access?" confirmLabel={busy ? "Revoking..." : "Revoke"} confirmDisabled={busy}
          body={<>
            <strong style={hi}>{pending.owner.email}</strong> stops seeing <strong style={hi}>{pending.alias}</strong> in Shared with me.
            It does not touch their NPT or their team.
          </>}
          onCancel={() => { if (!busy) setPending(null); }}
          onConfirm={() => run(pending)} />
      )}
      {pending?.kind === "move" && (
        <ConfirmDialog title="Move to another team?" confirmLabel={busy ? "Moving..." : "Move"}
          confirmDisabled={!pending.to || busy}
          body={<>
            <strong style={hi}>{pending.alias}</strong> and their <strong style={hi}>whole NPT history</strong> move out of{" "}
            <strong style={hi}>{pending.from.name}</strong>. Their roster spot moves too, and future uploads land in the new team
            even with an old enrollment code.
            <div style={{ marginTop: 14 }}>
              <Dropdown fill value={pending.to} ariaLabel="Destination team"
                onChange={(to) => setPending({ ...pending, to })}
                options={[{ value: "", label: "Pick a team..." },
                  ...teams.filter((t) => t.id !== pending.from.id).map((t) => ({ value: t.id, label: t.name }))]} />
            </div>
          </>}
          onCancel={() => { if (!busy) setPending(null); }}
          onConfirm={() => run(pending)} />
      )}
      {pending?.kind === "addMgr" && (
        <ConfirmDialog title={pending.replaces.length ? "Replace manager?" : "Assign manager?"}
          confirmLabel={busy ? "Saving..." : pending.replaces.length ? "Replace" : "Assign"} confirmDisabled={busy}
          body={<>
            <strong style={hi}>{pending.mgr.email}</strong> will manage <strong style={hi}>{pending.team.name}</strong> and see its data.
            {pending.replaces.length > 0 && <> <strong style={hi}>{pending.replaces.map((m) => aliasOfEmail(m.email)).join(", ")}</strong> stops managing it and is left with no team until you assign one.</>}
            {pending.mgr.team_id && <> A manager has one team, so they <strong style={hi}>leave {teamName(pending.mgr.team_id)}</strong>.</>}
          </>}
          onCancel={() => { if (!busy) setPending(null); }}
          onConfirm={() => run(pending)} />
      )}
      {pending?.kind === "rmMgr" && (
        <ConfirmDialog title="Remove manager?" confirmLabel={busy ? "Saving..." : "Remove"} confirmDisabled={busy}
          body={<>
            <strong style={hi}>{pending.mgr.email}</strong> stops managing <strong style={hi}>{pending.team.name}</strong>.
            {pending.mgr.role === "admin"
              ? <> As an admin they still see every team; this only clears their home team.</>
              : <> Their account stays, but they will not see any team until you assign one.</>}
          </>}
          onCancel={() => { if (!busy) setPending(null); }}
          onConfirm={() => run(pending)} />
      )}
    </PinnedView>
  );
}

function TeamCard({ view, open, onToggle, busy, addable, teamName, onMove, onAddMgr, onRmMgr }: {
  view: TeamView; open: boolean; onToggle: () => void; busy: boolean;
  addable: Mgr[]; teamName: (id: string | null) => string | null;
  onMove: (alias: string) => void; onAddMgr: (m: Mgr) => void; onRmMgr: (m: Mgr) => void;
}) {
  const { team, managers, members, threshold, used, status } = view;
  const isUnassigned = team.id === UNASSIGNED_ID;
  const reporting = members.filter((m) => m.reporting).length;
  return (
    // misma estructura que las cards de Access > Teams: borde 1px, header en panel, cuerpo en bg con
    // subtitulos chicos. SIN overflow:hidden (romperia el thead sticky del scroll de PinnedView).
    <div style={card}>
      {/* header: chevron + nombre colapsa/expande; conteos al lado; used/status a la derecha */}
      <div style={cardHead}>
        <ToggleTitle open={open} onToggle={onToggle} label={isUnassigned ? "UNASSIGNED" : team.name}
          color={isUnassigned ? palette.bad : undefined} />
        {isUnassigned ? (
          <span style={{ fontSize: 17, color: palette.textDim }}>{members.length} {members.length === 1 ? "person" : "people"}</span>
        ) : (<>
        <span style={{ fontSize: 17, color: palette.textDim }}>
          {managers.length === 0 ? <span style={{ color: palette.warn, fontWeight: 700 }}>no manager</span>
            : managers.map((m, i) => (
              <span key={m.user_id} title={m.email}>
                {i > 0 && ", "}<strong style={{ color: palette.text, fontWeight: 600 }}>{aliasOfEmail(m.email)}</strong>
                {m.role === "admin" && <span style={{ color: palette.blue }}> (admin)</span>}
              </span>
            ))}
          {" // "}{reporting} reporting{members.length > reporting ? ` + ${members.length - reporting} not reporting` : ""}
        </span>
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 14, fontSize: 17, fontVariantNumeric: "tabular-nums" }}>
          <span style={{ color: palette.textDim }}>
            Used <strong style={{ color: status === "bad" ? palette.bad : palette.text }}>{fmtHms(used)}</strong>
            {" / "}{threshold != null ? fmtHms(threshold) : "no threshold"}
          </span>
          {threshold != null && <StatusChip status={status} />}
        </span>
        </>)}
      </div>

      {/* render condicional (NO .npt-collapse): su overflow:hidden romperia el thead sticky */}
      {open && (
        <div style={cardBody}>
          {!isUnassigned && (<>
            <div style={subLabel}>Managers</div>
            {managers.length === 0 && <div style={{ fontSize: 18, color: palette.textDim, marginBottom: 8 }}>No managers yet.</div>}
            {managers.map((m) => (
              <div key={m.user_id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }} title={m.email}>
                <span style={{ fontSize: 18, fontWeight: 700 }}>{aliasOfEmail(m.email)}</span>
                {m.role === "admin" && <span style={{ fontSize: 16, color: palette.blue, fontWeight: 600 }}>(admin)</span>}
                <button onClick={() => onRmMgr(m)} disabled={busy} className="npt-ico-act npt-ico-danger"
                  title={`Remove ${aliasOfEmail(m.email)} as manager`} aria-label={`Remove ${aliasOfEmail(m.email)} as manager`}>
                  <IconX size={15} />
                </button>
              </div>
            ))}
            {addable.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <Dropdown value="" minWidth={260} ariaLabel={`Add a manager to ${team.name}`}
                  onChange={(uid) => { const m = addable.find((x) => x.user_id === uid); if (m) onAddMgr(m); }}
                  options={[{ value: "", label: managers.length ? "Replace manager with..." : "Assign a manager..." },
                    ...addable.map((m) => ({ value: m.user_id, label: `${aliasOfEmail(m.email)}${m.role === "admin" ? " (admin)" : ""} :: ${teamName(m.team_id) ?? "no team"}` }))]} />
              </div>
            )}
          </>)}

          <div style={{ ...subLabel, marginTop: isUnassigned ? 0 : 16 }}>Members</div>
          {members.length === 0 ? (
            <div style={{ color: palette.textDim, fontSize: 18 }}>Nobody reports under this team yet and its roster is empty.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 18 }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: "left" }}>Employee</th>
                  <th style={th}>Days</th>
                  <th style={th}>Planned</th>
                  <th style={th}>Actual NPT</th>
                  <th style={th}>Remaining</th>
                  <th style={th}>Status</th>
                  <th style={th}>Actions<InfoStar spin={false}>{
                    <><strong style={hi}>Move to another team</strong>: moves the person, their whole NPT history and their roster spot. Future uploads land in the new team even with an old enrollment code.</>
                  }</InfoStar></th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => m.reporting ? (
                  <tr key={m.alias}>
                    <td style={{ ...td, textAlign: "left", fontWeight: 600 }}>{m.alias}</td>
                    <td style={td}>{m.days}</td>
                    <td style={{ ...td, color: palette.textDim }}>{m.planned != null ? fmtHms(m.planned) : "-"}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{fmtHms(m.npt)}</td>
                    <td style={{ ...td, color: remainColor(m.status) }}>{m.remaining != null ? fmtHms(m.remaining) : "-"}</td>
                    <td style={td}><StatusChip status={m.status} /></td>
                    <td style={td}><MoveBtn alias={m.alias} busy={busy} onMove={onMove} /></td>
                  </tr>
                ) : (
                  // roster sin upload esta semana: muted, status en texto plano (nunca lee como ok/over)
                  <tr key={"nr-" + m.alias}>
                    <td style={{ ...td, textAlign: "left", fontWeight: 600, color: palette.textDim }}>{m.alias}</td>
                    <td style={{ ...td, color: palette.textDim }}>-</td>
                    <td style={{ ...td, color: palette.textDim }}>{m.planned != null ? fmtHms(m.planned) : "-"}</td>
                    <td style={{ ...td, color: palette.textDim }}>-</td>
                    <td style={{ ...td, color: palette.textDim }}>-</td>
                    <td style={{ ...td, color: palette.textDim, fontWeight: 600 }}>No report</td>
                    <td style={td}><MoveBtn alias={m.alias} busy={busy} onMove={onMove} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// chevron + nombre: el unico boton del header (asi los controles de adentro no quedan dentro de un <button>)
function ToggleTitle({ open, onToggle, label, color }: { open: boolean; onToggle: () => void; label: string; color?: string }) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} title={open ? "Collapse" : "Expand"}
      style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "transparent", border: "none", padding: 0, cursor: "pointer", color: palette.text, textAlign: "left" }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round"
        style={{ flex: "0 0 auto", transform: open ? "none" : "rotate(-90deg)", transition: "transform .2s ease", color: palette.textDim }} aria-hidden="true">
        <path d="M5 9l7 7 7-7" />
      </svg>
      <span style={{ fontWeight: color ? 700 : 600, fontSize: 19, color: color ?? palette.text, letterSpacing: color ? "0.04em" : undefined }}>{label}</span>
    </button>
  );
}

// sharing: grants de manager_members agrupados por quien VE. misma card que los teams.
function SharingCard({ grants, staff, aliasTeam, busy, owner, onOwner, input, onInput, onAdd, onRemove }: {
  grants: { manager_owner: string; alias: string }[]; staff: Mgr[]; aliasTeam: Map<string, string>; busy: boolean;
  owner: string; onOwner: (v: string) => void; input: string; onInput: (v: string) => void;
  onAdd: () => void; onRemove: (owner: Mgr, alias: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const byOwner = staff
    .map((m) => ({ m, aliases: grants.filter((g) => g.manager_owner === m.user_id).map((g) => g.alias).sort() }))
    .filter((x) => x.aliases.length > 0);
  return (
    <div style={card}>
      <div style={cardHead}>
        <ToggleTitle open={open} onToggle={() => setOpen((o) => !o)} label="Sharing" color={palette.blue} />
        <InfoStar spin={false}>{
          <>Extra <strong style={hi}>read-only access</strong> to someone from <strong style={hi}>another team</strong>. It shows up in that manager's <strong style={hi}>Shared with me</strong> and never counts in their own team's numbers. This is <strong style={hi}>not</strong> team membership: to change a team, move the person in its card above.</>
        }</InfoStar>
        <span style={{ fontSize: 17, color: palette.textDim }}>{grants.length} grant{grants.length === 1 ? "" : "s"} outside their team</span>
      </div>
      {open && (
        <div style={cardBody}>
          <div style={subLabel}>Access outside their team</div>
          {byOwner.length === 0 && <div style={{ fontSize: 18, color: palette.textDim, marginBottom: 8 }}>Nobody has access outside their team.</div>}
          {/* un BLOQUE por manager (azul Bauhaus, borde + fondo parejos) para escanear rapido quien ve a quien */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10, marginBottom: 6 }}>
            {byOwner.map(({ m, aliases }) => (
              <div key={m.user_id} style={{ border: `1px solid color-mix(in srgb, var(--blue) 45%, transparent)`, background: palette.blueBg, borderRadius: 0, padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 8 }} title={m.email}>
                  <span style={{ fontSize: 18, fontWeight: 700, color: palette.blue }}>{aliasOfEmail(m.email)}</span>
                  <span style={{ fontSize: 15, color: palette.textDim }}>sees {aliases.length}</span>
                </div>
                {aliases.map((a) => (
                  <div key={a} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 17, padding: "3px 0" }}>
                    <strong style={{ fontWeight: 600 }}>{a}</strong>
                    <span style={{ color: palette.textDim, fontSize: 15 }}>{aliasTeam.has(a) ? `:: ${aliasTeam.get(a)}` : ""}</span>
                    <button onClick={() => onRemove(m, a)} disabled={busy} className="npt-ico-act npt-ico-danger"
                      style={{ marginLeft: "auto" }}
                      title={`Revoke ${aliasOfEmail(m.email)}'s access to ${a}`} aria-label={`Revoke access to ${a}`}>
                      <IconX size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
            <Dropdown value={owner} onChange={onOwner} minWidth={220} ariaLabel="Manager who gets access"
              options={[{ value: "", label: "Pick a manager" }, ...staff.map((m) => ({ value: m.user_id, label: aliasOfEmail(m.email) + (m.role === "admin" ? " (admin)" : "") }))]} />
            <AddButtonInput value={input} onChange={(e) => onInput(e.target.value)} icon={<IconUser size={18} />}
              onSubmit={onAdd} buttonDisabled={busy || !owner || !input.trim()}
              placeholder="username(s)" title="One or more usernames, comma or space separated"
              aria-label="Usernames to share" containerStyle={{ width: 300 }} />
          </div>
        </div>
      )}
    </div>
  );
}

// icono borderless "mover a otro team" (abre el ConfirmDialog con el selector de destino)
function MoveBtn({ alias, busy, onMove }: { alias: string; busy: boolean; onMove: (alias: string) => void }) {
  return (
    <button onClick={() => onMove(alias)} disabled={busy} className="npt-ico-act"
      title="Move to another team" aria-label={`Move ${alias} to another team`}>
      <IconMoveOut size={18} />
    </button>
  );
}

// skeleton 1:1 (mismo patron que TeamsSkeleton): cards con header en panel + cuerpo con subtitulo y tabla
function OrgSkeleton() {
  return (
    <div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} style={card}>
          <div style={{ ...cardHead, gap: 12 }}>
            <Bar w={15} h={15} /><Bar w={220} h={22} /><Bar w={200} h={16} />
            <div style={{ marginLeft: "auto", display: "flex", gap: 12 }}><Bar w={170} h={18} /><Bar w={80} h={18} /></div>
          </div>
          <div style={cardBody}>
            <Bar w={90} h={14} style={{ marginBottom: 10 }} />
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}><Bar w={120} h={20} /><Bar w={18} h={18} /></div>
            <Bar w={90} h={14} style={{ marginBottom: 10 }} />
            <TableSk template="2fr 70px 1fr 1fr 1fr 100px 70px" rows={3} />
          </div>
        </div>
      ))}
    </div>
  );
}

function remainColor(s: NptStatus): string {
  return s === "bad" ? palette.bad : s === "warn" ? palette.warn : s === "ok" ? palette.ok : palette.textDim;
}

// thead congelado dentro del scroll: sticky top 0 con fondo opaco (cada tabla se pinea en su turno)
const th: React.CSSProperties = { textAlign: "center", padding: "8px 10px", color: palette.textDim, fontWeight: 600, borderBottom: `1px solid ${palette.border}`, position: "sticky", top: 0, zIndex: 1, background: palette.bg };
const td: React.CSSProperties = { textAlign: "center", padding: "8px 10px", borderBottom: `1px solid ${palette.border}`, fontVariantNumeric: "tabular-nums" };
// card estilo Access > Teams (sin overflow:hidden para no romper el sticky)
const card: React.CSSProperties = { border: `1px solid ${palette.border}`, borderRadius: 0, marginBottom: 14 };
const cardHead: React.CSSProperties = { display: "flex", gap: 10, alignItems: "center", padding: "12px 14px", background: palette.panel, flexWrap: "wrap" };
const cardBody: React.CSSProperties = { padding: "10px 14px 14px", borderTop: `1px solid ${palette.border}`, background: palette.bg };
const subLabel: React.CSSProperties = { fontSize: 17, color: palette.textDim, marginBottom: 8, fontWeight: 600 };
