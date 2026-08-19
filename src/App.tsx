import * as React from "react";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { palette } from "./theme";
import Login from "./components/Login";
import Overview from "./components/Overview";
import Distribution from "./components/Distribution";
import Employees from "./components/Employees";
import Planned from "./components/Planned";
import Folders from "./components/Folders";
import Clock from "./components/Clock";
import Org from "./components/Org";
import Requests from "./components/Requests";
import { IconLogout } from "./components/icons";
import Mascot from "./components/Mascot";

interface ManagerRow {
  user_id: string;
  email: string;
  role: "manager" | "admin";
  team_id: string | null;
  approved: boolean;
}

interface Team {
  id: string;
  name: string;
  npt_target_pct: number;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [manager, setManager] = useState<ManagerRow | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState<string>("");
  // nav de 2 niveles (progressive disclosure): 3 secciones arriba, sub-nav adentro
  const [section, setSection] = useState<"dashboard" | "team" | "access">("dashboard");
  const [dashView, setDashView] = useState<"summary" | "breakdown">("summary");
  const [teamTab, setTeamTab] = useState<"employees" | "planned" | "folders">("employees");
  const [accessTab, setAccessTab] = useState<"requests" | "org">("requests");
  const [askLogout, setAskLogout] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  // auto-refresco: cada 15s bumpea el tick y las vistas re-consultan (sin recargar la pagina)
  useEffect(() => {
    const id = setInterval(() => setRefreshTick((t) => t + 1), 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setManager(null);
      return;
    }
    (async () => {
      const { data: m } = await supabase
        .from("managers")
        .select("user_id,email,role,team_id,approved")
        .eq("user_id", session.user.id)
        .maybeSingle();
      setManager((m as ManagerRow) ?? null);
      const { data: t } = await supabase.from("teams").select("id,name,npt_target_pct");
      const tt = (t as Team[]) ?? [];
      setTeams(tt);
      if (tt.length) setTeamId((m as ManagerRow)?.team_id ?? tt[0].id);
    })();
  }, [session]);

  if (loading) return <Centered>Loading...</Centered>;
  if (!session) return <Login />;
  if (!manager || !manager.approved) {
    return (
      <Centered>
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <h2 style={{ color: palette.accentSoft }}>Access pending approval</h2>
          <p style={{ color: palette.textDim }}>
            Your account is signed in but not yet approved for the dashboard. The administrator
            grants access. Contact Sean V. (varseana) if you need access.
          </p>
          <button style={btn} onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </Centered>
    );
  }

  const team = teams.find((t) => t.id === teamId) ?? null;

  return (
    <div style={{ maxWidth: "min(1500px, 95vw)", margin: "0 auto", padding: "24px 28px" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, color: palette.text }}>STAR NPT Dashboard</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: palette.textDim, fontSize: 13 }}>{manager.email} ({manager.role})</span>
            <button onClick={() => setAskLogout(true)} title="Log out" aria-label="Log out" className="npt-logout">
              <IconLogout size={15} />
            </button>
          </div>
        </div>
        <Clock />
      </header>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        {teams.length > 1 && (
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)} style={select}>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
        <nav style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <TabBtn active={section === "dashboard"} onClick={() => setSection("dashboard")}>Dashboard</TabBtn>
          <TabBtn active={section === "team"} onClick={() => setSection("team")}>Team</TabBtn>
          <TabBtn active={section === "access"} onClick={() => setSection("access")}>Access</TabBtn>
        </nav>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 18, borderBottom: `1px solid ${palette.border}` }}>
        {section === "dashboard" && (<>
          <SubBtn active={dashView === "summary"} onClick={() => setDashView("summary")}>Summary</SubBtn>
          <SubBtn active={dashView === "breakdown"} onClick={() => setDashView("breakdown")}>Breakdown</SubBtn>
        </>)}
        {section === "team" && (<>
          <SubBtn active={teamTab === "employees"} onClick={() => setTeamTab("employees")}>Employees</SubBtn>
          <SubBtn active={teamTab === "planned"} onClick={() => setTeamTab("planned")}>Planned</SubBtn>
          <SubBtn active={teamTab === "folders"} onClick={() => setTeamTab("folders")}>Folders</SubBtn>
        </>)}
        {section === "access" && (<>
          <SubBtn active={accessTab === "requests"} onClick={() => setAccessTab("requests")}>Requests</SubBtn>
          {manager.role === "admin" && <SubBtn active={accessTab === "org"} onClick={() => setAccessTab("org")}>Org</SubBtn>}
        </>)}
      </div>

      {section === "dashboard" && team && dashView === "summary" && <Overview team={team} refreshKey={refreshTick} />}
      {section === "dashboard" && team && dashView === "breakdown" && <Distribution team={team} refreshKey={refreshTick} />}
      {section === "team" && team && teamTab === "employees" && <Employees team={team} refreshKey={refreshTick} />}
      {section === "team" && team && teamTab === "planned" && <Planned team={team} />}
      {section === "team" && team && teamTab === "folders" && <Folders team={team} />}
      {section === "access" && accessTab === "requests" && <Requests role={manager.role} myUserId={manager.user_id} />}
      {section === "access" && accessTab === "org" && manager.role === "admin" && <Org />}

      {askLogout && (
        <ConfirmModal
          title="Log out?"
          body="Are you sure you want to log out?"
          confirmLabel="Log out"
          onCancel={() => setAskLogout(false)}
          onConfirm={() => supabase.auth.signOut()}
        />
      )}

      <Mascot />
    </div>
  );
}

function ConfirmModal({ title, body, confirmLabel, onCancel, onConfirm }:
  { title: string; body: string; confirmLabel: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div onClick={onCancel}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: palette.panel, border: `1px solid ${palette.border}`, borderRadius: 12, padding: 24, width: 380, maxWidth: "90vw", boxShadow: "0 12px 40px rgba(0,0,0,.18)" }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 18, color: palette.text }}>{title}</h2>
        <p style={{ margin: "0 0 20px", color: palette.textDim, fontSize: 14 }}>{body}</p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onCancel} style={btn}>Cancel</button>
          <button onClick={onConfirm} style={{ ...btn, background: palette.bad, color: "#fff", border: "none" }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      {children}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...btn,
        background: active ? palette.accent : palette.panel,
        borderColor: active ? palette.accent : palette.border,
        color: active ? "#fff" : palette.text,
      }}
    >
      {children}
    </button>
  );
}

// sub-nav de segundo nivel: estilo segmentado (texto + subrayado), distinto al nivel 1
function SubBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "transparent",
        border: "none",
        borderBottom: `2px solid ${active ? palette.accent : "transparent"}`,
        color: active ? palette.text : palette.textDim,
        fontWeight: active ? 700 : 500,
        padding: "8px 12px",
        marginBottom: -1,
        cursor: "pointer",
        fontSize: 13,
      }}
    >
      {children}
    </button>
  );
}

const btn: React.CSSProperties = {
  background: palette.panel,
  color: palette.text,
  border: `1px solid ${palette.border}`,
  borderRadius: 8,
  padding: "8px 14px",
  cursor: "pointer",
  fontSize: 14,
};

const select: React.CSSProperties = {
  background: palette.panel,
  color: palette.text,
  border: `1px solid ${palette.border}`,
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 14,
};
