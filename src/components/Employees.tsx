import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { palette } from "../theme";
import { InfoStar } from "./InfoStar";
import { TableSkeleton } from "./skeleton";
import { AddInput } from "./Inputs";
import { IconCheck, IconX, IconMoveOut } from "./icons";

interface Team { id: string; name: string; npt_target_pct: number; }
// highlight monocromatico dentro del texto del popover (bold en color de texto full)
const hi = { color: palette.text, fontWeight: 700 } as React.CSSProperties;

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

// fila de la leyenda del popover: icono a la izquierda (ancho fijo, alinea los labels) + explicacion.
function LegendRow({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
      <span style={{ flex: "0 0 22px", display: "inline-flex", justifyContent: "center", color: palette.text, marginTop: 2 }}>{icon}</span>
      <span><strong style={hi}>{title}</strong> {children}</span>
    </div>
  );
}
// leyenda de la columna "Actions" (popover del asterisco giratorio), paginada 1/2.
const ACTIONS_LEGEND: React.ReactNode[] = [
  <>
    <div style={{ fontWeight: 700, color: palette.text, marginBottom: 8 }}>What each action does</div>
    <LegendRow icon={<IconCheck size={16} />} title="Confirm">this person already reports under your team; adds them to your roster so they count as expected (Unlisted becomes Connected).</LegendRow>
    <LegendRow icon={<IconX size={15} />} title="Remove">takes them off your expected roster. It does not touch their NPT.</LegendRow>
  </>,
  <>
    <LegendRow icon={<IconMoveOut size={16} />} title="Move to Unassigned"><strong style={hi}>Admin only.</strong> Moves this person and their NPT history out of the team, into Access {"> "}Unassigned.</LegendRow>
    <div style={{ fontSize: 13, color: palette.textDim, marginTop: 4 }}>Only the icons that apply to a row are shown.</div>
  </>,
];

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

  async function add(aliases: string[]) {
    if (!aliases.length) return;
    setSaving(true); setMsg("");
    const rows = aliases.map((alias) => ({ alias, team_id: team.id }));
    const { error } = await supabase.from("roster").upsert(rows, { onConflict: "alias,team_id", ignoreDuplicates: true });
    if (error) setMsg("Error: " + error.message);
    else { setMsg(`Added ${aliases.length} to the team list.`); setSingle(""); setBulk(""); await load(); }
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
        <div className="npt-title" style={{ fontWeight: 700, fontSize: 28, marginBottom: 10 }}>
          Add employees<InfoStar>{
            <>Pre-list the people you expect on <strong style={hi}>{team.name}</strong>. Until someone connects through STAR Tracker and uploads, they show as <strong style={hi}>Pending</strong>, so you can spot who has not started yet. It does <strong style={hi}>not</strong> change anyone's numbers.</>
          }</InfoStar>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <AddInput value={single} onChange={(e) => setSingle(e.target.value)} placeholder="employee(s)"
            title="One or more usernames, comma or space separated" aria-label="Add employees"
            onKeyDown={(e) => { if (e.key === "Enter") add(parseAliases(single)); }}
            style={{ width: 260 }} />
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
                {["#", "Employee", "Status", "Days reported", "Last report", "Actions"].map((h, i, arr) => (
                  <th key={h} style={{ ...th, textAlign: i === 1 ? "left" : i >= 3 ? "right" : "left" }}>
                    {h}
                    {i === arr.length - 1 && <InfoStar spin pages={ACTIONS_LEGEND} />}
                  </th>
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
                    <span style={{ display: "inline-flex", gap: 22, justifyContent: "flex-end", alignItems: "center" }}>
                      {p.expected
                        ? <button onClick={() => removeFromRoster(p.alias)} disabled={saving} className="npt-ico-act npt-ico-danger"
                            aria-label={`Remove ${p.alias} from roster`} title="Remove (keeps their NPT)"><IconX size={17} /></button>
                        : <button onClick={() => add([p.alias])} disabled={saving} className="npt-ico-act"
                            aria-label={`Confirm ${p.alias} is on your team`} title="Confirm this person is on your team"><IconCheck size={18} /></button>}
                      {isAdmin && p.connected && team.id !== UNASSIGNED_ID && (
                        <button onClick={() => moveToUnassigned(p.alias)} disabled={saving} className="npt-ico-act npt-ico-danger"
                          aria-label={`Move ${p.alias} to Unassigned`}
                          title="Move to Unassigned (moves their NPT too)"><IconMoveOut size={18} /></button>
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
const btn: React.CSSProperties = { background: palette.accent, color: palette.accentText, border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 18, cursor: "pointer", fontWeight: 600 };
const btnGhost: React.CSSProperties = { background: palette.panel, color: palette.text, border: `1px solid ${palette.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 18, cursor: "pointer" };
