import * as React from "react";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { palette } from "../theme";

interface AccessRequest {
  id: string;
  requester: string;
  alias: string;
  status: "pending" | "approved" | "denied";
  created_at: string;
  decided_at: string | null;
}

// Etapa C: pedir acceso a ver el NPT de otra persona (compartir). El manager pide con un
// click; el admin aprueba (crea el vinculo en manager_members) o deniega.
export default function Requests({ role, myUserId }: { role: string; myUserId: string }) {
  const isAdmin = role === "admin";
  const [alias, setAlias] = useState("");
  const [reqs, setReqs] = useState<AccessRequest[]>([]);
  const [managerEmails, setManagerEmails] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("access_requests")
      .select("id,requester,alias,status,created_at,decided_at")
      .order("created_at", { ascending: false });
    setReqs((data as AccessRequest[]) ?? []);
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
    const a = alias.trim().toLowerCase();
    if (!a) return;
    setMsg("");
    const { error } = await supabase.from("access_requests").insert({ alias: a });
    if (error) setMsg("Error: " + error.message);
    else { setAlias(""); setMsg("Request sent."); await load(); }
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

  const mine = reqs.filter((r) => r.requester === myUserId);
  const pending = reqs.filter((r) => r.status === "pending");

  return (
    <div>
      <div style={{ background: palette.panelAlt, border: `1px solid ${palette.border}`, borderRadius: 8, padding: "14px 16px", marginBottom: 18 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Request access to someone's NPT</div>
        <div style={{ color: palette.textDim, fontSize: 18, marginBottom: 10 }}>
          Ask to view a shared member's NPT (e.g. someone who is also on your project). An admin approves it.
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="username"
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }} style={{ ...input, width: 220 }} />
          <button onClick={submit} disabled={!alias.trim()} style={btn}>Request access</button>
        </div>
        {msg && <div style={{ marginTop: 10, color: msg.startsWith("Error") ? palette.bad : palette.ok, fontSize: 18 }}>{msg}</div>}
      </div>

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

      <Section title="My requests">
        {loading ? <Dim>Loading...</Dim> : mine.length === 0 ? <Dim>No requests yet.</Dim> : mine.map((r) => (
          <Row key={r.id}>
            <span><strong>{r.alias}</strong></span>
            <StatusPill status={r.status} />
          </Row>
        ))}
      </Section>
    </div>
  );
}

function StatusPill({ status }: { status: AccessRequest["status"] }) {
  const map = {
    pending: { fg: palette.warn, bg: palette.warnBg, label: "Pending" },
    approved: { fg: palette.ok, bg: palette.okBg, label: "Approved" },
    denied: { fg: palette.bad, bg: palette.badBg, label: "Denied" },
  }[status];
  return <span style={{ fontSize: 17, fontWeight: 600, padding: "2px 10px", borderRadius: 6, color: map.fg, background: map.bg, border: `1px solid ${map.fg}33` }}>{map.label}</span>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontWeight: 700, fontSize: 21, marginBottom: 8 }}>{title}</div>
      <div style={{ border: `1px solid ${palette.border}`, borderRadius: 8, overflow: "hidden" }}>{children}</div>
    </div>
  );
}
function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderBottom: `1px solid ${palette.border}` }}>{children}</div>;
}
function Dim({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "10px 12px", color: palette.textDim, fontSize: 18 }}>{children}</div>;
}

const input: React.CSSProperties = { background: palette.panel, color: palette.text, border: `1px solid ${palette.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 19 };
const btn: React.CSSProperties = { background: palette.accent, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 18, cursor: "pointer", fontWeight: 600 };
const btnGhost: React.CSSProperties = { background: palette.panel, color: palette.text, border: `1px solid ${palette.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 18, cursor: "pointer" };
