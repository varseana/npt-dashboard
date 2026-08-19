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
  const [tab, setTab] = useState<"overview" | "distribution" | "employees" | "planned" | "folders">("overview");
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
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, color: palette.text }}>STAR NPT Dashboard</h1>
          <div style={{ color: palette.textDim, fontSize: 13 }}>{manager.email} ({manager.role})</div>
        </div>
        <button style={btn} onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        {teams.length > 1 && (
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)} style={select}>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
        <nav style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <TabBtn active={tab === "overview"} onClick={() => setTab("overview")}>Overview</TabBtn>
          <TabBtn active={tab === "distribution"} onClick={() => setTab("distribution")}>Distribution</TabBtn>
          <TabBtn active={tab === "employees"} onClick={() => setTab("employees")}>Employees</TabBtn>
          <TabBtn active={tab === "planned"} onClick={() => setTab("planned")}>Planned</TabBtn>
          <TabBtn active={tab === "folders"} onClick={() => setTab("folders")}>Folders</TabBtn>
        </nav>
      </div>

      {team && tab === "overview" && <Overview team={team} refreshKey={refreshTick} />}
      {team && tab === "distribution" && <Distribution team={team} refreshKey={refreshTick} />}
      {team && tab === "employees" && <Employees team={team} refreshKey={refreshTick} />}
      {team && tab === "planned" && <Planned team={team} />}
      {team && tab === "folders" && <Folders team={team} />}
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
