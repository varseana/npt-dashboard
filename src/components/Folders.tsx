import * as React from "react";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { palette } from "../theme";
import { InfoStar } from "./InfoStar";
import { BlockSkeleton } from "./skeleton";

interface Team { id: string; name: string; npt_target_pct: number; }
interface Folder { id: string; name: string; aliases: string[]; }
interface AdminFolder { id: string; name: string; aliases: string[]; owner: string; }
interface ManagerLite { user_id: string; email: string; role: string; approved: boolean; }
// highlight monocromatico dentro del texto del popover (bold en color de texto full)
const hi = { color: palette.text, fontWeight: 700 } as React.CSSProperties;

export default function Folders({ team, isAdmin, myUserId }: { team: Team; isAdmin?: boolean; myUserId?: string }) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [known, setKnown] = useState<string[]>([]);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  // vista admin: folders de otros managers (read-only, colapsable)
  const [allFolders, setAllFolders] = useState<AdminFolder[]>([]);
  const [managers, setManagers] = useState<ManagerLite[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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

    if (isAdmin) {
      // RLS folders_admin_read deja al admin leer TODOS los folders; managers para etiquetar por email
      const [{ data: af }, { data: mg }] = await Promise.all([
        supabase.from("manager_folders").select("id,name,aliases,owner"),
        supabase.from("managers").select("user_id,email,role,approved"),
      ]);
      setAllFolders((af as AdminFolder[]) ?? []);
      setManagers((mg as ManagerLite[]) ?? []);
    }
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [team.id, isAdmin]);

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

  function toggleExpand(uid: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid); else next.add(uid);
      return next;
    });
  }

  if (loading) return <BlockSkeleton />;

  const otherManagers = managers
    .filter((m) => m.user_id !== myUserId && m.approved && (m.role === "manager" || m.role === "admin"))
    .sort((a, b) => a.email.localeCompare(b.email));

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "0 0 16px" }}>
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Folder name (e.g. Project X)"
          onKeyDown={(e) => { if (e.key === "Enter") create(); }} style={{ ...input, width: 280 }} />
        <button onClick={create} disabled={!newName.trim()} style={btn}>Create folder</button>
        <InfoStar spin={false}>{
          <>Private folders to organize <strong style={hi}>your own view</strong> by project. They are <strong style={hi}>yours only</strong> and <strong style={hi}>do not affect any numbers</strong>: they just group employees in Overview when you turn on <strong style={hi}>Group by folder</strong>.</>
        }</InfoStar>
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

      {isAdmin && (
        <div style={{ marginTop: 28 }}>
          <div className="npt-title" style={{ fontWeight: 700, fontSize: 24, marginBottom: 8 }}>
            Other managers' folders<InfoStar spin={false}>{
              <>A read-only peek at the folders other managers made. You <strong style={hi}>cannot create or edit</strong> theirs.</>
            }</InfoStar>
          </div>
          {otherManagers.length === 0 ? (
            <div style={{ color: palette.textDim, fontSize: 18 }}>No other managers yet.</div>
          ) : otherManagers.map((m) => {
            const mf = allFolders.filter((f) => f.owner === m.user_id);
            const open = expanded.has(m.user_id);
            return (
              <div key={m.user_id} style={{ border: `1px solid ${palette.border}`, borderRadius: 8, marginBottom: 8 }}>
                <button onClick={() => toggleExpand(m.user_id)}
                  style={{ width: "100%", textAlign: "left", background: "transparent", border: "none", cursor: "pointer", padding: "10px 12px", color: palette.text, fontSize: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>{open ? "▾" : "▸"} {m.email} <span style={{ color: palette.textDim }}>({mf.length})</span></span>
                </button>
                {open && (
                  <div style={{ padding: "0 12px 12px", fontSize: 17, color: palette.textDim }}>
                    {mf.length === 0 ? (
                      <div>This manager has no folders.</div>
                    ) : (
                      <ul style={{ margin: 0, paddingLeft: 20 }}>
                        {mf.map((f) => <li key={f.id}>{f.name} <span style={{ opacity: 0.7 }}>({f.aliases.length})</span></li>)}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const input: React.CSSProperties = { background: palette.panel, color: palette.text, border: `1px solid ${palette.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 19 };
const btn: React.CSSProperties = { background: palette.accent, color: palette.accentText, border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 18, cursor: "pointer", fontWeight: 600 };
