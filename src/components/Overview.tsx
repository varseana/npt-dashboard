import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { palette } from "../theme";
import {
  computeDay, fmtHms, resolveTeamBudget, buildPlanOverrides, resolvePersonPlan, statusFor,
  weekInfo, weekLabel, weekRangeLabel, recentWeeks, isoDate,
  type NptDailyRow, type NptStatus, type PlannedRow, type TeamBudgetRow, type PlanContext,
} from "../lib/npt";
import { StatusChip } from "./status";
import { InfoStar, StoryLink } from "./InfoStar";
import { downloadEml, downloadTeamEml } from "../lib/reminder";
import WeekCountdown from "./WeekCountdown";
import { Dropdown } from "./Dropdown";
import { IconMail, IconAlert, IconSearch, IconFolder, IconCheck } from "./icons";
import { TableSkeleton } from "./skeleton";

interface Team { id: string; name: string; npt_target_pct: number; }
interface Folder { id: string; name: string; aliases: string[]; }

type NavDest = { section: "dashboard" | "team" | "access"; tab?: string };
// highlight monocromatico dentro del texto del popover (bold en color de texto full)
const hi = { color: palette.text, fontWeight: 700 } as React.CSSProperties;

interface Row {
  alias: string;
  daysReported: number;
  nptSeconds: number;      // actual NPT (= total NPT), suma de los 5 AUX
  planned: number | null;
  remaining: number | null;
  status: NptStatus;
}

const STATUS_RANK: Record<NptStatus, number> = { bad: 0, warn: 1, ok: 2, none: 3 };

export default function Overview({ team, refreshKey, onNavigate }: { team: Team; refreshKey?: number; onNavigate?: (d: NavDest) => void }) {
  const weeks = useMemo(() => recentWeeks(new Date(), 16), []);
  const [weekKey, setWeekKey] = useState(() => weekInfo(new Date()).key);
  const [rows, setRows] = useState<NptDailyRow[]>([]);
  const [planned, setPlanned] = useState<PlannedRow[]>([]);
  const [budget, setBudget] = useState<TeamBudgetRow[]>([]);
  const [roster, setRoster] = useState<string[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [groupBy, setGroupBy] = useState(false);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const first = useRef(true);

  const sel = useMemo(() => weekInfo(new Date(weekKey + "T12:00:00")), [weekKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (first.current) setLoading(true);
      setErr("");
      const [{ data: d, error }, { data: p }, { data: b }, { data: f }, { data: rs }] = await Promise.all([
        supabase.from("npt_daily").select("alias,tenant,work_date,profile,aux_seconds")
          .eq("team_id", team.id).gte("work_date", isoDate(sel.start)).lte("work_date", isoDate(sel.end)),
        supabase.from("npt_planned").select("alias,week_key,planned_seconds").eq("team_id", team.id),
        supabase.from("npt_team_budget").select("week_key,planned_seconds").eq("team_id", team.id),
        supabase.from("manager_folders").select("id,name,aliases").eq("team_id", team.id).order("created_at"),
        supabase.from("roster").select("alias").eq("team_id", team.id),
      ]);
      if (cancelled) return;
      if (error) setErr(error.message);
      setRows((d as NptDailyRow[]) ?? []);
      setPlanned((p as PlannedRow[]) ?? []);
      setBudget((b as TeamBudgetRow[]) ?? []);
      setFolders((f as Folder[]) ?? []);
      setRoster(((rs as { alias: string }[]) ?? []).map((x) => x.alias));
      first.current = false;
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [team.id, weekKey, refreshKey, sel.start, sel.end]);

  const users = useMemo(() => {
    const byUser = new Map<string, Row>();
    for (const r of rows) {
      const day = computeDay(r.aux_seconds);
      let u = byUser.get(r.alias);
      if (!u) { u = { alias: r.alias, daysReported: 0, nptSeconds: 0, planned: null, remaining: null, status: "none" }; byUser.set(r.alias, u); }
      u.daysReported += 1;
      u.nptSeconds += day.nptSeconds;
    }
    const out = Array.from(byUser.values());
    // modelo budget-first: target de cada persona = su custom, si no el fair share (budget / headcount).
    const overrides = buildPlanOverrides(planned, weekKey);
    const union = new Set<string>([...roster, ...byUser.keys(), ...overrides.keys()]);
    const ctx: PlanContext = { budgetSeconds: resolveTeamBudget(budget, weekKey), headcount: union.size, overrides };
    for (const u of out) {
      u.planned = resolvePersonPlan(u.alias, ctx);
      u.remaining = u.planned != null ? u.planned - u.nptSeconds : null;
      u.status = statusFor(u.planned, u.nptSeconds);
    }
    out.sort((a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      b.nptSeconds - a.nptSeconds ||
      a.alias.localeCompare(b.alias));
    return out;
  }, [rows, planned, budget, roster, weekKey]);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? users.filter((u) => u.alias.toLowerCase().includes(q)) : users;
  }, [users, filter]);

  const teamNpt = users.reduce((a, u) => a + u.nptSeconds, 0);
  // presupuesto TOTAL del team para la semana (techo agregado que todos consumen)
  const teamBudget = resolveTeamBudget(budget, weekKey);
  const teamRemaining = teamBudget != null ? teamBudget - teamNpt : null;
  const teamStatus = statusFor(teamBudget, teamNpt);
  const overCount = users.filter((u) => u.status === "bad").length;
  const warnCount = users.filter((u) => u.status === "warn").length;
  const flagged = users.filter((u) => u.status === "bad" || u.status === "warn");

  function remind(u: Row) {
    if (u.planned == null) return;
    downloadEml({
      alias: u.alias, weekNum: sel.week, weekRange: weekRangeLabel(sel),
      status: u.status, actual: u.nptSeconds, planned: u.planned, remaining: u.remaining ?? 0,
    });
  }

  // correo de visibilidad a TODO el team: un .eml neutro por persona (alias@amazon.com) con el
  // NPT compartido del equipo (cuanto queda), sin numeros individuales. incluye link al dashboard.
  const teamRecipients = useMemo(
    () => Array.from(new Set<string>([...roster, ...users.map((u) => u.alias)])),
    [roster, users],
  );
  function emailTeam() {
    if (teamBudget == null || !teamRecipients.length) return;
    downloadTeamEml({
      aliases: teamRecipients, weekNum: sel.week, weekRange: weekRangeLabel(sel),
      budget: teamBudget, used: teamNpt, remaining: teamRemaining ?? 0,
      dashboardUrl: window.location.origin,
    });
  }

  // agrupacion visual por carpeta (no afecta numeros)
  const groups = useMemo(() => {
    if (!groupBy || !folders.length) return null;
    const assigned = new Set<string>();
    folders.forEach((f) => f.aliases.forEach((a) => assigned.add(a)));
    const sections = folders.map((f) => ({
      name: f.name,
      rows: shown.filter((u) => f.aliases.includes(u.alias)),
    }));
    const others = shown.filter((u) => !assigned.has(u.alias));
    if (others.length) sections.push({ name: "Others", rows: others });
    return sections;
  }, [groupBy, folders, shown]);

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 16 }}>
        <Field label={<span style={{ display: "inline-flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>Week <WeekCountdown start={sel.start} /></span>}>
          <Dropdown value={weekKey} onChange={setWeekKey} minWidth={260} ariaLabel="Select week"
            options={weeks.map((w) => ({ value: w.key, label: weekLabel(w) }))} />
        </Field>
        <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
          <span style={{ position: "absolute", left: 10, display: "inline-flex", color: palette.textDim, pointerEvents: "none" }}>
            <IconSearch size={17} />
          </span>
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="username" aria-label="Filter by username"
            style={{ ...input, paddingLeft: 34, height: 42, boxSizing: "border-box" }} />
        </div>
        {/* misma altura (42) que los inputs y bottom-aligned -> el icono queda centrado con el textbox */}
        <div style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", height: 42 }}>
          <EmailAction icon={<IconAlert size={38} />} count={flagged.length} label="Email flagged" hoverClass="npt-hover-warn"
            onClick={() => flagged.forEach(remind)}
            info={<>Generates one reminder <strong style={hi}>.eml per person in yellow or red</strong> (near limit or over plan), each with their own weekly NPT summary. Opens as drafts in Outlook for you to review and send.</>} />
        </div>
      </div>

      {err && <div style={{ color: palette.bad, marginBottom: 12 }}>{err}</div>}
      {loading ? (
        <TableSkeleton rows={6} cols={7} />
      ) : users.length === 0 ? (
        <div style={{ color: palette.textDim }}>No reported data for {weekLabel(sel)}.</div>
      ) : (
        <>
          <TeamBudgetCard budget={teamBudget} used={teamNpt} remaining={teamRemaining} status={teamStatus} users={users} onNavigate={onNavigate} onEmailTeam={emailTeam} emailCount={teamRecipients.length} />
          <div style={{ display: "flex", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
            <Stat label="Employees" value={String(users.length)}
              topRight={folders.length > 0 ? <FolderToggle active={groupBy} onToggle={() => setGroupBy((v) => !v)} /> : undefined}
              story={
              <>Team members who have uploaded NPT this week. The full roster and status / <strong style={hi}>Connected . Pending . Unlisted</strong> / lives in the Employees panel.
                <div style={{ marginTop: 8 }}><StoryLink onClick={() => onNavigate?.({ section: "team", tab: "employees" })}>Open the Employees panel</StoryLink></div></>
            } />
            <Stat label="Team NPT" value={fmtHms(teamNpt)} story={
              <>Combined NPT for the whole team this week / <strong style={hi}>Meeting + Training + Project + Personal + System</strong> / sourced directly from STAR Tracker uploads. The weekly ceiling is defined in Planned.
                <div style={{ marginTop: 8 }}><StoryLink onClick={() => onNavigate?.({ section: "team", tab: "planned" })}>Set the team budget in Planned</StoryLink></div></>
            } />
            <Stat label="Over" value={`${overCount} / ${users.length}`} tone={overCount ? "bad" : "ok"} story={
              <>Employees who have exceeded their <strong style={hi}>individual weekly plan</strong>. Per-person plans are configured in Planned.
                <div style={{ marginTop: 8 }}><StoryLink onClick={() => onNavigate?.({ section: "team", tab: "planned" })}>Adjust plans in Planned</StoryLink></div></>
            } />
            <Stat label="Near limit" value={String(warnCount)} tone={warnCount ? "warn" : "ok"} story={
              <>Employees with <strong style={hi}>one hour or less</strong> of plan remaining. The per-activity reason behind it sits in Breakdown.
                <div style={{ marginTop: 8 }}><StoryLink onClick={() => onNavigate?.({ section: "dashboard", tab: "breakdown" })}>Open the Breakdown</StoryLink></div></>
            } />
          </div>

          {groups ? (
            groups.map((g) => (
              <div key={g.name} style={{ marginBottom: 20 }}>
                <div className="npt-title" style={{ fontWeight: 700, fontSize: 28, margin: "4px 0 8px" }}>
                  {g.name} <span style={{ color: palette.textDim, fontWeight: 400, fontSize: 18 }}>
                    ({g.rows.length}, NPT {fmtHms(g.rows.reduce((a, u) => a + u.nptSeconds, 0))})
                  </span>
                </div>
                {g.rows.length ? <UserTable rows={g.rows} remind={remind} teamBudget={teamBudget} /> : <div style={{ color: palette.textDim, fontSize: 18 }}>No members with data this week.</div>}
              </div>
            ))
          ) : (
            <UserTable rows={shown} remind={remind} teamBudget={teamBudget} />
          )}
        </>
      )}
    </div>
  );
}

function UserTable({ rows, remind, teamBudget }: { rows: Row[]; remind: (u: Row) => void; teamBudget: number | null }) {
  // headers con asterisco FLAT (no gira) donde hace falta explicar; el copy sale del viejo footer.
  const headers: { label: string; left?: boolean; story?: React.ReactNode }[] = [
    { label: "#", left: true },
    { label: "Employee", left: true },
    { label: "Days" },
    { label: "Planned", story: <>The employee's <strong style={hi}>weekly NPT target</strong>, set per person in the Planned tab. Shown in Hh:mm:ss.</> },
    { label: "Actual NPT", story: <>Total NPT this week / <strong style={hi}>Meeting + Training + Project + Personal + System</strong> / sourced from STAR Tracker uploads. Shown in Hh:mm:ss.</> },
    { label: "% of budget", story: <>This employee's <strong style={hi}>share of the team's total weekly budget</strong>.</> },
    { label: "Remaining", story: <><strong style={hi}>Remaining = Planned - Actual</strong>. Positive means plan left, negative means over. Shown in Hh:mm:ss.</> },
    { label: "Status", story: <>On track / <strong style={hi}>Near limit</strong> is one hour or less remaining / <strong style={hi}>Over</strong> is past the plan.</> },
  ];
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 19 }}>
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h.label} style={{ ...th, textAlign: h.left ? "left" : "center" }}>
              {h.label}{h.story && <InfoStar spin={false}>{h.story}</InfoStar>}
            </th>
          ))}
          <th style={{ ...th, textAlign: "center" }}></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((u, i) => (
          <tr key={u.alias} style={{ background: i % 2 ? palette.panel : palette.panelAlt }}>
            <td style={{ ...td, color: palette.textDim }}>{i + 1}</td>
            <td style={{ ...td, fontWeight: 600 }}>{u.alias}</td>
            <td style={{ ...td, textAlign: "center" }}>{u.daysReported}</td>
            <td style={{ ...td, textAlign: "center", color: palette.textDim }}>{u.planned != null ? fmtHms(u.planned) : "-"}</td>
            <td style={{ ...td, textAlign: "center", fontWeight: 600 }}>{fmtHms(u.nptSeconds)}</td>
            <td style={{ ...td, textAlign: "center", color: palette.textDim }}>
              {teamBudget ? (u.nptSeconds / teamBudget * 100).toFixed(1) + "%" : "-"}
            </td>
            <td style={{ ...td, textAlign: "center", color: remainingColor(u.status) }}>{u.remaining != null ? fmtHms(u.remaining) : "-"}</td>
            <td style={{ ...td, textAlign: "center" }}><StatusChip status={u.status} /></td>
            <td style={{ ...td, textAlign: "center" }}>
              <button onClick={() => remind(u)} disabled={u.status === "none"} title="Send reminder .eml" aria-label="Send reminder email"
                className="npt-hover-blue"
                style={{ background: "transparent", border: "none", padding: 2, cursor: "pointer", display: "inline-flex", alignItems: "center", lineHeight: 0 }}>
                <IconMail size={17} />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function remainingColor(s: NptStatus): string {
  return s === "bad" ? palette.bad : s === "warn" ? palette.warn : s === "ok" ? palette.ok : palette.textDim;
}

// rollup del TEAM: presupuesto total de la semana vs lo consumido por todos.
function TeamBudgetCard({ budget, used, remaining, status, users, onNavigate, onEmailTeam, emailCount }:
  { budget: number | null; used: number; remaining: number | null; status: NptStatus; users: { alias: string; nptSeconds: number }[]; onNavigate?: (d: NavDest) => void; onEmailTeam?: () => void; emailCount?: number }) {
  return (
    <div style={{ position: "relative", background: "transparent", padding: "18px 22px", marginBottom: 18 }}>
      {/* sin caja: bg = fondo. solo marcos esquineros simetricos (no se tocan) */}
      <span className="npt-bracket tl" /><span className="npt-bracket tr" /><span className="npt-bracket bl" /><span className="npt-bracket br" />
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <span className="npt-title" style={{ fontWeight: 700, fontSize: 28, textTransform: "uppercase", letterSpacing: "0.06em" }}>"Team" // weekly NPT budget</span>
        {budget != null && (
          <>
            <span className="npt-title" style={{ fontWeight: 700, fontSize: 28, letterSpacing: "0.06em", color: palette.textDim }}>//</span>
            <span style={{ textTransform: "uppercase" }}><StatusChip status={status} /></span>
          </>
        )}
        {budget != null && onEmailTeam && (
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center" }}>
            <EmailAction icon={<IconMail size={19} />} count={emailCount ?? 0} label="Email team"
              onClick={onEmailTeam}
              info={<>Generates a single neutral <strong style={hi}>.eml to the whole team</strong> with the team's shared NPT budget and how much is left this week. No individual figures. Includes a link to the personal dashboard.</>} />
          </span>
        )}
      </div>
      {budget == null ? (
        <div style={{ color: palette.textDim, fontSize: 18 }}>
          No team budget set for this week. Set it in the Planned tab (Team weekly budget).
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginBottom: 12 }}>
            <BudgetStat label="Budget" value={fmtHms(budget)} story={
              <>The team's <strong style={hi}>total weekly NPT ceiling</strong>, handed down by ops and defined in Planned.
                <div style={{ marginTop: 8 }}><StoryLink onClick={() => onNavigate?.({ section: "team", tab: "planned" })}>Set it in Planned</StoryLink></div></>
            } />
            <BudgetStat label="Used" value={fmtHms(used)} story={
              <>Combined NPT consumed by <strong style={hi}>all employees</strong> so far this week / it counts against the budget above.</>
            } />
            <BudgetStat label="Remaining" value={fmtHms(remaining ?? 0)} color={remainingColor(status)} />
          </div>
          <TeamBudgetBar budget={budget} status={status} users={users} />
          {/* used% abajo-derecha de la barra, en fuente LCD retro */}
          <div className="npt-lcd" style={{ textAlign: "right", marginTop: 6, fontSize: 18, color: palette.textDim }}>
            USED <span style={{ color: status === "bad" ? palette.bad : palette.text }}>{((used / budget) * 100).toFixed(1)}%</span>
          </div>
        </>
      )}
    </div>
  );
}

// barra segmentada por usuario: NEGRA por defecto (minimalista, solo se ve el aporte de cada uno
// con su nombre), y REVELA el color de status (verde/amarillo/rojo) al hacer hover. Aportes < 3%
// del budget se agrupan en "Other". Cada segmento: tooltip con alias, % y tiempo.
function TeamBudgetBar({ budget, status, users }:
  { budget: number; status: NptStatus; users: { alias: string; nptSeconds: number }[] }) {
  const [hover, setHover] = useState(false);
  const [locked, setLocked] = useState(false);
  const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (lockTimer.current) clearTimeout(lockTimer.current); }, []);
  // revelado = hover o locked. click: si esta locked destraba; si no, la deja locked 30s.
  const revealed = hover || locked;
  function toggleLock() {
    if (lockTimer.current) { clearTimeout(lockTimer.current); lockTimer.current = null; }
    if (locked) { setLocked(false); return; }
    setLocked(true);
    lockTimer.current = setTimeout(() => { setLocked(false); lockTimer.current = null; }, 30000);
  }
  const color = status === "bad" ? palette.bad : status === "warn" ? palette.warn : palette.ok;
  const THRESH = 3; // % del budget: debajo de esto va a "Other"

  const contribs = users
    .map((u) => ({ label: u.alias, seconds: u.nptSeconds, pct: (u.nptSeconds / budget) * 100 }))
    .filter((s) => s.pct > 0)
    .sort((a, b) => b.pct - a.pct);
  const big = contribs.filter((s) => s.pct >= THRESH);
  const small = contribs.filter((s) => s.pct < THRESH);
  const segs = [...big];
  if (small.length) {
    segs.push({
      label: `Other (${small.length})`,
      seconds: small.reduce((a, s) => a + s.seconds, 0),
      pct: small.reduce((a, s) => a + s.pct, 0),
    });
  }

  // DOS modos:
  //  - IDLE (sin hover): puramente estetico -> UN relleno continuo de barras inclinadas (120deg, 8/3),
  //    ancho = % usado total, SIN divisores. base negro (o rojo si ya se paso el budget).
  //  - REVELADO (hover/lock): data real -> segmentos FLAT/solidos por usuario, con divisores (gap) y
  //    nombre, faciles de digerir. color = status.
  const baseColor = status === "bad" ? palette.bad : palette.text;
  const stripes = (c: string) => `repeating-linear-gradient(120deg, ${c} 0 8px, transparent 8px 11px)`;
  const totalPct = Math.min(100, contribs.reduce((a, s) => a + s.pct, 0));

  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onClick={toggleLock}
      title={locked ? "Locked - click to unlock" : "Hover to reveal, click to lock 30s"}
      style={{ display: "flex", height: 30, borderRadius: 0, overflow: "hidden", background: "transparent", boxSizing: "border-box",
        border: `2px solid ${baseColor}`, gap: revealed ? 1 : 0, cursor: "pointer",
        outline: locked ? `2px solid ${color}` : "none", outlineOffset: 3 }}>
      {revealed ? (
        // desglose real por usuario: barras planas solidas + nombre
        segs.map((s, i) => (
          <div key={i} title={`${s.label} :: ${s.pct.toFixed(1)}% (${fmtHms(s.seconds)})`}
            style={{
              width: s.pct + "%", minWidth: 0, background: color,
              display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
            }}>
            <span style={{ fontSize: 12, color: palette.accentText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", padding: "0 6px" }}>
              {s.label}
            </span>
          </div>
        ))
      ) : (
        // idle: un solo relleno de barritas inclinadas, sin divisores (estetico)
        <div title={`Used ${totalPct.toFixed(1)}%`} style={{ width: totalPct + "%", minWidth: 0, background: stripes(baseColor) }} />
      )}
    </div>
  );
}

function BudgetStat({ label, value, color, story }: { label: string; value: string; color?: string; story?: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 15, color: palette.textDim, marginBottom: 2 }}>{label}{story && <InfoStar>{story}</InfoStar>}</div>
      <div style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: color || palette.text }}>{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 16, color: palette.textDim, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

function Stat({ label, value, tone, story, topRight }: { label: string; value: string; tone?: "ok" | "warn" | "bad"; story?: React.ReactNode; topRight?: React.ReactNode }) {
  const color = tone === "bad" ? palette.bad : tone === "warn" ? palette.warn : tone === "ok" ? palette.ok : palette.text;
  return (
    <div className="npt-card-cut" style={{ minWidth: 150 }}>
      <div className="npt-card-cut-body" style={{ padding: "12px 16px" }}>
        <div style={{ fontSize: 17, color: palette.textDim }}>{label}{story && <InfoStar>{story}</InfoStar>}</div>
        {/* numero full-izquierda, toggle (si hay) full-derecha, en la misma linea */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontSize: 31, fontWeight: 700, color }}>{value}</div>
          {topRight}
        </div>
      </div>
    </div>
  );
}

// icono de accion sin chrome de boton (borderless) + contador chico + asterisco giratorio (InfoStar)
// cuyo hover explica que hace. mismo patron que el resto del dashboard.
function EmailAction({ icon, count, label, onClick, info, hoverClass = "npt-hover-blue" }:
  { icon: React.ReactNode; count: number; label: string; onClick: () => void; info: React.ReactNode; hoverClass?: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {/* asterisco (InfoStar) ARRIBA A LA DERECHA del icono; el contador queda AL LADO del icono */}
      <span style={{ position: "relative", display: "inline-flex" }}>
        <button onClick={onClick} disabled={!count} aria-label={label} title={label} className={hoverClass} style={iconBtn}>{icon}</button>
        <span style={{ position: "absolute", top: -3, right: -3 }}><InfoStar>{info}</InfoStar></span>
      </span>
      {count > 0 && <span style={{ fontSize: 15, color: palette.textDim, fontVariantNumeric: "tabular-nums" }}>{count}</span>}
    </span>
  );
}

// toggle de "group by folder": icono de folder sin caja de checkbox. activo = folder en contraste
// full + check en la esquina superior derecha; inactivo = folder tenue y sin check.
function FolderToggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} aria-pressed={active}
      title={active ? "Grouping by folder (on)" : "Group by folder (off)"}
      style={{ ...iconBtn, position: "relative", color: active ? palette.text : palette.textDim }}>
      <IconFolder size={24} />
      {active && (
        <span style={{ position: "absolute", top: -4, right: -4, background: palette.bg, borderRadius: "50%",
          padding: 1, display: "inline-flex", color: palette.text }}>
          <IconCheck size={12} />
        </span>
      )}
    </button>
  );
}

const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", color: palette.textDim, fontWeight: 600, borderBottom: `1px solid ${palette.border}` };
const td: React.CSSProperties = { padding: "8px 10px", borderBottom: `1px solid ${palette.border}` };
const input: React.CSSProperties = { background: palette.panel, color: palette.text, border: `1px solid ${palette.border}`, borderRadius: 8, padding: "7px 9px", fontSize: 19 };
// boton sin chrome: transparente, sin borde, solo el icono. hereda color de texto (currentColor).
const iconBtn: React.CSSProperties = { background: "transparent", border: "none", padding: 2, cursor: "pointer", display: "inline-flex", alignItems: "center", lineHeight: 0 };
