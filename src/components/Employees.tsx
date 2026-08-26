import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { palette } from "../theme";
import { InfoStar } from "./InfoStar";
import { TableSk } from "./skeleton";
import { AddButtonInput, SearchInput } from "./Inputs";
import { IconCheck, IconX, IconMoveOut, IconUser } from "./icons";
import { ConfirmDialog } from "./ConfirmDialog";

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
    <LegendRow icon={<IconX size={15} />} title="Untrack">takes them off your expected roster. It does not touch their NPT or their team.</LegendRow>
  </>,
  <>
    <LegendRow icon={<IconMoveOut size={16} />} title="Remove from team">for someone who is not yours (e.g. joined with a shared code). Moves them and their NPT history into Access {"> "}Unassigned, where an admin reassigns them to the right team.</LegendRow>
    <div style={{ fontSize: 13, color: palette.textDim, marginTop: 4 }}>Only the icons that apply to a row are shown.</div>
  </>,
];

function parseAliases(raw: string): string[] {
  return Array.from(new Set(
    raw.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)
  ));
}

export default function Employees({ team, refreshKey }: { team: Team; refreshKey?: number }) {
  const [roster, setRoster] = useState<string[]>([]);
  const [data, setData] = useState<{ alias: string; work_date: string }[]>([]);
  const [single, setSingle] = useState("");
  const [query, setQuery] = useState("");
  const [bulk, setBulk] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [confirmRelease, setConfirmRelease] = useState<string | null>(null);   // alias a expulsar al limbo
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

  // el buscador solo filtra las filas visibles (no cambia conteos ni el add)
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? people.filter((p) => p.alias.includes(q)) : people;
  }, [people, query]);

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

  // expulsa a alguien de este team al limbo (Unassigned): la RPC mueve su team_id + NPT historico,
  // escribe el override (para que no vuelva con el codigo compartido) y lo quita del roster, todo
  // server-side. Permitida al manager del team (o admin). Aparece en Access -> Unassigned para que
  // el admin lo reasigne al team correcto.
  async function releaseToLimbo(alias: string) {
    setSaving(true); setMsg("");
    const { error } = await supabase.rpc("manager_release_alias", { p_alias: alias });
    if (error) { setMsg("Error: " + error.message); setSaving(false); return; }
    setMsg(alias + " removed from the team (now in Unassigned).");
    await load();
    setSaving(false);
  }

  return (
    <div>
      {/* Layout 2 columnas: IZQ = add employees (card sin caja, 4 marcos esquineros - patron del
          proyecto, igual que Planned), DER = tabla. align-items:flex-start => la card izquierda NO
          crece con la altura de la tabla. */}
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* IZQUIERDA: add employees (ancho acotado, no crece) */}
        <div style={{ flex: "0 1 400px", minWidth: 300 }}>
      <div style={{ position: "relative", background: "transparent", padding: "18px 22px" }}>
        <span className="npt-bracket tl" /><span className="npt-bracket tr" /><span className="npt-bracket bl" /><span className="npt-bracket br" />
        <div className="npt-title" style={{ fontWeight: 700, fontSize: 28, marginBottom: 10 }}>
          Add employees<InfoStar>{
            <>Pre-list the people you expect on <strong style={hi}>{team.name}</strong>. Until someone connects through STAR Tracker and uploads, they show as <strong style={hi}>Pending</strong>, so you can spot who has not started yet. It does <strong style={hi}>not</strong> change anyone's numbers.</>
          }</InfoStar>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <AddButtonInput value={single} onChange={(e) => setSingle(e.target.value)} icon={<IconUser size={18} />}
            onSubmit={() => add(parseAliases(single))} buttonDisabled={saving || !single.trim()}
            placeholder="employee(s)" title="One or more usernames, comma or space separated" aria-label="Add employees"
            containerStyle={{ width: 300 }} />
          <button onClick={() => setShowBulk((v) => !v)} style={btnGhost}>{showBulk ? "Hide bulk" : "Bulk add"}</button>
        </div>
        {/* colapso animado: siempre montado, la altura + fade animan al abrir/cerrar (esquinas de
            abajo de la card se deslizan solas porque estan ancladas a bottom). */}
        <div className="npt-collapse" data-open={showBulk}>
          <div className="npt-collapse-inner">
            <div style={{ marginTop: 10 }}>
              <textarea value={bulk} onChange={(e) => setBulk(e.target.value)} rows={5}
                tabIndex={showBulk ? 0 : -1} aria-hidden={!showBulk}
                placeholder="One username per line (or comma/space separated)"
                style={{ ...input, width: "100%", fontFamily: "monospace", resize: "vertical" }} />
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
                <button onClick={() => add(parseAliases(bulk))} disabled={saving || !bulk.trim()} tabIndex={showBulk ? 0 : -1} style={btn}>
                  Add {parseAliases(bulk).length || ""} in bulk
                </button>
                <span style={{ color: palette.textDim, fontSize: 17 }}>{parseAliases(bulk).length} usernames detected</span>
              </div>
            </div>
          </div>
        </div>
        {msg && <div style={{ marginTop: 10, color: msg.startsWith("Error") ? palette.bad : palette.ok, fontSize: 18 }}>{msg}</div>}
      </div>
        </div>{/* /IZQUIERDA (add employees) */}

        {/* DERECHA: tabla de usuarios. usa el resto del ancho horizontal */}
        <div style={{ flex: "1 1 560px", minWidth: 320 }}>
      {err && <div style={{ color: palette.bad, marginBottom: 12 }}>{err}</div>}
      {people.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <SearchInput value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="username" aria-label="Search employees" />
        </div>
      )}
      {loading ? (
        <TableSk template="40px 2fr 90px 90px 110px 90px" rows={6} boxed />
      ) : people.length === 0 ? (
        <div style={{ color: palette.textDim }}>No employees yet. Add them above.</div>
      ) : shown.length === 0 ? (
        <div style={{ color: palette.textDim }}>No employees match "{query.trim()}".</div>
      ) : (
        <div style={{ border: `1px solid ${palette.border}`, borderRadius: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 19 }}>
            <thead>
              <tr>
                {["#", "Employee", "Status", "Days reported", "Last report", "Actions"].map((h, i, arr) => (
                  <th key={h} style={{ ...th, textAlign: i <= 1 ? "left" : "center" }}>
                    {h}
                    {i === arr.length - 1 && <InfoStar spin pages={ACTIONS_LEGEND} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((p, i) => (
                <tr key={p.alias} style={{ background: i % 2 ? palette.panelAlt : palette.panel }}>
                  <td style={{ ...td, color: palette.textDim }}>{i + 1}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{p.alias}</td>
                  <td style={{ ...td, textAlign: "center" }}><ConnChip status={p.status} /></td>
                  <td style={{ ...td, textAlign: "center" }}>{p.days || "-"}</td>
                  <td style={{ ...td, textAlign: "center" }}>{p.last ?? "-"}</td>
                  <td style={{ ...td, textAlign: "center" }}>
                    <span style={{ display: "inline-flex", gap: 22, justifyContent: "center", alignItems: "center" }}>
                      {p.expected
                        ? <button onClick={() => removeFromRoster(p.alias)} disabled={saving} className="npt-ico-act npt-ico-danger"
                            aria-label={`Untrack ${p.alias}`} title="Untrack (remove from your expected list; keeps their NPT under the team)"><IconX size={17} /></button>
                        : <button onClick={() => add([p.alias])} disabled={saving} className="npt-ico-act"
                            aria-label={`Confirm ${p.alias} is on your team`} title="Confirm this person is on your team"><IconCheck size={18} /></button>}
                      {p.connected && team.id !== UNASSIGNED_ID && (
                        <button onClick={() => setConfirmRelease(p.alias)} disabled={saving} className="npt-ico-act npt-ico-danger"
                          aria-label={`Remove ${p.alias} from the team`}
                          title="Remove from team (sends them and their NPT to Unassigned for reassignment)"><IconMoveOut size={18} /></button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
        </div>{/* /DERECHA (tabla) */}
      </div>{/* /flex 2 columnas */}

      {confirmRelease && (
        <ConfirmDialog
          title="Remove from team?"
          confirmLabel="Remove"
          body={<>
            <strong style={hi}>{confirmRelease}</strong> and their NPT history will move out of{" "}
            <strong style={hi}>{team.name}</strong> into <strong style={hi}>Unassigned</strong>, where an admin
            can reassign them to the right team. They stay there even if they keep using a shared enrollment code. Continue?
          </>}
          onCancel={() => setConfirmRelease(null)}
          onConfirm={() => { const a = confirmRelease; setConfirmRelease(null); releaseToLimbo(a); }}
        />
      )}
    </div>
  );
}

function ConnChip({ status }: { status: ConnStatus }) {
  // solo texto de color, sin pill (mismo lenguaje que StatusChip). Connected verde / Pending amarillo /
  // Unlisted gris.
  const map: Record<ConnStatus, { label: string; fg: string }> = {
    connected: { label: "Connected", fg: palette.ok },
    pending: { label: "Pending", fg: palette.warn },
    unlisted: { label: "Unlisted", fg: palette.textDim },
  };
  const s = map[status];
  return <span style={{ fontSize: 17, fontWeight: 700, color: s.fg }}>{s.label}</span>;
}

const th: React.CSSProperties = { textAlign: "left", padding: "9px 12px", color: palette.textDim, fontWeight: 600, borderBottom: `1px solid ${palette.border}` };
const td: React.CSSProperties = { textAlign: "left", padding: "9px 12px", borderBottom: `1px solid ${palette.border}` };
const input: React.CSSProperties = { background: palette.panel, color: palette.text, border: `1px solid ${palette.border}`, borderRadius: 0, padding: "8px 10px", fontSize: 19 };
const btn: React.CSSProperties = { background: palette.accent, color: palette.accentText, border: "none", borderRadius: 0, padding: "8px 14px", fontSize: 18, cursor: "pointer", fontWeight: 600 };
const btnGhost: React.CSSProperties = { background: palette.panel, color: palette.text, border: `1px solid ${palette.border}`, borderRadius: 0, padding: "8px 12px", fontSize: 18, cursor: "pointer" };
