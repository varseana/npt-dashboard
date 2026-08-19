import * as React from "react";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { palette } from "../theme";
import { TableSkeleton } from "./skeleton";

interface Team { id: string; name: string; npt_target_pct: number }
interface Code { code: string; team_id: string; active: boolean }

// panel de admin: crear/editar teams y sus codigos de enrollment sin tocar SQL.
// El borrado de teams no se expone (arrastra codigos y choca con el FK de npt_daily).
export default function Teams({ refreshKey }: { refreshKey: number }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [codes, setCodes] = useState<Code[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  // form de team nuevo
  const [newName, setNewName] = useState("");
  const [newTarget, setNewTarget] = useState("10");
  const [newCode, setNewCode] = useState("");
  // inputs de codigo nuevo por team
  const [codeInputs, setCodeInputs] = useState<Record<string, string>>({});

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
    const pct = Number(newTarget);
    const { data, error } = await supabase.from("teams")
      .insert({ name, npt_target_pct: isFinite(pct) ? pct : 10 })
      .select("id").single();
    if (error) { setMsg("Error: " + error.message); return; }
    const code = newCode.trim().toUpperCase();
    if (code && data) {
      const { error: e2 } = await supabase.from("enrollments").insert({ code, team_id: (data as { id: string }).id });
      if (e2) setMsg("Team created, but code failed: " + e2.message);
    }
    setNewName(""); setNewTarget("10"); setNewCode("");
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
    const code = (codeInputs[teamId] ?? "").trim().toUpperCase();
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

  if (loading) return <div><TableSkeleton rows={3} /></div>;

  return (
    <div>
      {msg && <div style={{ marginBottom: 12, color: msg.startsWith("Error") ? palette.bad : palette.warn, fontSize: 18 }}>{msg}</div>}

      <div style={{ background: palette.panelAlt, border: `1px solid ${palette.border}`, borderRadius: 8, padding: "14px 16px", marginBottom: 20 }}>
        <div className="npt-title" style={{ fontWeight: 700, marginBottom: 10 }}>New team</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Team name"
            style={{ ...input, width: 200 }} />
          <label style={{ fontSize: 18, color: palette.textDim, display: "flex", alignItems: "center", gap: 6 }}>
            Target NPT %
            <input value={newTarget} onChange={(e) => setNewTarget(e.target.value)} type="number" min={0} max={100}
              style={{ ...input, width: 70 }} />
          </label>
          <input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="Enrollment code (optional)"
            style={{ ...input, width: 200, textTransform: "uppercase" }} />
          <button onClick={createTeam} disabled={!newName.trim()} style={btn}>Create team</button>
        </div>
        <div style={{ color: palette.textDim, fontSize: 17, marginTop: 8 }}>
          The enrollment code is what investigators type in STAR Tracker to join this team.
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
                  style={{ ...input, fontWeight: 600, width: 220 }} title="Rename team (saves on blur)" />
                <label style={{ fontSize: 18, color: palette.textDim, display: "flex", alignItems: "center", gap: 6 }}>
                  Target %
                  <input type="number" min={0} max={100} defaultValue={t.npt_target_pct}
                    onBlur={(e) => { const v = Number(e.target.value); if (isFinite(v) && v !== t.npt_target_pct) saveTeam(t, { npt_target_pct: v }); }}
                    style={{ ...input, width: 70 }} />
                </label>
              </div>
              <div style={{ padding: "10px 14px", borderTop: `1px solid ${palette.border}`, background: palette.bg }}>
                <div style={{ fontSize: 17, color: palette.textDim, marginBottom: 8, fontWeight: 600 }}>Enrollment codes</div>
                {tCodes.length === 0 && <div style={{ fontSize: 18, color: palette.textDim, marginBottom: 8 }}>No codes yet.</div>}
                {tCodes.map((c) => (
                  <div key={c.code} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <code style={{ fontSize: 18, fontWeight: 700 }}>{c.code}</code>
                    <span style={{ fontSize: 17, padding: "1px 8px", borderRadius: 6, color: c.active ? palette.ok : palette.textDim, background: c.active ? palette.okBg : palette.panelAlt }}>
                      {c.active ? "active" : "inactive"}
                    </span>
                    <button onClick={() => toggleCode(c)} style={btnGhost}>{c.active ? "Deactivate" : "Activate"}</button>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <input value={codeInputs[t.id] ?? ""} onChange={(e) => setCodeInputs((m) => ({ ...m, [t.id]: e.target.value }))}
                    placeholder="new code" onKeyDown={(e) => { if (e.key === "Enter") addCode(t.id); }}
                    style={{ ...input, width: 180, textTransform: "uppercase" }} />
                  <button onClick={() => addCode(t.id)} disabled={!(codeInputs[t.id] ?? "").trim()} style={btn}>Add code</button>
                </div>
              </div>
            </div>
          );
        })}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "12px 14px", color: palette.textDim, fontSize: 18, border: `1px solid ${palette.border}`, borderRadius: 8 }}>{children}</div>;
}

const input: React.CSSProperties = {
  background: palette.panel, color: palette.text, border: `1px solid ${palette.border}`,
  borderRadius: 8, padding: "8px 10px", fontSize: 19, boxSizing: "border-box",
};
const btn: React.CSSProperties = {
  background: palette.accent, color: "#fff", border: "none", borderRadius: 8,
  padding: "8px 14px", fontSize: 18, cursor: "pointer", fontWeight: 600,
};
const btnGhost: React.CSSProperties = {
  background: palette.panel, color: palette.text, border: `1px solid ${palette.border}`,
  borderRadius: 8, padding: "6px 12px", fontSize: 18, cursor: "pointer",
};
