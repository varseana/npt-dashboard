import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { palette } from "../theme";
import {
  computeDay, dedupePersonDay, fmtHms, resolvePlanned, statusFor,
  weekInfo, weekLabel, recentWeeks, isoDate,
  type NptDailyRow, type NptStatus, type PlannedRow,
} from "../lib/npt";
import { StatusChip } from "./status";
import { BlockSkeleton } from "./skeleton";
import { AddButtonInput, splitAliases } from "./Inputs";
import { IconUser, IconTrash } from "./icons";
import { ConfirmDialog } from "./ConfirmDialog";
import { Dropdown } from "./Dropdown";

interface ManagerRow { user_id: string; email: string; role: string; team_id: string | null; }
interface MemberLink { manager_owner: string; alias: string; team_id: string | null; }
interface PlannedRowT extends PlannedRow { team_id: string | null; }

// vista admin: piramide de managers -> sus miembros con NPT de la semana. Admin asigna/quita.
export default function Org() {
  const weeks = useMemo(() => recentWeeks(new Date(), 16), []);
  const [weekKey, setWeekKey] = useState(() => weekInfo(new Date()).key);
  const [managers, setManagers] = useState<ManagerRow[]>([]);
  const [members, setMembers] = useState<MemberLink[]>([]);
  const [daily, setDaily] = useState<NptDailyRow[]>([]);
  const [planned, setPlanned] = useState<PlannedRowT[]>([]);
  const [addInputs, setAddInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  // miembro pendiente de quitar (modal de confirmacion)
  const [confirmRemove, setConfirmRemove] = useState<{ owner: string; alias: string } | null>(null);

  const sel = useMemo(() => weekInfo(new Date(weekKey + "T12:00:00")), [weekKey]);

  async function load() {
    setLoading(true);
    const [{ data: mg }, { data: mm }, { data: d }, { data: p }] = await Promise.all([
      supabase.from("managers").select("user_id,email,role,team_id"),
      supabase.from("manager_members").select("manager_owner,alias,team_id"),
      supabase.from("npt_daily").select("alias,tenant,work_date,profile,aux_seconds,team_id")
        .gte("work_date", isoDate(sel.start)).lte("work_date", isoDate(sel.end)),
      supabase.from("npt_planned").select("team_id,alias,week_key,planned_seconds"),
    ]);
    setManagers((mg as ManagerRow[]) ?? []);
    setMembers((mm as MemberLink[]) ?? []);
    setDaily((d as (NptDailyRow & { team_id: string })[]) ?? []);
    setPlanned((p as PlannedRowT[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [weekKey]);

  // NPT actual por alias en la semana
  const nptByAlias = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of dedupePersonDay(daily)) m.set(r.alias, (m.get(r.alias) || 0) + computeDay(r.aux_seconds).nptSeconds);
    return m;
  }, [daily]);

  const knownAliases = useMemo(() => {
    const s = new Set<string>();
    daily.forEach((r) => s.add(r.alias));
    members.forEach((m) => s.add(m.alias));
    return Array.from(s).sort();
  }, [daily, members]);

  function plannedFor(alias: string, teamId: string | null): number | null {
    const rows = planned.filter((p) => p.team_id === teamId);
    return resolvePlanned(rows, alias, weekKey);
  }

  async function addMember(mgr: ManagerRow) {
    // acepta uno o varios usernames (coma / espacio separados)
    const aliases = splitAliases(addInputs[mgr.user_id] || "");
    if (!aliases.length) return;
    setMsg("");
    const rows = aliases.map((alias) => ({ manager_owner: mgr.user_id, alias, team_id: mgr.team_id }));
    const { error } = await supabase.from("manager_members").insert(rows);
    if (error) setMsg("Error: " + error.message);
    else { setAddInputs((p) => ({ ...p, [mgr.user_id]: "" })); await load(); }
  }

  async function removeMember(managerOwner: string, alias: string) {
    setMsg("");
    const { error } = await supabase.from("manager_members").delete().match({ manager_owner: managerOwner, alias });
    if (error) setMsg("Error: " + error.message);
    else await load();
  }

  if (loading) return <BlockSkeleton />;

  const realManagers = managers.filter((m) => m.role === "manager");

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 16, color: palette.textDim, marginBottom: 4 }}>Week</div>
          <Dropdown value={weekKey} onChange={setWeekKey} minWidth={260} ariaLabel="Select week"
            options={weeks.map((w) => ({ value: w.key, label: weekLabel(w) }))} />
        </div>
        <div style={{ color: palette.textDim, fontSize: 18 }}>{realManagers.length} managers</div>
      </div>

      {msg && <div style={{ color: msg.startsWith("Error") ? palette.bad : palette.ok, marginBottom: 12, fontSize: 18 }}>{msg}</div>}

      {realManagers.length === 0 ? (
        <div style={{ color: palette.textDim }}>No managers yet. Create them in Supabase (managers table).</div>
      ) : realManagers.map((mgr) => {
        const mine = members.filter((m) => m.manager_owner === mgr.user_id);
        const teamNpt = mine.reduce((a, m) => a + (nptByAlias.get(m.alias) || 0), 0);
        return (
          <div key={mgr.user_id} style={{ border: `1px solid ${palette.border}`, borderRadius: 8, padding: "12px 14px", marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
              <div style={{ fontWeight: 700 }}>{mgr.email} <span style={{ color: palette.textDim, fontWeight: 400, fontSize: 18 }}>({mine.length} members, NPT {fmtHms(teamNpt)})</span></div>
            </div>
            {mine.length === 0 ? (
              <div style={{ color: palette.textDim, fontSize: 18, marginBottom: 8 }}>No members assigned.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 18, marginBottom: 8 }}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign: "left" }}>Member</th>
                    <th style={th}>Actual NPT</th>
                    <th style={th}>Planned</th>
                    <th style={th}>Remaining</th>
                    <th style={th}>Status</th>
                    <th style={{ ...th, textAlign: "center" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {mine.map((m) => {
                    const actual = nptByAlias.get(m.alias) || 0;
                    const pl = plannedFor(m.alias, m.team_id);
                    const remaining = pl != null ? pl - actual : null;
                    const status: NptStatus = statusFor(pl, actual);
                    return (
                      <tr key={m.alias}>
                        <td style={{ ...td, textAlign: "left", fontWeight: 600 }}>{m.alias}</td>
                        <td style={td}>{fmtHms(actual)}</td>
                        <td style={{ ...td, color: palette.textDim }}>{pl != null ? fmtHms(pl) : "-"}</td>
                        <td style={{ ...td, color: remainColor(status) }}>{remaining != null ? fmtHms(remaining) : "-"}</td>
                        <td style={td}><StatusChip status={status} /></td>
                        <td style={{ ...td, textAlign: "center" }}>
                          <button onClick={() => setConfirmRemove({ owner: mgr.user_id, alias: m.alias })}
                            className="npt-ico-act npt-ico-danger" title="Remove member" aria-label="Remove member"><IconTrash size={17} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <AddButtonInput list="npt-known-aliases" value={addInputs[mgr.user_id] || ""} icon={<IconUser size={18} />}
                onChange={(e) => setAddInputs((p) => ({ ...p, [mgr.user_id]: e.target.value }))}
                onSubmit={() => addMember(mgr)} buttonDisabled={!(addInputs[mgr.user_id] || "").trim()}
                placeholder="username" title="Assign one or more usernames, comma or space separated"
                aria-label="Assign username" containerStyle={{ width: 260 }} />
            </div>
          </div>
        );
      })}
      <datalist id="npt-known-aliases">
        {knownAliases.map((a) => (<option key={a} value={a} />))}
      </datalist>

      {confirmRemove && (
        <ConfirmDialog title="Remove member?" confirmLabel="Remove"
          body={<>Remove <strong style={{ color: palette.text, fontWeight: 700 }}>{confirmRemove.alias}</strong> from this manager? This unlinks the grant; it does not delete their NPT data.</>}
          onCancel={() => setConfirmRemove(null)}
          onConfirm={() => { const c = confirmRemove; setConfirmRemove(null); removeMember(c.owner, c.alias); }} />
      )}
    </div>
  );
}

function remainColor(s: NptStatus): string {
  return s === "bad" ? palette.bad : s === "warn" ? palette.warn : s === "ok" ? palette.ok : palette.textDim;
}

const th: React.CSSProperties = { textAlign: "center", padding: "8px 10px", color: palette.textDim, fontWeight: 600, borderBottom: `1px solid ${palette.border}` };
const td: React.CSSProperties = { textAlign: "center", padding: "8px 10px", borderBottom: `1px solid ${palette.border}` };
