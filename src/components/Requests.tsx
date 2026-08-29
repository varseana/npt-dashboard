import * as React from "react";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { palette } from "../theme";
import { InfoStar } from "./InfoStar";
import { AddButtonInput, splitAliases } from "./Inputs";
import { IconUser } from "./icons";
import { ConfirmDialog } from "./ConfirmDialog";

// highlight monocromatico dentro del texto del popover (bold en color de texto full)
const hi = { color: palette.text, fontWeight: 700 } as React.CSSProperties;

// mensaje cuando el username no existe en la base (no enrolado / sin subir NPT / typo).
// contexto: alguien aparece en la DB recien cuando se enrola en STAR Tracker (opt-in) y sube su
// NPT (o esta en el roster de un team). Si no, no hay a quien pedirle acceso.
const NOT_FOUND_MSG = "No user found with that username. They may not be enrolled in STAR Tracker yet, may not have uploaded any NPT (not logged in), or the username is misspelled.";
// codigos que devuelve request_member_access
const REQ_MSG: Record<string, string> = {
  already: "You already have access to that person.",
  pending: "You already have a pending request for that person.",
  sent_manager: "Request sent to their manager.",
  sent_admin: "That person has no manager yet. Request sent to the admin.",
};

interface AccessRequest {
  id: string;
  requester: string;
  alias: string;
  status: "pending" | "approved" | "denied";
  target_manager: string | null;
  created_at: string;
  decided_at: string | null;
}
// pedidos dirigidos A MI, con el email del solicitante (via RPC requests_to_me, security definer)
interface RichReq { id: string; req_alias: string; requester: string; requester_email: string; created_at: string; }

// Etapa C: pedir acceso a ver el NPT de otra persona (compartir). El manager pide con un
// click; el admin aprueba (crea el vinculo en manager_members) o deniega.
export default function Requests({ role, myUserId }: { role: string; myUserId: string }) {
  const isAdmin = role === "admin";
  const [alias, setAlias] = useState("");
  const [notFound, setNotFound] = useState<string | null>(null);
  const [reqs, setReqs] = useState<AccessRequest[]>([]);
  const [toMe, setToMe] = useState<RichReq[]>([]);   // pedidos hacia mi (con email del solicitante)
  const [managerEmails, setManagerEmails] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [confirmShare, setConfirmShare] = useState<RichReq | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("access_requests")
      .select("id,requester,alias,status,target_manager,created_at,decided_at")
      .order("created_at", { ascending: false });
    setReqs((data as AccessRequest[]) ?? []);
    // pedidos dirigidos a MI como manager destino: aplica a manager Y admin (un admin que tambien
    // maneja un team, ej. alexcamo, recibe pedidos dirigidos a el). requests_to_me es security
    // definer y solo devuelve target_manager = auth.uid(), asi que para un admin puro sale vacio.
    const { data: tm } = await supabase.rpc("requests_to_me");
    setToMe((tm as RichReq[]) ?? []);
    if (isAdmin) {
      const { data: mg } = await supabase.from("managers").select("user_id,email");
      const map: Record<string, string> = {};
      for (const m of (mg as { user_id: string; email: string }[]) ?? []) map[m.user_id] = m.email;
      setManagerEmails(map);
    }
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function submit() {
    // acepta uno o varios usernames (coma / espacio separados); cada uno se valida y rutea server-side.
    const aliases = splitAliases(alias);
    if (!aliases.length) return;
    setMsg(""); setNotFound(null);
    const notFoundList: string[] = [];
    let sent = 0, existing = 0, lastCode = "";
    for (const a of aliases) {
      const { data, error } = await supabase.rpc("request_member_access", { p_alias: a });
      if (error) { setMsg("Error: " + error.message); await load(); return; }
      const code = (data as string) ?? "";
      if (code === "not_found") { notFoundList.push(a); continue; }
      if (code === "sent_manager" || code === "sent_admin") sent++; else existing++;
      lastCode = code;
    }
    if (notFoundList.length) setNotFound(notFoundList.join(", "));
    if (aliases.length === 1 && !notFoundList.length) {
      setMsg(REQ_MSG[lastCode] ?? "Request sent.");
    } else {
      const parts: string[] = [];
      if (sent) parts.push(`${sent} request${sent > 1 ? "s" : ""} sent`);
      if (existing) parts.push(`${existing} already had access or a pending request`);
      if (parts.length) setMsg(parts.join("; ") + ".");
    }
    if (!notFoundList.length) setAlias("");   // deja lo escrito si hubo alguno no encontrado, para corregir
    await load();
  }

  // cancelar un request propio pendiente (lo borra; RLS ar_own permite al requester borrar los suyos)
  async function cancel(r: AccessRequest) {
    setMsg("");
    const { error } = await supabase.from("access_requests").delete().eq("id", r.id);
    if (error) setMsg("Error: " + error.message); else await load();
  }

  async function approve(req: AccessRequest) {
    setMsg("");
    // resolver el team de la persona (para info; el vinculo lo hace visible igual)
    const { data: t } = await supabase.from("npt_daily").select("team_id").eq("alias", req.alias).limit(1).maybeSingle();
    const teamId = (t as { team_id: string } | null)?.team_id ?? null;
    const { error: e1 } = await supabase.from("manager_members")
      .upsert({ manager_owner: req.requester, alias: req.alias, team_id: teamId }, { onConflict: "manager_owner,alias", ignoreDuplicates: true });
    if (e1) { setMsg("Error: " + e1.message); return; }
    const { error: e2 } = await supabase.from("access_requests")
      .update({ status: "approved", decided_by: myUserId, decided_at: new Date().toISOString() }).eq("id", req.id);
    if (e2) setMsg("Error: " + e2.message);
    else await load();
  }

  async function decide(req: AccessRequest, status: "denied") {
    setMsg("");
    const { error } = await supabase.from("access_requests")
      .update({ status, decided_by: myUserId, decided_at: new Date().toISOString() }).eq("id", req.id);
    if (error) setMsg("Error: " + error.message);
    else await load();
  }

  // pedidos dirigidos A MI (soy el manager dueno de esa persona): apruebo/deniego via RPC
  async function approveToMe(id: string) {
    setMsg("");
    const { error } = await supabase.rpc("approve_member_access", { p_request_id: id });
    if (error) setMsg("Error: " + error.message); else await load();
  }
  async function denyToMe(id: string) {
    setMsg("");
    const { error } = await supabase.rpc("deny_member_access", { p_request_id: id });
    if (error) setMsg("Error: " + error.message); else await load();
  }

  const mine = reqs.filter((r) => r.requester === myUserId);
  const pending = reqs.filter((r) => r.status === "pending");

  return (
    <div>
      {/* usa el ancho: izquierda pedir acceso, derecha mis requests (colapsa a 1 col en pantallas chicas) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 18, alignItems: "start", marginBottom: 18 }}>
        <div style={{ background: palette.panelAlt, border: `1px solid ${palette.border}`, borderRadius: 0, padding: "14px 16px" }}>
          <div className="npt-title" style={{ fontWeight: 700, fontSize: 22, marginBottom: 10 }}>
            Request access<InfoStar pages={[
              <>Ask to view another employee's NPT, e.g. someone who is <strong style={hi}>also on your project</strong>. Type their username and send it.</>,
              <>An <strong style={hi}>admin approves or denies</strong> it. Once approved, that person shows up in your team views.</>,
            ]} />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <AddButtonInput value={alias} onChange={(e) => setAlias(e.target.value)} icon={<IconUser size={18} />}
              onSubmit={submit} buttonDisabled={!alias.trim()}
              placeholder="username(s)" title="One or more usernames, comma or space separated"
              aria-label="Request access to usernames" containerStyle={{ flex: 1, minWidth: 0, width: "auto" }} />
          </div>
          {msg && <div style={{ marginTop: 10, color: msg.startsWith("Error") ? palette.bad : palette.ok, fontSize: 18 }}>{msg}</div>}
          {notFound && (
            <div style={{ marginTop: 10, fontSize: 16, display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
              <span>
                <strong>{notFound}</strong>
                <span title={NOT_FOUND_MSG} style={{ color: palette.bad, fontWeight: 800, marginLeft: 3, cursor: "help" }}>*</span>
              </span>
              <span style={{ color: palette.bad }}>{NOT_FOUND_MSG}</span>
            </div>
          )}
        </div>

        <div style={{ paddingTop: 13 }}>
          <div className="npt-title" style={{ fontWeight: 700, fontSize: 22, marginBottom: 10 }}>My requests</div>
          <div style={{ border: `1px solid ${palette.border}`, borderRadius: 0, overflow: "hidden" }}>
            {loading ? <Dim>Loading...</Dim> : mine.length === 0 ? <Dim>No requests yet.</Dim> : mine.map((r) => (
              <Row key={r.id}>
                <span><strong>{r.alias}</strong></span>
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <StatusPill status={r.status} />
                  {r.status === "pending" && <button onClick={() => cancel(r)} style={btnGhost} title="Cancel this request">Cancel</button>}
                </span>
              </Row>
            ))}
          </div>
        </div>
      </div>

      {(role === "manager" || (isAdmin && toMe.length > 0)) && (
        <Section title={`Requests to me (${toMe.length})`}>
          {loading ? <Dim>Loading...</Dim> : toMe.length === 0 ? <Dim>No incoming requests. When another manager asks to see one of your team members, it shows up here.</Dim> : toMe.map((r) => (
            <Row key={r.id}>
              <span><strong>{r.requester_email}</strong> wants access to <strong>{r.req_alias}</strong> (on your team)</span>
              <span style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setConfirmShare(r)} style={btn}>Approve</button>
                <button onClick={() => denyToMe(r.id)} style={btnGhost}>Deny</button>
              </span>
            </Row>
          ))}
        </Section>
      )}

      {confirmShare && (
        <ConfirmDialog
          title="Share this employee?"
          confirmLabel="Share"
          body={<>
            You are about to give <strong style={hi}>{confirmShare.requester_email}</strong> access to{" "}
            <strong style={hi}>{confirmShare.req_alias}</strong>. They will be able to see this person's
            NPT, the target you set for them, and your team's available threshold - until you revoke it. Continue?
          </>}
          onCancel={() => setConfirmShare(null)}
          onConfirm={() => { const id = confirmShare.id; setConfirmShare(null); approveToMe(id); }}
        />
      )}

      {isAdmin && (
        <Section title={`Pending requests (${pending.length})`}>
          {loading ? <Dim>Loading...</Dim> : pending.length === 0 ? <Dim>Nothing pending.</Dim> : pending.map((r) => (
            <Row key={r.id}>
              <span><strong>{managerEmails[r.requester] ?? r.requester.slice(0, 8)}</strong> wants <strong>{r.alias}</strong></span>
              <span style={{ display: "flex", gap: 8 }}>
                <button onClick={() => approve(r)} style={btn}>Approve</button>
                <button onClick={() => decide(r, "denied")} style={btnGhost}>Deny</button>
              </span>
            </Row>
          ))}
        </Section>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: AccessRequest["status"] }) {
  const map = {
    pending: { fg: palette.warn, bg: palette.warnBg, label: "Pending" },
    approved: { fg: palette.ok, bg: palette.okBg, label: "Approved" },
    denied: { fg: palette.bad, bg: palette.badBg, label: "Denied" },
  }[status];
  return <span style={{ fontSize: 17, fontWeight: 600, padding: "2px 10px", borderRadius: 0, color: map.fg, background: map.bg, border: `1px solid color-mix(in srgb, ${map.fg} 28%, transparent)` }}>{map.label}</span>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="npt-title" style={{ fontWeight: 700, fontSize: 28, marginBottom: 8 }}>{title}</div>
      <div style={{ border: `1px solid ${palette.border}`, borderRadius: 0, overflow: "hidden" }}>{children}</div>
    </div>
  );
}
function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderBottom: `1px solid ${palette.border}` }}>{children}</div>;
}
function Dim({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "10px 12px", color: palette.textDim, fontSize: 18 }}>{children}</div>;
}

const btn: React.CSSProperties = { background: palette.accent, color: palette.accentText, border: "none", borderRadius: 0, padding: "8px 14px", fontSize: 18, cursor: "pointer", fontWeight: 600 };
const btnGhost: React.CSSProperties = { background: palette.panel, color: palette.text, border: `1px solid ${palette.border}`, borderRadius: 0, padding: "8px 12px", fontSize: 18, cursor: "pointer" };
