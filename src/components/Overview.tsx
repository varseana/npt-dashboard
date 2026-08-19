import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { palette } from "../theme";
import {
  computeDay, fmtHms, resolvePlanned, statusFor,
  weekInfo, weekLabel, weekRangeLabel, recentWeeks, isoDate,
  type NptDailyRow, type NptStatus, type PlannedRow,
} from "../lib/npt";
import { StatusChip } from "./status";
import { downloadEml } from "../lib/reminder";
import { IconMail, IconAlert } from "./icons";
import { TableSkeleton } from "./skeleton";

interface Team { id: string; name: string; npt_target_pct: number; }
interface Folder { id: string; name: string; aliases: string[]; }

interface Row {
  alias: string;
  daysReported: number;
  nptSeconds: number;      // actual NPT (= total NPT), suma de los 5 AUX
  planned: number | null;
  remaining: number | null;
  status: NptStatus;
}

const STATUS_RANK: Record<NptStatus, number> = { bad: 0, warn: 1, ok: 2, none: 3 };

export default function Overview({ team, refreshKey }: { team: Team; refreshKey?: number }) {
  const weeks = useMemo(() => recentWeeks(new Date(), 16), []);
  const [weekKey, setWeekKey] = useState(() => weekInfo(new Date()).key);
  const [rows, setRows] = useState<NptDailyRow[]>([]);
  const [planned, setPlanned] = useState<PlannedRow[]>([]);
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
      const [{ data: d, error }, { data: p }, { data: f }] = await Promise.all([
        supabase.from("npt_daily").select("alias,tenant,work_date,profile,aux_seconds")
          .eq("team_id", team.id).gte("work_date", isoDate(sel.start)).lte("work_date", isoDate(sel.end)),
        supabase.from("npt_planned").select("alias,week_key,planned_seconds").eq("team_id", team.id),
        supabase.from("manager_folders").select("id,name,aliases").eq("team_id", team.id).order("created_at"),
      ]);
      if (cancelled) return;
      if (error) setErr(error.message);
      setRows((d as NptDailyRow[]) ?? []);
      setPlanned((p as PlannedRow[]) ?? []);
      setFolders((f as Folder[]) ?? []);
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
    for (const u of out) {
      u.planned = resolvePlanned(planned, u.alias, weekKey);
      u.remaining = u.planned != null ? u.planned - u.nptSeconds : null;
      u.status = statusFor(u.planned, u.nptSeconds);
    }
    out.sort((a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      b.nptSeconds - a.nptSeconds ||
      a.alias.localeCompare(b.alias));
    return out;
  }, [rows, planned, weekKey]);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? users.filter((u) => u.alias.toLowerCase().includes(q)) : users;
  }, [users, filter]);

  const teamNpt = users.reduce((a, u) => a + u.nptSeconds, 0);
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
        <Field label="Week">
          <select value={weekKey} onChange={(e) => setWeekKey(e.target.value)} style={select}>
            {weeks.map((w) => (<option key={w.key} value={w.key}>{weekLabel(w)}</option>))}
          </select>
        </Field>
        <Field label="Filter user">
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="username" style={input} />
        </Field>
        {folders.length > 0 && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 18, cursor: "pointer", paddingBottom: 8 }}>
            <input type="checkbox" checked={groupBy} onChange={(e) => setGroupBy(e.target.checked)} />
            Group by folder
          </label>
        )}
        <button onClick={() => flagged.forEach(remind)} disabled={!flagged.length}
          title="Generate one .eml per person in yellow or red" style={{ ...emlBtn, marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <IconAlert size={14} /> Email flagged ({flagged.length})
        </button>
      </div>

      {err && <div style={{ color: palette.bad, marginBottom: 12 }}>{err}</div>}
      {loading ? (
        <TableSkeleton rows={6} cols={7} />
      ) : users.length === 0 ? (
        <div style={{ color: palette.textDim }}>No reported data for {weekLabel(sel)}.</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
            <Stat label="Investigators reporting" value={String(users.length)} />
            <Stat label="Team NPT (actual)" value={fmtHms(teamNpt)} />
            <Stat label="Over planned" value={`${overCount} / ${users.length}`} tone={overCount ? "bad" : "ok"} />
            <Stat label="Near limit (<=1h)" value={String(warnCount)} tone={warnCount ? "warn" : "ok"} />
          </div>

          {groups ? (
            groups.map((g) => (
              <div key={g.name} style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 700, fontSize: 21, margin: "4px 0 8px" }}>
                  {g.name} <span style={{ color: palette.textDim, fontWeight: 400, fontSize: 18 }}>
                    ({g.rows.length}, NPT {fmtHms(g.rows.reduce((a, u) => a + u.nptSeconds, 0))})
                  </span>
                </div>
                {g.rows.length ? <UserTable rows={g.rows} remind={remind} /> : <div style={{ color: palette.textDim, fontSize: 18 }}>No members with data this week.</div>}
              </div>
            ))
          ) : (
            <UserTable rows={shown} remind={remind} />
          )}
          <div style={{ color: palette.textDim, fontSize: 16, marginTop: 8 }}>
            NPT = Meeting + Training + Project + Personal + System. Remaining = Planned - Actual. Times in Hh:mm:ss.
          </div>
        </>
      )}
    </div>
  );
}

function UserTable({ rows, remind }: { rows: Row[]; remind: (u: Row) => void }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 19 }}>
      <thead>
        <tr>
          {["#", "Investigator", "Days", "Planned", "Actual NPT", "Remaining", "Status"].map((h, i) => (
            <th key={h} style={{ ...th, textAlign: i <= 1 ? "left" : "right" }}>{h}</th>
          ))}
          <th style={{ ...th, textAlign: "right" }}></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((u, i) => (
          <tr key={u.alias} style={{ background: i % 2 ? palette.panel : palette.panelAlt }}>
            <td style={{ ...td, color: palette.textDim }}>{i + 1}</td>
            <td style={{ ...td, fontWeight: 600 }}>{u.alias}</td>
            <td style={{ ...td, textAlign: "right" }}>{u.daysReported}</td>
            <td style={{ ...td, textAlign: "right", color: palette.textDim }}>{u.planned != null ? fmtHms(u.planned) : "-"}</td>
            <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{fmtHms(u.nptSeconds)}</td>
            <td style={{ ...td, textAlign: "right", color: remainingColor(u.status) }}>{u.remaining != null ? fmtHms(u.remaining) : "-"}</td>
            <td style={{ ...td, textAlign: "right" }}><StatusChip status={u.status} /></td>
            <td style={{ ...td, textAlign: "right" }}>
              <button onClick={() => remind(u)} disabled={u.status === "none"} title="Send reminder .eml" aria-label="Send reminder email"
                style={{ ...emlBtn, padding: "5px 7px", display: "inline-flex", alignItems: "center" }}>
                <IconMail size={15} />
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 16, color: palette.textDim, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "bad" }) {
  const color = tone === "bad" ? palette.bad : tone === "warn" ? palette.warn : tone === "ok" ? palette.ok : palette.text;
  return (
    <div style={{ background: palette.panel, border: `1px solid ${palette.border}`, borderRadius: 12, padding: "12px 16px", minWidth: 150 }}>
      <div style={{ fontSize: 17, color: palette.textDim }}>{label}</div>
      <div style={{ fontSize: 31, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", color: palette.textDim, fontWeight: 600, borderBottom: `1px solid ${palette.border}` };
const td: React.CSSProperties = { padding: "8px 10px", borderBottom: `1px solid ${palette.border}` };
const input: React.CSSProperties = { background: palette.panel, color: palette.text, border: `1px solid ${palette.border}`, borderRadius: 8, padding: "7px 9px", fontSize: 19 };
const select: React.CSSProperties = { ...input, minWidth: 260 };
const emlBtn: React.CSSProperties = { background: palette.panel, color: palette.text, border: `1px solid ${palette.border}`, borderRadius: 8, padding: "5px 10px", fontSize: 17, cursor: "pointer", fontWeight: 600 };
