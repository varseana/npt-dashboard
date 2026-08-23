import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { palette } from "../theme";
import { InfoStar } from "./InfoStar";
import { BlockSkeleton } from "./skeleton";
import { IconX, IconFolder, IconTrash } from "./icons";
import { AddInput, AddButtonInput, splitAliases } from "./Inputs";
import { ConfirmDialog } from "./ConfirmDialog";
import { InlineEdit } from "./InlineEdit";

interface Team { id: string; name: string; npt_target_pct: number; }
interface Folder { id: string; name: string; aliases: string[]; }
interface AdminFolder { id: string; name: string; aliases: string[]; owner: string; }
interface ManagerLite { user_id: string; email: string; role: string; approved: boolean; }
// highlight monocromatico dentro del texto del popover (bold en color de texto full)
const hi = { color: palette.text, fontWeight: 700 } as React.CSSProperties;

// codigo de request_member_access -> mensaje legible
const REQ_MSG: Record<string, string> = {
  not_found: "No user found with that username. Check the spelling.",
  already: "You already have access to that person.",
  pending: "You already have a pending request for that person.",
  sent_manager: "Not on your team. Access request sent to their manager.",
  sent_admin: "Not on your team and has no manager yet. Request sent to the admin.",
};

export default function Folders({ team, isAdmin, myUserId }: { team: Team; isAdmin?: boolean; myUserId?: string }) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [known, setKnown] = useState<string[]>([]);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [confirmFolder, setConfirmFolder] = useState<Folder | null>(null);   // folder pendiente de borrado
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

  // renombra un folder (edicion inline). throwea para que InlineEdit muestre el error y reabra.
  async function renameFolder(folder: Folder, name: string) {
    const n = name.trim();
    if (!n) throw new Error("Folder name cannot be empty.");
    if (n === folder.name) return;
    const { error } = await supabase.from("manager_folders").update({ name: n }).eq("id", folder.id);
    if (error) throw new Error(error.message);
    await load();
  }

  // agrega/quita a un miembro del TEAM en el array del folder (optimista)
  async function setFolderAliases(folder: Folder, next: string[]) {
    setFolders((prev) => prev.map((f) => (f.id === folder.id ? { ...f, aliases: next } : f)));
    const { error } = await supabase.from("manager_folders").update({ aliases: next }).eq("id", folder.id);
    if (error) { setMsg("Error: " + error.message); await load(); }
  }
  function removeMember(folder: Folder, alias: string) {
    setFolderAliases(folder, folder.aliases.filter((a) => a !== alias));
  }
  function addTeamMember(folder: Folder, alias: string) {
    if (folder.aliases.includes(alias)) return;
    setFolderAliases(folder, [...folder.aliases, alias]);
  }
  // alias que NO es del team: pide acceso a su manager (server-side resuelve destino y evita typos)
  async function requestExternal(alias: string) {
    setMsg("");
    const { data, error } = await supabase.rpc("request_member_access", { p_alias: alias });
    if (error) { setMsg("Error: " + error.message); return; }
    const code = (data as string) ?? "";
    setMsg(REQ_MSG[code] ?? "Request processed.");
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
      <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "0 0 16px", flexWrap: "wrap" }}>
        <AddButtonInput value={newName} onChange={(e) => setNewName(e.target.value)} icon={<IconFolder size={18} />}
          onSubmit={create} buttonDisabled={!newName.trim()}
          placeholder="FOLDER" aria-label="New folder name" title="Name a new folder (e.g. Project X)"
          containerStyle={{ width: 300 }} />
        <InfoStar spin={false}>{
          <>Private folders to organize <strong style={hi}>your own view</strong> by project. They are <strong style={hi}>yours only</strong> and <strong style={hi}>do not affect any numbers</strong>: they just group employees in Overview when you turn on <strong style={hi}>Group by folder</strong>. Adding someone from <strong style={hi}>another team</strong> sends an access request to their manager.</>
        }</InfoStar>
      </div>

      {msg && <div style={{ marginBottom: 12, color: msg.startsWith("Error") ? palette.bad : palette.ok, fontSize: 18 }}>{msg}</div>}

      {folders.length === 0 ? (
        <div style={{ color: palette.textDim }}>No folders yet. Create one above.</div>
      ) : (
        // grid: 3 columnas fijas, vertical infinito
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14 }}>
          {folders.map((f) => (
            <FolderCard key={f.id} folder={f} teamAliases={known}
              onRemoveMember={(a) => removeMember(f, a)}
              onAddTeamMember={(a) => addTeamMember(f, a)}
              onRequestExternal={requestExternal}
              onRename={(name) => renameFolder(f, name)}
              onDelete={() => setConfirmFolder(f)} />
          ))}
        </div>
      )}

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

      {confirmFolder && (
        <ConfirmDialog title="Delete folder?"
          body={<>This permanently deletes <strong style={hi}>{confirmFolder.name}</strong>. It only affects your own folder view, not anyone's NPT.</>}
          onCancel={() => setConfirmFolder(null)}
          onConfirm={() => { const id = confirmFolder.id; setConfirmFolder(null); remove(id); }} />
      )}
    </div>
  );
}

// ---- una carta de folder: nombre, chips de miembros actuales, y "Add member" con autocomplete ----
function FolderCard({ folder, teamAliases, onRemoveMember, onAddTeamMember, onRequestExternal, onRename, onDelete }: {
  folder: Folder;
  teamAliases: string[];
  onRemoveMember: (alias: string) => void;
  onAddTeamMember: (alias: string) => void;
  onRequestExternal: (alias: string) => void;
  onRename: (name: string) => Promise<void>;
  onDelete: () => void;
}) {
  const [q, setQ] = useState("");
  const [sugg, setSugg] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // autocomplete: busca usernames de la org (RPC), quita los ya presentes en este folder
  useEffect(() => {
    const v = q.trim();
    if (!v) { setSugg([]); return; }
    let cancelled = false;
    const id = window.setTimeout(async () => {
      const { data } = await supabase.rpc("search_aliases", { p_prefix: v });
      if (cancelled) return;
      const rows = ((data as { alias: string }[]) ?? []).map((r) => r.alias);
      setSugg(rows.filter((a) => !folder.aliases.includes(a)).slice(0, 10));
    }, 160);
    return () => { cancelled = true; clearTimeout(id); };
  }, [q, folder.aliases]);

  // cierra el dropdown al clickear afuera
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function addOne(alias: string) {
    const a = alias.trim().toLowerCase();
    if (!a || folder.aliases.includes(a)) return;
    if (teamAliases.includes(a)) onAddTeamMember(a);   // del team: se agrega directo
    else onRequestExternal(a);                          // de otro team: dispara el request
  }
  function pick(alias: string) {
    const a = alias.trim();
    if (!a) return;
    setQ(""); setSugg([]); setOpen(false);
    addOne(a);
  }
  // Enter: si escribiste varios (coma/espacio separados) los agrega en bulk; si es uno solo,
  // usa la sugerencia del autocomplete.
  function submit() {
    const tokens = splitAliases(q);
    if (tokens.length > 1) {
      tokens.forEach(addOne);
      setQ(""); setSugg([]); setOpen(false);
      return;
    }
    pick(sugg[0] ?? q);
  }

  return (
    <div style={{ border: `1px solid ${palette.border}`, borderRadius: 10, padding: "12px 14px", background: palette.panel, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <InlineEdit value={folder.name} onSave={onRename} format={(v) => v.trim()}
            width="100%" align="left" fontSize={20} fontWeight={700}
            placeholder="Folder name" ariaLabel="folder name" />
        </div>
        <button onClick={onDelete} className="npt-ico-act npt-ico-danger" title="Delete folder" aria-label="Delete folder"><IconTrash size={17} /></button>
      </div>

      {/* miembros actuales como chips removibles */}
      {folder.aliases.length === 0 ? (
        <div style={{ color: palette.textDim, fontSize: 16, marginBottom: 10 }}>No members yet.</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {folder.aliases.map((a) => (
            <span key={a} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: palette.panelAlt, border: `1px solid ${palette.border}`, borderRadius: 999, padding: "3px 6px 3px 10px", fontSize: 15 }}>
              {a}
              <button onClick={() => onRemoveMember(a)} aria-label={`Remove ${a}`} title="Remove"
                style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "inline-flex", color: palette.textDim, lineHeight: 0 }}>
                <IconX size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* add member con autocomplete */}
      <div ref={boxRef} style={{ position: "relative", marginTop: "auto" }}>
        <AddInput
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="member(s)"
          title="Add one or more members, comma or space separated"
          aria-label="Add member"
          iconSize={16}
          containerStyle={{ display: "flex", width: "100%" }}
          style={{ width: "100%", fontSize: 16, padding: "6px 9px", paddingLeft: 32 }}
        />
        {open && sugg.length > 0 && (
          <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: palette.panel, border: `1px solid ${palette.border}`, borderRadius: 8, overflow: "hidden", zIndex: 20, maxHeight: 240, overflowY: "auto" }}>
            {sugg.map((a) => {
              const onTeam = teamAliases.includes(a);
              return (
                <button key={a} onClick={() => pick(a)}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", textAlign: "left", background: "transparent", border: "none", borderBottom: `1px solid ${palette.border}`, cursor: "pointer", padding: "7px 10px", color: palette.text, fontSize: 15 }}>
                  <span>{a}</span>
                  {!onTeam && <span style={{ color: palette.textDim, fontSize: 12 }}>other team</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

