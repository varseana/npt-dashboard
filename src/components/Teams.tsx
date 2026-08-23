import * as React from "react";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { palette } from "../theme";
import { TableSkeleton } from "./skeleton";
import { InfoStar } from "./InfoStar";
import { AddInput, AddButtonInput } from "./Inputs";
import { IconPower, IconTrash } from "./icons";

interface Team { id: string; name: string; npt_target_pct: number }
interface Code { code: string; team_id: string; active: boolean }
// highlight monocromatico dentro del texto del popover (bold en color de texto full)
const hi = { color: palette.text, fontWeight: 700 } as React.CSSProperties;
// team fijo "Unassigned": no se puede borrar (es el catch-all del trigger set_team_from_code)
const UNASSIGNED_ID = "00000000-0000-0000-0000-000000000001";

// normaliza el codigo de enrollment mientras se escribe: solo MAYUSCULAS, sin espacios
// (los espacios pasan a "-"), y ningun caracter especial salvo "-" (guiones repetidos se colapsan).
function sanitizeCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9-]/g, "")
    .replace(/-{2,}/g, "-");
}

// panel de admin: crear/editar teams y sus codigos de enrollment sin tocar SQL.
// El borrado de teams no se expone (arrastra codigos y choca con el FK de npt_daily).
export default function Teams({ refreshKey }: { refreshKey: number }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [codes, setCodes] = useState<Code[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  // form de team nuevo
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  // inputs de codigo nuevo por team
  const [codeInputs, setCodeInputs] = useState<Record<string, string>>({});
  // team pendiente de borrado (modal de confirmacion)
  const [confirmTeam, setConfirmTeam] = useState<Team | null>(null);

  async function load(spinner = false) {
    if (spinner) setLoading(true);
    const [{ data: t }, { data: c }] = await Promise.all([
      supabase.from("teams").select("id,name,npt_target_pct").order("name"),
      supabase.from("enrollments").select("code,team_id,active").order("code"),
    ]);
    setTeams((t as Team[]) ?? []);
    setCodes((c as Code[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(true); /* eslint-disable-next-line */ }, []);
  useEffect(() => { if (refreshKey > 0) load(false); /* eslint-disable-next-line */ }, [refreshKey]);

  async function createTeam() {
    setMsg("");
    const name = newName.trim();
    if (!name) return;
    // npt_target_pct queda como default fijo (10); ya no se expone (el "target" real del team es su
    // budget, que setea el manager en Team -> Planned; el modelo budget-first reemplazo el % de target).
    const { data, error } = await supabase.from("teams")
      .insert({ name, npt_target_pct: 10 })
      .select("id").single();
    if (error) { setMsg("Error: " + error.message); return; }
    const code = sanitizeCode(newCode.trim());
    if (code && data) {
      const { error: e2 } = await supabase.from("enrollments").insert({ code, team_id: (data as { id: string }).id });
      if (e2) setMsg("Team created, but code failed: " + e2.message);
    }
    setNewName(""); setNewCode("");
    await load(false);
  }

  async function saveTeam(t: Team, changes: Partial<Team>) {
    setMsg("");
    setTeams((ts) => ts.map((x) => (x.id === t.id ? { ...x, ...changes } : x)));
    const { error } = await supabase.from("teams").update(changes).eq("id", t.id);
    if (error) { setMsg("Error: " + error.message); load(false); }
  }

  async function addCode(teamId: string) {
    setMsg("");
    const code = sanitizeCode((codeInputs[teamId] ?? "").trim());
    if (!code) return;
    const { error } = await supabase.from("enrollments").insert({ code, team_id: teamId });
    if (error) { setMsg("Error: " + error.message); return; }
    setCodeInputs((m) => ({ ...m, [teamId]: "" }));
    await load(false);
  }

  async function toggleCode(c: Code) {
    setMsg("");
    setCodes((cs) => cs.map((x) => (x.code === c.code ? { ...x, active: !x.active } : x)));
    const { error } = await supabase.from("enrollments").update({ active: !c.active }).eq("code", c.code);
    if (error) { setMsg("Error: " + error.message); load(false); }
  }

  // borra un codigo de enrollment. Si esta en uso y un FK lo bloquea, se muestra el error (mejor
  // desactivar que borrar; por eso el toggle sigue existiendo).
  async function deleteCode(c: Code) {
    setMsg("");
    const { error } = await supabase.from("enrollments").delete().eq("code", c.code);
    if (error) { setMsg("Couldn't delete code (it may be in use): " + error.message); return; }
    await load(false);
  }

  // borra un team entero (solo admin: este panel ya es admin-only). Es DESTRUCTIVO y puede fallar por
  // FK si el team tiene codigos, roster o NPT historico -> se surfacea el error con guia.
  async function deleteTeam(t: Team) {
    setMsg("");
    setConfirmTeam(null);
    if (t.id === UNASSIGNED_ID) { setMsg("The Unassigned team can't be deleted."); return; }
    const { error } = await supabase.from("teams").delete().eq("id", t.id);
    if (error) {
      setMsg("Couldn't delete this team. Delete its enrollment codes first, and move its people to Unassigned (it can't be deleted while it has codes, members, or NPT data).");
      return;
    }
    await load(false);
  }

  if (loading) return <div><TableSkeleton rows={3} /></div>;

  return (
    <div>
      {msg && <div style={{ marginBottom: 12, color: msg.startsWith("Error") ? palette.bad : palette.warn, fontSize: 18 }}>{msg}</div>}

      <div style={{ background: palette.panelAlt, border: `1px solid ${palette.border}`, borderRadius: 8, padding: "14px 16px", marginBottom: 20 }}>
        <div className="npt-title" style={{ fontWeight: 700, fontSize: 28, marginBottom: 10 }}>
          New team<InfoStar spin={false} pages={[
            <>Create a team and, optionally, its <strong style={hi}>enrollment code</strong>. The team's weekly NPT target is its <strong style={hi}>budget</strong>, set by its manager in Team {"->"} Planned.</>,
            <><strong style={hi}>Enrollment codes</strong> are what employees type in STAR Tracker to join a team. A team can have several. <strong style={hi}>Deactivate</strong> one to stop new joins without touching data already uploaded; <strong style={hi}>delete</strong> removes it entirely.</>,
          ]} />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Team name"
            style={{ ...input, flex: "1 1 340px", minWidth: 340 }} />
          <AddInput value={newCode} onChange={(e) => setNewCode(sanitizeCode(e.target.value))} placeholder="code"
            title="Uppercase only, no spaces, dashes (-) as separators" aria-label="Enrollment code (optional)"
            style={{ width: 200, textTransform: "uppercase" }} />
          <button onClick={createTeam} disabled={!newName.trim()} style={btn}>Create team</button>
        </div>
      </div>

      {teams.length === 0
        ? <Empty>No teams yet. Create one above.</Empty>
        : teams.map((t) => {
          const tCodes = codes.filter((c) => c.team_id === t.id);
          return (
            <div key={t.id} style={{ border: `1px solid ${palette.border}`, borderRadius: 8, marginBottom: 14, overflow: "hidden" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "12px 14px", background: palette.panel, flexWrap: "wrap" }}>
                <input defaultValue={t.name}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== t.name) saveTeam(t, { name: v }); }}
                  style={{ ...input, fontWeight: 600, flex: "1 1 340px", minWidth: 340 }} title="Rename team (saves on blur)" />
                {t.id !== UNASSIGNED_ID && (
                  <button onClick={() => setConfirmTeam(t)} className="npt-ico-act npt-ico-danger"
                    title="Delete this team" aria-label="Delete team" style={{ marginLeft: "auto" }}>
                    <IconTrash size={20} />
                  </button>
                )}
              </div>
              <div style={{ padding: "10px 14px", borderTop: `1px solid ${palette.border}`, background: palette.bg }}>
                <div style={{ fontSize: 17, color: palette.textDim, marginBottom: 8, fontWeight: 600 }}>Enrollment codes</div>
                {tCodes.length === 0 && <div style={{ fontSize: 18, color: palette.textDim, marginBottom: 8 }}>No codes yet.</div>}
                {tCodes.map((c) => (
                  <div key={c.code} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    {/* el codigo mismo lleva el color de estado: verde activo / rojo inactivo (sin tag) */}
                    <code style={{ fontSize: 18, fontWeight: 700, color: c.active ? palette.ok : palette.bad }}>{c.code}</code>
                    <button onClick={() => toggleCode(c)} className="npt-ico-act"
                      title={c.active ? "Deactivate code" : "Activate code"} aria-label={c.active ? "Deactivate code" : "Activate code"}>
                      <IconPower size={18} />
                    </button>
                    <button onClick={() => deleteCode(c)} className="npt-ico-act npt-ico-danger"
                      title="Delete code" aria-label="Delete code">
                      <IconTrash size={17} />
                    </button>
                  </div>
                ))}
                <AddButtonInput value={codeInputs[t.id] ?? ""}
                  onChange={(e) => setCodeInputs((m) => ({ ...m, [t.id]: sanitizeCode(e.target.value) }))}
                  onSubmit={() => addCode(t.id)} buttonDisabled={!(codeInputs[t.id] ?? "").trim()}
                  placeholder="code" title="Uppercase only, no spaces, dashes (-) as separators"
                  aria-label="Add enrollment code" containerStyle={{ marginTop: 8 }}
                  style={{ textTransform: "uppercase" }} />
              </div>
            </div>
          );
        })}

      {confirmTeam && (
        <Confirm title="Delete team?"
          body={`This permanently deletes "${confirmTeam.name}". It only works if the team has no enrollment codes, members, or NPT data (delete its codes and move its people to Unassigned first). This cannot be undone.`}
          onCancel={() => setConfirmTeam(null)} onConfirm={() => deleteTeam(confirmTeam)} />
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "12px 14px", color: palette.textDim, fontSize: 18, border: `1px solid ${palette.border}`, borderRadius: 8 }}>{children}</div>;
}

// modal de confirmacion para el borrado destructivo de un team.
function Confirm({ title, body, onCancel, onConfirm }: { title: string; body: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: palette.panel, border: `1px solid ${palette.border}`, borderRadius: 12, padding: 24, width: 420, maxWidth: "90vw" }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 29, color: palette.text }}>{title}</h2>
        <p style={{ margin: "0 0 20px", color: palette.textDim, fontSize: 19 }}>{body}</p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onCancel} style={btnGhost}>Cancel</button>
          <button onClick={onConfirm} style={{ ...btn, background: palette.bad }}>Delete team</button>
        </div>
      </div>
    </div>
  );
}

const input: React.CSSProperties = {
  background: palette.panel, color: palette.text, border: `1px solid ${palette.border}`,
  borderRadius: 8, padding: "8px 10px", fontSize: 19, boxSizing: "border-box",
};
const btn: React.CSSProperties = {
  background: palette.accent, color: palette.accentText, border: "none", borderRadius: 8,
  padding: "8px 14px", fontSize: 18, cursor: "pointer", fontWeight: 600,
};
const btnGhost: React.CSSProperties = {
  background: palette.panel, color: palette.text, border: `1px solid ${palette.border}`,
  borderRadius: 8, padding: "6px 12px", fontSize: 18, cursor: "pointer",
};
