import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { palette } from "../theme";
import { TableSkeleton } from "./skeleton";

interface Team { id: string; name: string; npt_target_pct: number; }

// UUID fijo del team Unassigned (igual que el trigger)
const UNASSIGNED_ID = "00000000-0000-0000-0000-000000000001";

type ConnStatus = "connected" | "pending" | "unlisted";

interface Person {
  alias: string;
  expected: boolean;    // esta en el roster
  connected: boolean;   // ya subio data
  days: number;
  last: string | null;
  status: ConnStatus;
}

const RANK: Record<ConnStatus, number> = { pending: 0, unlisted: 1, connected: 2 };

function parseAliases(raw: string): string[] {
  return Array.from(new Set(
    raw.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)
  ));
}

export default function Employees({ team, refreshKey, isAdmin }: { team: Team; refreshKey?: number; isAdmin?: boolean }) {
  const [roster, setRoster] = useState<string[]>([]);
  const [data, setData] = useState<{ alias: string; work_date: string }[]>([]);
  const [single, setSingle] = useState("");
  const [bulk, setBulk] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const first = useRef(true);

  async function load() {
    if (first.current) setLoading(true);
    setErr("");
    const [{ data: r, error: e1 }, { data: d, error: e2 }] = await Promise.all([
      supabase.from("roster").select("alias").eq("team_id", team.id),
      supabase.from("npt_daily").select("alias,work_date").eq("team_id", team.id),
    ]);
    if (e1 || e2) setErr((e1 || e2)!.message);
    setRoster(((r as { alias: string }[]) ?? []).map((x) => x.alias));
    setData((d as { alias: string; work_date: string }[]) ?? []);
    first.current = false;
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [team.id, refreshKey]);

  const people = useMemo(() => {
    const rosterSet = new Set(roster);
    const agg = new Map<string, { days: Set<string>; last: string | null }>();
    for (const row of data) {
      let a = agg.get(row.alias);
      if (!a) { a = { days: new Set(), last: null }; agg.set(row.alias, a); }
      a.days.add(row.work_date);
      if (!a.last || row.work_date > a.last) a.last = row.work_date;
    }
    const names = new Set<string>([...rosterSet, ...agg.keys()]);
    const out: Person[] = [];
    for (const alias of names) {
      const expected = rosterSet.has(alias);
      const d = agg.get(alias);
      const connected = !!d;
      const status: ConnStatus = connected ? (expected ? "connected" : "unlisted") : "pending";
      out.push({ alias, expected, connected, days: d ? d.days.size : 0, last: d?.last ?? null, status });
    }
    out.sort((a, b) => RANK[a.status] - RANK[b.status] || a.alias.localeCompare(b.alias));
    return out;
  }, [roster, data]);

  const pending = people.filter((p) => p.status === "pending").length;
  const connected = people.filter((p) => p.connected).length;

  async function add(aliases: string[]) {
    if (!aliases.length) return;
    setSaving(true); setMsg("");
    const rows = aliases.map((alias) => ({ alias, team_id: team.id }));
    const { error } = await supabase.from("roster").upsert(rows, { onConflict: "alias,team_id", ignoreDuplicates: true });
    if (error) setMsg("Error: " + error.message);
    else { setMsg(`Added ${aliases.length} to roster.`); setSingle(""); setBulk(""); await load(); }
    setSaving(false);
  }

  async function removeFromRoster(alias: string) {
    setSaving(true); setMsg("");
    const { error } = await supabase.from("roster").delete().match({ team_id: team.id, alias });
    if (error) setMsg("Error: " + error.message);
    else await load();
    setSaving(false);
  }

  // saca a alguien de este team: mueve su team_id (y su NPT historico) a Unassigned via RPC admin,
  // y lo quita del roster de este team. Solo admin. Aparece en Access -> Unassigned para reasignar.
  async function moveToUnassigned(alias: string) {
    setSaving(true); setMsg("");
    const { error } = await supabase.rpc("admin_assign_alias", { p_alias: alias, p_team: UNASSIGNED_ID });
    if (error) { setMsg("Error: " + error.message); setSaving(false); return; }
    await supabase.from("roster").delete().match({ team_id: team.id, alias });
    setMsg(alias + " moved to Unassigned.");
    await load();
    setSaving(false);
  }

  return (
    <div>
      <div style={{ background: palette.panelAlt, border: `1px solid ${palette.border}`, borderRadius: 8, padding: "14px 16px", marginBottom: 16 }}>
        <div className="npt-title" style={{ fontWeight: 700, fontSize: 28, marginBottom: 4 }}>Add employees to {team.name}</div>
        <div style={{ color: palette.textDim, fontSize: 18, marginBottom: 10 }}>
          Add expected usernames. They show as Pending until the person connects via STAR Tracker and uploads. This does not affect anyone's numbers.
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input value={single} onChange={(e) => setSingle(e.target.value)} placeholder="username"
            onKeyDown={(e) => { if (e.key === "Enter") add(parseAliases(single)); }} style={{ ...input, width: 200 }} />
          <button onClick={() => add(parseAliases(single))} disabled={saving || !single.trim()} style={btn}>Add</button>
          <button onClick={() => setShowBulk((v) => !v)} style={btnGhost}>{showBulk ? "Hide bulk" : "Bulk add"}</button>
        </div>
        {showBulk && (
          <div style={{ marginTop: 10 }}>
            <textarea value={bulk} onChange={(e) => setBulk(e.target.value)} rows={5}
              placeholder="One username per line (or comma/space separated)"
              style={{ ...input, width: "100%", fontFamily: "monospace", resize: "vertical" }} />
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
              <button onClick={() => add(parseAliases(bulk))} disabled={saving || !bulk.trim()} style={btn}>
                Add {parseAliases(bulk).length || ""} in bulk
              </button>
              <span style={{ color: palette.textDim, fontSize: 17 }}>{parseAliases(bulk).length} usernames detected</span>
            </div>
          </div>
        )}
        {msg && <div style={{ marginTop: 10, color: msg.startsWith("Error") ? palette.bad : palette.ok, fontSize: 18 }}>{msg}</div>}
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "baseline" }}>
        <div style={{ fontSize: 31, fontWeight: 700 }}>{people.length}</div>
        <div style={{ color: palette.textDim, fontSize: 18 }}>{connected} connected, {pending} pending</div>
      </div>

      {err && <div style={{ color: palette.bad, marginBottom: 12 }}>{err}</div>}
      {loading ? (
        <TableSkeleton rows={6} cols={5} />
      ) : people.length === 0 ? (
        <div style={{ color: palette.textDim }}>No employees yet. Add them above.</div>
      ) : (
        <div style={{ border: `1px solid ${palette.border}`, borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 19 }}>
            <thead>
              <tr>
                {["#", "Investigator", "Status", "Days reported", "Last report", ""].map((h, i) => (
                  <th key={h || "act"} style={{ ...th, textAlign: i === 1 ? "left" : i >= 3 ? "right" : "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people.map((p, i) => (
                <tr key={p.alias} style={{ background: i % 2 ? palette.panelAlt : palette.panel }}>
                  <td style={{ ...td, color: palette.textDim }}>{i + 1}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{p.alias}</td>
                  <td style={td}><ConnChip status={p.status} /></td>
                  <td style={{ ...td, textAlign: "right" }}>{p.days || "-"}</td>
                  <td style={{ ...td, textAlign: "right" }}>{p.last ?? "-"}</td>
                  <td style={{ ...td, textAlign: "right" }}>
                    <span style={{ display: "inline-flex", gap: 8, justifyContent: "flex-end" }}>
                      {p.expected
                        ? <button onClick={() => removeFromRoster(p.alias)} disabled={saving} className="npt-btn-remove" title="Remove from roster">Remove</button>
                        : <button onClick={() => add([p.alias])} disabled={saving} style={btnGhost} title="Add to roster">Add to roster</button>}
                      {isAdmin && p.connected && team.id !== UNASSIGNED_ID && (
                        <button onClick={() => moveToUnassigned(p.alias)} disabled={saving} className="npt-btn-remove"
                          title="Move this person out of this team into Unassigned (moves their NPT too)">Move to Unassigned</button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ConnChip({ status }: { status: ConnStatus }) {
  const map: Record<ConnStatus, { label: string; fg: string; bg: string }> = {
    connected: { label: "Connected", fg: palette.ok, bg: palette.okBg },
    pending: { label: "Pending", fg: palette.warn, bg: palette.warnBg },
    unlisted: { label: "Unlisted", fg: palette.textDim, bg: palette.panelAlt },
  };
  const s = map[status];
  return <span style={{ display: "inline-block", fontSize: 17, fontWeight: 600, padding: "2px 10px", borderRadius: 6, color: s.fg, background: s.bg, border: `1px solid color-mix(in srgb, ${s.fg} 28%, transparent)` }}>{s.label}</span>;
}

const th: React.CSSProperties = { textAlign: "left", padding: "9px 12px", color: palette.textDim, fontWeight: 600, borderBottom: `1px solid ${palette.border}` };
const td: React.CSSProperties = { textAlign: "left", padding: "9px 12px", borderBottom: `1px solid ${palette.border}` };
const input: React.CSSProperties = { background: palette.panel, color: palette.text, border: `1px solid ${palette.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 19 };
const btn: React.CSSProperties = { background: palette.accent, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 18, cursor: "pointer", fontWeight: 600 };
const btnGhost: React.CSSProperties = { background: palette.panel, color: palette.text, border: `1px solid ${palette.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 18, cursor: "pointer" };
