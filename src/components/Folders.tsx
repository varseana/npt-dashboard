import * as React from "react";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { palette } from "../theme";
import { BlockSkeleton } from "./skeleton";

interface Team { id: string; name: string; npt_target_pct: number; }
interface Folder { id: string; name: string; aliases: string[]; }

export default function Folders({ team }: { team: Team }) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [known, setKnown] = useState<string[]>([]);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  async function load() {
    setLoading(true);
    const [{ data: f }, { data: r }, { data: d }] = await Promise.all([
      supabase.from("manager_folders").select("id,name,aliases").eq("team_id", team.id).order("created_at"),
      supabase.from("roster").select("alias").eq("team_id", team.id),
      supabase.from("npt_daily").select("alias").eq("team_id", team.id),
    ]);
    setFolders((f as Folder[]) ?? []);
    const set = new Set<string>();
    for (const x of (r as { alias: string }[]) ?? []) set.add(x.alias);
    for (const x of (d as { alias: string }[]) ?? []) set.add(x.alias);
    setKnown(Array.from(set).sort());
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [team.id]);

  async function create() {
    const name = newName.trim();
    if (!name) return;
    setMsg("");
    const { error } = await supabase.from("manager_folders").insert({ team_id: team.id, name, aliases: [] });
    if (error) setMsg("Error: " + error.message);
    else { setNewName(""); await load(); }
  }

  async function remove(id: string) {
    setMsg("");
    const { error } = await supabase.from("manager_folders").delete().eq("id", id);
    if (error) setMsg("Error: " + error.message);
    else await load();
  }

  async function toggleMember(folder: Folder, alias: string) {
    const has = folder.aliases.includes(alias);
    const next = has ? folder.aliases.filter((a) => a !== alias) : [...folder.aliases, alias];
    // optimista
    setFolders((prev) => prev.map((f) => (f.id === folder.id ? { ...f, aliases: next } : f)));
    const { error } = await supabase.from("manager_folders").update({ aliases: next }).eq("id", folder.id);
    if (error) { setMsg("Error: " + error.message); await load(); }
  }

  if (loading) return <BlockSkeleton />;

  return (
    <div>
      <p style={{ color: palette.textDim, fontSize: 19, lineHeight: 1.6 }}>
        Private folders to organize your view by project. They are yours only and <strong>do not
        affect any numbers</strong>: they group investigators in Overview when you turn on Group by folder.
      </p>

      <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "16px 0" }}>
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Folder name (e.g. Project X)"
          onKeyDown={(e) => { if (e.key === "Enter") create(); }} style={{ ...input, width: 280 }} />
        <button onClick={create} disabled={!newName.trim()} style={btn}>Create folder</button>
      </div>

      {msg && <div style={{ marginBottom: 12, color: msg.startsWith("Error") ? palette.bad : palette.ok, fontSize: 18 }}>{msg}</div>}

      {folders.length === 0 ? (
        <div style={{ color: palette.textDim }}>No folders yet. Create one above.</div>
      ) : folders.map((f) => (
        <div key={f.id} style={{ border: `1px solid ${palette.border}`, borderRadius: 8, padding: "12px 14px", marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontWeight: 700 }}>{f.name} <span style={{ color: palette.textDim, fontWeight: 400, fontSize: 18 }}>({f.aliases.length})</span></div>
            <button onClick={() => remove(f.id)} className="npt-btn-remove">Delete folder</button>
          </div>
          {known.length === 0 ? (
            <div style={{ color: palette.textDim, fontSize: 18 }}>No one in the team yet (add people in Employees).</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 6 }}>
              {known.map((a) => (
                <label key={a} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 19, cursor: "pointer" }}>
                  <input type="checkbox" checked={f.aliases.includes(a)} onChange={() => toggleMember(f, a)} />
                  <span>{a}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const input: React.CSSProperties = { background: palette.panel, color: palette.text, border: `1px solid ${palette.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 19 };
const btn: React.CSSProperties = { background: palette.accent, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 18, cursor: "pointer", fontWeight: 600 };
