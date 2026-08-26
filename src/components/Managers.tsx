import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { palette } from "../theme";
import { Bar } from "./skeleton";
import { InfoStar } from "./InfoStar";
import { IconAlert, IconTrash, IconKey, IconEye, IconEyeOff } from "./icons";
import { SearchInput } from "./Inputs";
import { Dropdown } from "./Dropdown";

type Role = "standby" | "user" | "manager" | "admin";
interface MgrRow {
  user_id: string;
  email: string;
  role: Role;
  team_id: string | null;
  alias: string | null;
  approved: boolean;
  created_at: string;
}
interface Team { id: string; name: string }

const ROLE_HELP: Record<Role, string> = {
  standby: "No access. Waiting for a role.",
  user: "Sees only their own NPT vs their plan.",
  manager: "Sees their team.",
  admin: "Sees everything and manages accounts.",
};

// sub-tabs por rol: separan a la gente para que 200+ personas no colisionen en una sola lista
const ROLE_ORDER: Role[] = ["standby", "user", "manager", "admin"];
const ROLE_TAB_LABEL: Record<Role, string> = { standby: "Standby", user: "Users", manager: "Managers", admin: "Admins" };
const ROLE_TITLE: Record<Role, string> = {
  standby: '"Standby" // no access',
  user: '"Users"',
  manager: '"Managers"',
  admin: '"Admins"',
};
const ROLE_HINT: Record<Role, string> = {
  standby: "Signed up and waiting for you to assign a role. They see nothing until then.",
  user: "See only their own NPT versus their plan.",
  manager: "See their whole team.",
  admin: "See everything and manage every account.",
};

// alias de Paragon derivado: override manual, o el local-part del email (en Amazon coinciden)
function aliasOf(r: MgrRow): string {
  return (r.alias?.trim() || r.email.split("@")[0] || "").toLowerCase();
}

// panel de admin: control total del alta. Ve a todos los que se registran (standby y activos),
// asigna rol/team, y ve si el alias hace match con data real de NPT. Se refresca en vivo.
export default function Managers({ teams, myUserId, refreshKey }:
  { teams: Team[]; myUserId: string; refreshKey: number }) {
  const [rows, setRows] = useState<MgrRow[]>([]);
  const [knownAliases, setKnownAliases] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [confirmAdmin, setConfirmAdmin] = useState<MgrRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<MgrRow | null>(null);
  const [resetTarget, setResetTarget] = useState<MgrRow | null>(null);
  const [query, setQuery] = useState("");
  const [roleTab, setRoleTab] = useState<Role>("standby");

  async function load(showSpinner = false) {
    if (showSpinner) setLoading(true);
    const [{ data, error }, { data: aliases }] = await Promise.all([
      supabase.from("managers").select("user_id,email,role,team_id,alias,approved,created_at")
        .order("created_at", { ascending: true }),
      supabase.from("npt_daily").select("alias"),
    ]);
    if (error) setMsg("Error: " + error.message);
    setRows((data as MgrRow[]) ?? []);
    const set = new Set<string>();
    for (const a of (aliases as { alias: string }[]) ?? []) set.add(a.alias.toLowerCase());
    setKnownAliases(set);
    setLoading(false);
  }

  useEffect(() => { load(true); /* eslint-disable-next-line */ }, []);
  useEffect(() => { if (refreshKey > 0) load(false); /* eslint-disable-next-line */ }, [refreshKey]);

  async function patch(r: MgrRow, changes: Partial<MgrRow>) {
    setMsg("");
    setRows((rs) => rs.map((x) => (x.user_id === r.user_id ? { ...x, ...changes } : x)));
    const { error } = await supabase.from("managers").update(changes).eq("user_id", r.user_id);
    if (error) { setMsg("Error: " + error.message); load(false); }
  }

  // cambiar rol: approved = tiene algun rol real (no standby). admin pide confirmacion.
  function onRoleChange(r: MgrRow, role: Role) {
    if (role === r.role) return;
    if (role === "admin") { setConfirmAdmin(r); return; }
    patch(r, { role, approved: role !== "standby" });
  }

  async function remove(r: MgrRow) {
    setMsg("");
    setRows((rs) => rs.filter((x) => x.user_id !== r.user_id));
    const { error } = await supabase.rpc("admin_delete_user", { p_uid: r.user_id });
    if (error) { setMsg("Error deleting: " + error.message); load(false); }
  }

  // resetea la contrasena de una cuenta (via Edge Function con service_role) y fuerza que
  // la persona ponga la suya propia en el proximo login (must_set_password lo setea el server).
  async function resetPassword(r: MgrRow, password: string) {
    setMsg("");
    const { data, error } = await supabase.functions.invoke("admin-users", {
      body: { action: "reset_password", user_id: r.user_id, password },
    });
    if (error || data?.error) { setMsg("Error: " + (data?.error || error?.message || "reset failed")); return false; }
    return true;
  }

  // agrupa por rol para las sub-tabs (una lista por rol; no se mezclan)
  const byRole = useMemo(() => {
    const m: Record<Role, MgrRow[]> = { standby: [], user: [], manager: [], admin: [] };
    for (const r of rows) m[r.role].push(r);
    return m;
  }, [rows]);

  // filtro (buscador por email/alias) + orden alfabetico
  const arrange = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (list: MgrRow[]) => {
      const filtered = q ? list.filter((r) => r.email.toLowerCase().includes(q) || aliasOf(r).includes(q)) : list;
      return [...filtered].sort((a, b) => a.email.localeCompare(b.email));
    };
  }, [query]);

  if (loading) return <ManagersSkeleton />;

  const list = arrange(byRole[roleTab]);
  const searching = query.trim().length > 0;
  const warnStandby = byRole.standby.length > 0;

  const rowProps = (r: MgrRow) => ({
    r, teams, isMe: r.user_id === myUserId, matched: knownAliases.has(aliasOf(r)),
    onRole: onRoleChange, onTeam: (id: string) => patch(r, { team_id: id || null }),
    onAlias: (a: string) => patch(r, { alias: a.trim() || null }),
    onDelete: () => setConfirmDelete(r),
    onReset: () => setResetTarget(r),
  });

  return (
    <div>
      {msg && <div style={{ marginBottom: 12, color: palette.bad, fontSize: 18 }}>{msg}</div>}

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <SearchInput value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="email or username" aria-label="Search by email or username"
          containerStyle={{ flex: "1 1 240px", minWidth: 200 }}
          style={{ width: "100%", fontSize: 16, padding: "8px 12px", paddingLeft: 34 }} />
      </div>

      {/* sub-tabs por rol: cada rol su propia lista, para que 200+ personas no se mezclen */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {ROLE_ORDER.map((role) => {
          const n = byRole[role].length;
          const on = roleTab === role;
          const warn = role === "standby" && n > 0;
          return (
            <button key={role} onClick={() => setRoleTab(role)} style={{
              background: on ? palette.accent : palette.panel,
              color: on ? palette.accentText : palette.text,
              border: `1px solid ${on ? palette.accent : warn ? "color-mix(in srgb, var(--warn) 50%, transparent)" : palette.border}`,
              borderRadius: 8, padding: "7px 14px", fontSize: 18, cursor: "pointer", fontWeight: 600,
              display: "inline-flex", alignItems: "center", gap: 8,
            }}>
              {ROLE_TAB_LABEL[role]}
              <span style={{ fontSize: 15, opacity: 0.85, color: on ? palette.accentText : palette.textDim }}>{n}</span>
              {warn && !on && <span style={{ color: palette.warn, display: "inline-flex" }}><IconAlert size={13} /></span>}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <span className="npt-title" style={{ fontWeight: 700, fontSize: 26, textTransform: "uppercase", letterSpacing: "0.06em" }}>{ROLE_TITLE[roleTab]}</span>
        <InfoStar spin={false}>{ROLE_HINT[roleTab]}</InfoStar>
      </div>

      <div style={{ border: `1px solid ${roleTab === "standby" && warnStandby ? "color-mix(in srgb, var(--warn) 40%, transparent)" : palette.border}`, borderRadius: 8, overflow: "hidden", background: roleTab === "standby" && warnStandby ? palette.warnBg : palette.panel }}>
        {list.length === 0
          ? <Empty>{searching ? "No matches." : `No ${ROLE_TAB_LABEL[roleTab].toLowerCase()} yet.`}</Empty>
          : list.map((r) => <PersonRow key={r.user_id} {...rowProps(r)} />)}
      </div>

      {confirmAdmin && (
        <Confirm title="Grant admin?"
          body={`${confirmAdmin.email} will see ALL teams and manage every account. Continue?`}
          confirmLabel="Make admin"
          onCancel={() => setConfirmAdmin(null)}
          onConfirm={() => { patch(confirmAdmin, { role: "admin", approved: true }); setConfirmAdmin(null); }} />
      )}
      {confirmDelete && (
        <Confirm title="Delete account?"
          body={`This permanently deletes ${confirmDelete.email} from the dashboard AND from sign-in. This cannot be undone.`}
          confirmLabel="Delete" danger
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => { remove(confirmDelete); setConfirmDelete(null); }} />
      )}
      {resetTarget && (
        <ResetDialog email={resetTarget.email}
          onCancel={() => setResetTarget(null)}
          onConfirm={async (pw) => { const ok = await resetPassword(resetTarget, pw); if (ok) setResetTarget(null); }} />
      )}
    </div>
  );
}

// dialogo de reset de contrasena: el admin teclea una contrasena temporal para entregarle
// a la persona. En el proximo login el sistema la obliga a poner la suya propia.
function ResetDialog({ email, onCancel, onConfirm }: {
  email: string; onCancel: () => void; onConfirm: (pw: string) => void | Promise<void>;
}) {
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const valid = pw.length >= 6;
  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: palette.panel, border: `1px solid ${palette.border}`, borderRadius: 12, padding: 24, width: 420, maxWidth: "90vw" }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 27, color: palette.text }}>Reset password</h2>
        <p style={{ margin: "0 0 16px", color: palette.textDim, fontSize: 18, lineHeight: 1.5 }}>
          Set a temporary password for <strong style={{ color: palette.text }}>{email}</strong> and give it to them.
          They will be required to set their own password on next sign-in.
        </p>
        <div style={{ position: "relative", marginBottom: 20 }}>
          <input value={pw} onChange={(e) => setPw(e.target.value)} type={show ? "text" : "password"}
            placeholder="temporary password (min 6)" autoFocus
            style={{ width: "100%", boxSizing: "border-box", background: palette.bg, color: palette.text, border: `1px solid ${palette.border}`, borderRadius: 8, padding: "9px 40px 9px 10px", fontSize: 18 }} />
          <button type="button" className="npt-eye" onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide" : "Show"} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", padding: 2, cursor: "pointer", display: "inline-flex" }}>
            {show ? <IconEyeOff size={18} /> : <IconEye size={18} />}
          </button>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onCancel} style={{ background: palette.panel, color: palette.text, border: `1px solid ${palette.border}`, borderRadius: 8, padding: "8px 14px", fontSize: 17, cursor: "pointer" }}>Cancel</button>
          <button disabled={!valid || busy} onClick={async () => { setBusy(true); await onConfirm(pw); setBusy(false); }}
            style={{ background: palette.accent, color: palette.accentText, border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 17, cursor: valid && !busy ? "pointer" : "default", opacity: valid && !busy ? 1 : 0.5, fontWeight: 600 }}>
            {busy ? "Resetting..." : "Reset"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PersonRow({ r, teams, isMe, matched, onRole, onTeam, onAlias, onDelete, onReset }: {
  r: MgrRow; teams: Team[]; isMe: boolean; matched: boolean;
  onRole: (r: MgrRow, role: Role) => void; onTeam: (id: string) => void;
  onAlias: (a: string) => void; onDelete: () => void; onReset: () => void;
}) {
  const showAlias = r.role === "user";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 120px 1fr 1.3fr auto", gap: 10,
      alignItems: "center", padding: "12px 14px", borderBottom: `1px solid ${palette.border}` }}>
      <div style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
        <span style={{ fontWeight: 600 }}>{r.email}</span>
        {isMe && <span style={{ color: palette.textDim, fontWeight: 400 }}> (you)</span>}
      </div>

      <Dropdown fill value={r.role} disabled={isMe} ariaLabel="Role"
        title={isMe ? "You can't change your own role" : ROLE_HELP[r.role]}
        onChange={(v) => onRole(r, v as Role)}
        options={[{ value: "standby", label: "Standby" }, { value: "user", label: "User" }, { value: "manager", label: "Manager" }, { value: "admin", label: "Admin" }]} />

      {r.role === "manager"
        ? (
          <Dropdown fill value={r.team_id ?? ""} onChange={onTeam} title="Team" ariaLabel="Team"
            options={[{ value: "", label: "No team" }, ...teams.map((t) => ({ value: t.id, label: t.name }))]} />
        )
        : <span style={{ fontSize: 17, color: palette.textDim }}>{r.role === "admin" ? "All teams" : "-"}</span>}

      {showAlias
        ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input defaultValue={r.alias ?? ""} placeholder={aliasOf(r)}
              onBlur={(e) => { if ((e.target.value.trim() || null) !== (r.alias ?? null)) onAlias(e.target.value); }}
              style={{ ...cell, flex: 1 }} title="Paragon username (blank = derive from email)" />
            <MatchChip matched={matched} />
          </div>
        )
        : <span />}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
        <button onClick={onReset} className="npt-ico-act"
          title="Reset password" aria-label="Reset password">
          <IconKey size={19} />
        </button>
        <button onClick={onDelete} disabled={isMe} className="npt-ico-act npt-ico-danger"
          title={isMe ? "You can't delete yourself" : "Delete account"} aria-label="Delete account">
          <IconTrash size={19} />
        </button>
      </div>
    </div>
  );
}

// skeleton 1:1: buscador -> 4 tabs de rol -> titulo -> caja de filas (email, role dropdown, team, alias, acciones)
function ManagersSkeleton() {
  return (
    <div>
      <div style={{ marginBottom: 14 }}><Bar w={260} h={42} /></div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {Array.from({ length: 4 }).map((_, i) => <Bar key={i} w={90} h={34} />)}
      </div>
      <Bar w={220} h={24} style={{ marginBottom: 12 }} />
      <div style={{ border: `1px solid ${palette.border}`, borderRadius: 8, overflow: "hidden" }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1.4fr 120px 1fr 1.3fr auto", gap: 12, alignItems: "center", padding: "12px 14px", borderBottom: i < 3 ? `1px solid ${palette.border}` : "none" }}>
            <Bar w={200} h={16} /><Bar w={110} h={38} /><Bar w={120} h={16} /><Bar w={160} h={38} /><Bar w={60} h={20} />
          </div>
        ))}
      </div>
    </div>
  );
}

function MatchChip({ matched }: { matched: boolean }) {
  // solo texto de color, sin pill
  return (
    <span style={{ fontSize: 16, fontWeight: 700, whiteSpace: "nowrap", color: matched ? palette.ok : palette.textDim }}>
      {matched ? "has data" : "no data"}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "12px 14px", color: palette.textDim, fontSize: 18 }}>{children}</div>;
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
        <h2 style={{ margin: "0 0 8px", fontSize: 29, color: palette.text }}>{title}</h2>
        <p style={{ margin: "0 0 20px", color: palette.textDim, fontSize: 19 }}>{body}</p>
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
  borderRadius: 8, padding: "7px 8px", fontSize: 18, width: "100%", boxSizing: "border-box",
};
const btn: React.CSSProperties = {
  background: palette.accent, color: palette.accentText, border: "none", borderRadius: 8,
  padding: "7px 14px", fontSize: 18, cursor: "pointer", fontWeight: 600,
};
const btnGhost: React.CSSProperties = {
  background: palette.panel, color: palette.text, border: `1px solid ${palette.border}`,
  borderRadius: 8, padding: "7px 12px", fontSize: 18, cursor: "pointer",
};
