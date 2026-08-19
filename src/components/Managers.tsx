import * as React from "react";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { palette } from "../theme";
import { TableSkeleton } from "./skeleton";
import { IconAlert } from "./icons";

interface MgrRow {
  user_id: string;
  email: string;
  role: "manager" | "admin";
  team_id: string | null;
  approved: boolean;
  created_at: string;
}
interface Team { id: string; name: string }

// panel de admin: control total del alta de managers. Ve a todos los que se registran
// (pending y activos) y setea rol/team/aprobacion sin tocar SQL. Se refresca en vivo por
// el realtime de App.tsx (refreshKey se bumpea cuando cambia la tabla managers).
export default function Managers({ teams, myUserId, refreshKey }:
  { teams: Team[]; myUserId: string; refreshKey: number }) {
  const [rows, setRows] = useState<MgrRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [confirmAdmin, setConfirmAdmin] = useState<MgrRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<MgrRow | null>(null);

  async function load(showSpinner = false) {
    if (showSpinner) setLoading(true);
    const { data, error } = await supabase
      .from("managers")
      .select("user_id,email,role,team_id,approved,created_at")
      .order("created_at", { ascending: true });
    if (error) setMsg("Error: " + error.message);
    setRows((data as MgrRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(true); /* eslint-disable-next-line */ }, []);
  // refresco en vivo (sin spinner, no parpadea) cuando App detecta cambios en managers
  useEffect(() => { if (refreshKey > 0) load(false); /* eslint-disable-next-line */ }, [refreshKey]);

  async function patch(r: MgrRow, changes: Partial<MgrRow>) {
    setMsg("");
    // update optimista para que se sienta instantaneo; el realtime confirma
    setRows((rs) => rs.map((x) => (x.user_id === r.user_id ? { ...x, ...changes } : x)));
    const { error } = await supabase.from("managers").update(changes).eq("user_id", r.user_id);
    if (error) { setMsg("Error: " + error.message); load(false); }
  }

  async function remove(r: MgrRow) {
    setMsg("");
    setRows((rs) => rs.filter((x) => x.user_id !== r.user_id));
    const { error } = await supabase.from("managers").delete().eq("user_id", r.user_id);
    if (error) { setMsg("Error: " + error.message); load(false); }
  }

  function onRoleChange(r: MgrRow, role: "manager" | "admin") {
    if (role === r.role) return;
    if (role === "admin") { setConfirmAdmin(r); return; }   // dar admin = ve TODA la data
    patch(r, { role });
  }

  const pending = rows.filter((r) => !r.approved);
  const active = rows.filter((r) => r.approved);

  if (loading) return <div style={{ maxWidth: 900 }}><TableSkeleton rows={4} /></div>;

  return (
    <div style={{ maxWidth: 900 }}>
      {msg && <div style={{ marginBottom: 12, color: palette.bad, fontSize: 13 }}>{msg}</div>}

      <Section
        title={`Pending approval (${pending.length})`}
        hint="These people signed up and are waiting for you to approve their access."
        highlight={pending.length > 0}
      >
        {pending.length === 0
          ? <Empty>Nobody is waiting for approval.</Empty>
          : pending.map((r) => (
            <PersonRow key={r.user_id} r={r} teams={teams} isMe={r.user_id === myUserId}
              onRole={onRoleChange} onTeam={(id) => patch(r, { team_id: id || null })}
              onApprove={() => patch(r, { approved: true })}
              onRevoke={() => patch(r, { approved: false })}
              onDelete={() => setConfirmDelete(r)} />
          ))}
      </Section>

      <Section title={`Active (${active.length})`} hint="People with access to the dashboard right now.">
        {active.length === 0
          ? <Empty>No active accounts yet.</Empty>
          : active.map((r) => (
            <PersonRow key={r.user_id} r={r} teams={teams} isMe={r.user_id === myUserId}
              onRole={onRoleChange} onTeam={(id) => patch(r, { team_id: id || null })}
              onApprove={() => patch(r, { approved: true })}
              onRevoke={() => patch(r, { approved: false })}
              onDelete={() => setConfirmDelete(r)} />
          ))}
      </Section>

      {confirmAdmin && (
        <Confirm
          title="Grant admin?"
          body={`${confirmAdmin.email} will be able to see ALL teams and manage every account. Continue?`}
          confirmLabel="Make admin"
          onCancel={() => setConfirmAdmin(null)}
          onConfirm={() => { patch(confirmAdmin, { role: "admin" }); setConfirmAdmin(null); }}
        />
      )}
      {confirmDelete && (
        <Confirm
          title="Remove access?"
          body={`This deletes ${confirmDelete.email} from the dashboard. They lose access immediately. Their sign-in still exists, but they go back to the pending screen if they log in again.`}
          confirmLabel="Remove"
          danger
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => { remove(confirmDelete); setConfirmDelete(null); }}
        />
      )}
    </div>
  );
}

function PersonRow({ r, teams, isMe, onRole, onTeam, onApprove, onRevoke, onDelete }: {
  r: MgrRow; teams: Team[]; isMe: boolean;
  onRole: (r: MgrRow, role: "manager" | "admin") => void;
  onTeam: (id: string) => void; onApprove: () => void; onRevoke: () => void; onDelete: () => void;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 1fr auto", gap: 10, alignItems: "center",
      padding: "12px 14px", borderBottom: `1px solid ${palette.border}` }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>
          {r.email}{isMe && <span style={{ color: palette.textDim, fontWeight: 400 }}> (you)</span>}
        </div>
      </div>

      <select value={r.role} disabled={isMe} title={isMe ? "You can't change your own role" : "Role"}
        onChange={(e) => onRole(r, e.target.value as "manager" | "admin")} style={cell}>
        <option value="manager">Manager</option>
        <option value="admin">Admin</option>
      </select>

      <select value={r.team_id ?? ""} onChange={(e) => onTeam(e.target.value)} style={cell}
        title={r.role === "admin" ? "Admins see all teams regardless" : "Team"}>
        <option value="">{r.role === "admin" ? "All teams" : "No team"}</option>
        {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>

      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        {r.approved
          ? <button onClick={onRevoke} disabled={isMe} style={btnGhost} title={isMe ? "You can't revoke yourself" : "Revoke access"}>Revoke</button>
          : <button onClick={onApprove} style={btn}>Approve</button>}
        <button onClick={onDelete} disabled={isMe} className="npt-btn-remove"
          title={isMe ? "You can't remove yourself" : "Remove"} style={{ padding: "7px 12px", fontSize: 13 }}>
          {r.approved ? "Remove" : "Deny"}
        </button>
      </div>
    </div>
  );
}

function Section({ title, hint, highlight, children }:
  { title: string; hint?: string; highlight?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        {highlight && <span style={{ color: palette.warn, display: "inline-flex" }}><IconAlert size={15} /></span>}
        <span style={{ fontWeight: 700, fontSize: 15 }}>{title}</span>
      </div>
      {hint && <div style={{ color: palette.textDim, fontSize: 13, marginBottom: 8 }}>{hint}</div>}
      <div style={{ border: `1px solid ${highlight ? palette.warn + "55" : palette.border}`, borderRadius: 8,
        overflow: "hidden", background: highlight ? palette.warnBg : palette.panel }}>
        {children}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "12px 14px", color: palette.textDim, fontSize: 13 }}>{children}</div>;
}

function Confirm({ title, body, confirmLabel, danger, onCancel, onConfirm }: {
  title: string; body: string; confirmLabel: string; danger?: boolean;
  onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <div onClick={onCancel}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: palette.panel, border: `1px solid ${palette.border}`, borderRadius: 12, padding: 24, width: 400, maxWidth: "90vw" }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 18, color: palette.text }}>{title}</h2>
        <p style={{ margin: "0 0 20px", color: palette.textDim, fontSize: 14 }}>{body}</p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onCancel} style={btnGhost}>Cancel</button>
          <button onClick={onConfirm} style={{ ...btn, background: danger ? palette.bad : palette.accent }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

const cell: React.CSSProperties = {
  background: palette.panel, color: palette.text, border: `1px solid ${palette.border}`,
  borderRadius: 8, padding: "7px 8px", fontSize: 13, width: "100%", boxSizing: "border-box",
};
const btn: React.CSSProperties = {
  background: palette.accent, color: "#fff", border: "none", borderRadius: 8,
  padding: "7px 14px", fontSize: 13, cursor: "pointer", fontWeight: 600,
};
const btnGhost: React.CSSProperties = {
  background: palette.panel, color: palette.text, border: `1px solid ${palette.border}`,
  borderRadius: 8, padding: "7px 12px", fontSize: 13, cursor: "pointer",
};
