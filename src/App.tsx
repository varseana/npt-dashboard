import * as React from "react";
import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, emailConfirmed } from "./lib/supabase";
import { palette } from "./theme";
import { runThemeToggle } from "./lib/themeTransition";
import Login from "./components/Login";
import Overview from "./components/Overview";
import Distribution from "./components/Distribution";
import SharedWithMe from "./components/SharedWithMe";
import Employees from "./components/Employees";
import Planned from "./components/Planned";
import Folders from "./components/Folders";
import Clock from "./components/Clock";
import { Dropdown } from "./components/Dropdown";
import Org from "./components/Org";
import Requests from "./components/Requests";
import Managers from "./components/Managers";
import Teams from "./components/Teams";
import Unassigned from "./components/Unassigned";
import CreateUsers from "./components/CreateUsers";
import SetPassword from "./components/SetPassword";
import WeekHeatmap from "./components/WeekHeatmap";
import SelfView from "./components/SelfView";
import { weekInfo } from "./lib/npt";
import { IconMoon, IconSun, IconX } from "./components/icons";
import Mascot from "./components/Mascot";
import ProfileMenu from "./components/ProfileMenu";
import PixelText from "./components/PixelText";
import PullReveal from "./components/PullReveal";
import ScrambleText from "./components/ScrambleText";

interface ManagerRow {
  user_id: string;
  email: string;
  role: "standby" | "user" | "manager" | "admin";
  team_id: string | null;
  alias: string | null;
  approved: boolean;
  must_set_password: boolean;
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
  const managerRef = useRef<ManagerRow | null>(null);   // ultimo manager para loadPending (evita closure vieja)
  const pageRef = useRef<HTMLDivElement>(null);          // pagina que baja con el gimmick pull-to-reveal
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState<string>("");
  // nav de 2 niveles (progressive disclosure): 3 secciones arriba, sub-nav adentro
  const [section, setSection] = useState<"dashboard" | "team" | "access">("dashboard");
  const [dashView, setDashView] = useState<"summary" | "breakdown" | "shared" | "self">("summary");
  const [teamTab, setTeamTab] = useState<"employees" | "planned" | "folders">("planned");
  const [accessTab, setAccessTab] = useState<"requests" | "org" | "managers" | "teams" | "unassigned" | "create">("requests");
  // semana del dashboard (compartida por el heatmap + Summary + Breakdown): click en el heatmap la cambia
  const [dashWeekKey, setDashWeekKey] = useState(() => weekInfo(new Date()).key);
  const [askLogout, setAskLogout] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const bumpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // coalesce rafagas de eventos realtime (ej. varias subidas de NPT juntas) en UN solo refetch
  function scheduleBump() {
    if (bumpTimer.current) clearTimeout(bumpTimer.current);
    bumpTimer.current = setTimeout(() => setRefreshTick((t) => t + 1), 1500);
  }
  const [pendingReq, setPendingReq] = useState(0);   // access requests pendientes (badge en Access)
  const [showConfirmed, setShowConfirmed] = useState(emailConfirmed);   // banner al aterrizar del link de confirmacion

  // el banner de "email confirmed" se auto-oculta a los 6s (igual se puede cerrar con la X)
  useEffect(() => {
    if (!showConfirmed) return;
    const t = setTimeout(() => setShowConfirmed(false), 6000);
    return () => clearTimeout(t);
  }, [showConfirmed]);
  // dark mode: el estado inicial ya lo fijo el script anti-flash de index.html (clase 'dark')
  const [dark, setDark] = useState(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark"));

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try { localStorage.setItem("nptTheme", dark ? "dark" : "light"); } catch { /* noop */ }
  }, [dark]);

  // conteo de access_requests pendientes (RLS: admin ve todas, manager solo las suyas)
  async function loadPending() {
    const m = managerRef.current;
    if (!m) { setPendingReq(0); return; }
    // el badge cuenta SOLO lo entrante que requiere tu accion, NUNCA tus propios pedidos salientes:
    // admin -> pedidos en la cola del admin (sin manager destino); manager -> pedidos dirigidos a el.
    let q = supabase.from("access_requests").select("*", { count: "exact", head: true }).eq("status", "pending");
    // admin ve la cola del admin (sin manager destino) MAS los pedidos dirigidos a el como manager;
    // un manager solo ve los dirigidos a el. (admin = superconjunto de manager)
    q = m.role === "admin"
      ? q.or(`target_manager.is.null,target_manager.eq.${m.user_id}`)
      : q.eq("target_manager", m.user_id);
    const { count } = await q;
    setPendingReq(count ?? 0);
  }

  // fallback LENTO (60s): el refresco principal ahora es event-driven via realtime (ver abajo).
  // este interval solo cubre el caso de realtime apagado/perdido, sin martillar Supabase cada 15s.
  useEffect(() => {
    const id = setInterval(() => setRefreshTick((t) => t + 1), 60000);
    return () => { clearInterval(id); if (bumpTimer.current) clearTimeout(bumpTimer.current); };
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      // al ENTRAR o SALIR: cerrar el modal de logout (bug: quedaba abierto al re-loguear) y
      // resetear la nav al default (Dashboard > Summary). NO en TOKEN_REFRESHED para no sacar
      // al usuario de donde esta.
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        setAskLogout(false);
        setSection("dashboard");
        setDashView("summary");
        setTeamTab("planned");
        setAccessTab("requests");
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // carga (o auto-crea) la fila del usuario en managers, mas la lista de teams.
  // si el usuario se logueo pero no tiene fila (recien se registro, o lo crearon a mano
  // en Auth), le creamos una fila PENDING: asi aparece solo en el panel de admin sin
  // que nadie inyecte SQL. La policy mgr_self_signup permite crear solo la fila propia.
  async function loadManager(s: Session) {
    let { data: m } = await supabase
      .from("managers")
      .select("user_id,email,role,team_id,alias,approved,must_set_password")
      .eq("user_id", s.user.id)
      .maybeSingle();

    if (!m) {
      // fallback si el trigger de auth no corrio: crea la fila en standby (sin acceso)
      await supabase.from("managers").upsert(
        { user_id: s.user.id, email: s.user.email ?? "", role: "standby", approved: false },
        { onConflict: "user_id", ignoreDuplicates: true },
      );
      const re = await supabase
        .from("managers")
        .select("user_id,email,role,team_id,alias,approved,must_set_password")
        .eq("user_id", s.user.id)
        .maybeSingle();
      m = re.data;
    }

    managerRef.current = (m as ManagerRow) ?? null;
    setManager((m as ManagerRow) ?? null);
    const { data: t } = await supabase.from("teams").select("id,name,npt_target_pct");
    const tt = (t as Team[]) ?? [];
    setTeams(tt);
    if (tt.length) setTeamId((prev) => prev || (m as ManagerRow)?.team_id || tt[0].id);
    loadPending();
  }

  useEffect(() => {
    if (!session) {
      setManager(null);
      return;
    }
    loadManager(session);
    // realtime: cuando cambia la tabla managers (alguien se registra, o el admin
    // aprueba/edita), recargamos la fila propia (el manager entra al aprobarse, sin
    // refrescar) y bumpeamos el tick para que el panel de Managers se actualice en vivo.
    const ch = supabase
      .channel("managers-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "managers" }, () => {
        loadManager(session);
        setRefreshTick((t) => t + 1);
      })
      // badge de Access en vivo: nueva/cambiada access_request => refrescar el conteo pendiente
      .on("postgres_changes", { event: "*", schema: "public", table: "access_requests" }, () => {
        loadPending();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // realtime sobre las tablas de DATOS del team (scoped por team_id): en vez de re-consultar TODO
  // cada 15s, refrescamos SOLO cuando algo cambia. debounce (scheduleBump) coalesce rafagas.
  // si estas tablas no estan en la publicacion supabase_realtime, no llegan eventos y el interval
  // de 60s de arriba cubre igual (degrada elegante).
  useEffect(() => {
    if (!session || !teamId) return;
    const flt = "team_id=eq." + teamId;
    let ch = supabase.channel("team-data-" + teamId);
    for (const t of ["npt_daily", "npt_planned", "npt_team_budget", "roster", "manager_folders"]) {
      ch = ch.on("postgres_changes", { event: "*", schema: "public", table: t, filter: flt }, scheduleBump);
    }
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, teamId]);

  // fallback: refrescar el conteo pendiente en cada tick (por si el realtime no esta ON)
  useEffect(() => { if (session) loadPending(); /* eslint-disable-next-line */ }, [refreshTick]);

  if (loading) return <Centered>Loading...</Centered>;
  if (!session) return <Login dark={dark} onToggleTheme={() => setDark((d) => !d)} />;
  // cuenta creada por el admin (o con password reseteada): obligar a poner su propia
  // contrasena antes de entrar. El flag lo limpia SetPassword (RPC clear_must_set_password).
  if (manager?.must_set_password) {
    return <SetPassword email={manager.email} onDone={() => loadManager(session)} />;
  }
  // standby = registrado pero sin rol asignado todavia: no ve nada
  if (!manager || manager.role === "standby" || !manager.approved) {
    return (
      <Centered>
        {showConfirmed && <ConfirmedBanner onClose={() => setShowConfirmed(false)} />}
        <div style={{ textAlign: "center", maxWidth: 440 }}>
          <h2 style={{ color: palette.accentSoft }}>Account in standby</h2>
          <p style={{ color: palette.textDim }}>
            Your account is signed in but does not have access yet. An administrator assigns
            your role. Contact Sean V. (varseana) if you need access.
          </p>
          <button style={btn} onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </Centered>
    );
  }

  const isStaff = manager.role === "manager" || manager.role === "admin";
  const team = teams.find((t) => t.id === teamId) ?? null;

  // navegacion disparada desde las cards del dashboard (los hyperlinks de storytelling)
  function goTo(dest: { section: "dashboard" | "team" | "access"; tab?: string }) {
    setSection(dest.section);
    if (dest.section === "dashboard" && dest.tab) setDashView(dest.tab as "summary" | "breakdown" | "shared" | "self");
    if (dest.section === "team" && dest.tab) setTeamTab(dest.tab as "employees" | "planned" | "folders");
    if (dest.section === "access" && dest.tab) setAccessTab(dest.tab as "requests" | "org" | "managers" | "teams" | "unassigned" | "create");
  }

  return (
    <>
    <PullReveal pageRef={pageRef} />
    <div ref={pageRef} style={{ maxWidth: "min(2100px, 97vw)", margin: "0 auto", padding: "24px 32px" }}>
      {showConfirmed && <ConfirmedBanner onClose={() => setShowConfirmed(false)} />}
      {/* separador superior = whitespace (SIN linea visible), igual que el de abajo del header.
          da aire arriba del titulo + reloj para enmarcar la cabecera simetrica. */}
      <div style={{ height: 24 }} />
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 48 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <h1 style={{ margin: 0, color: palette.text, lineHeight: 1.02 }}>
              <span style={{ display: "block" }}><PixelText text="STAR" cols={48} size={297} r={0.41} color={palette.text} /></span>
              <span style={{ display: "block", fontSize: 34 }}><ScrambleText text="Real Time NPT Dashboard" radius={90} scrambleChars="._/:<>*=" /></span>
            </h1>
            <Mascot inline onNavigate={goTo} size={88} />
          </div>
          <ProfileMenu
            email={manager.email}
            role={manager.role}
            onMyNpt={() => goTo({ section: "dashboard", tab: "self" })}
            onLogout={() => setAskLogout(true)}
          />
        </div>
        {/* toggle de tema a la IZQUIERDA del tiempo, centrado con la linea del LCD (24px) */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", height: 24 }}>
            <button onClick={() => runThemeToggle(!dark, () => setDark(!dark))} className="npt-hit"
              title={dark ? "Switch to light mode" : "Switch to dark mode"} aria-label="Toggle theme"
              style={{ background: "transparent", border: "none", padding: 2, cursor: "pointer",
                color: palette.textDim, display: "inline-flex", alignItems: "center" }}>
              {dark ? <IconSun size={19} /> : <IconMoon size={19} />}
            </button>
          </div>
          <Clock />
        </div>
      </header>

      {manager.role === "user" && <SelfView email={manager.email} aliasOverride={manager.alias} />}

      {isStaff && (<>
      {/* nav (izquierda) + heatmap semanal (derecha, SIEMPRE visible para staff, en cualquier pestana);
          separador full-width abajo. columnas con las MISMAS proporciones que la fila de metricas
          (480 / 340) para que el heatmap quede centrado en X sobre el bloque de stats. */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 24,
        flexWrap: "wrap", marginBottom: 18 }}>
        <div style={{ flex: "1 1 480px", minWidth: 0 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        {teams.length > 1 && (
          <Dropdown value={teamId} onChange={setTeamId} minWidth={200} ariaLabel="Select team"
            options={teams.map((t) => ({ value: t.id, label: t.name }))} />
        )}
        <nav style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <TabBtn active={section === "dashboard"} onClick={() => setSection("dashboard")}>Dashboard</TabBtn>
          <TabBtn active={section === "team"} onClick={() => setSection("team")}>Team</TabBtn>
          <TabBtn active={section === "access"} onClick={() => setSection("access")} badge={pendingReq}>Access</TabBtn>
        </nav>
      </div>

      <div style={{ display: "flex", gap: 4, paddingBottom: 10 }}>
        {section === "dashboard" && (<>
          <SubBtn active={dashView === "summary"} onClick={() => setDashView("summary")}>Summary</SubBtn>
          <SubBtn active={dashView === "breakdown"} onClick={() => setDashView("breakdown")}>Breakdown</SubBtn>
          <SubBtn active={dashView === "shared"} onClick={() => setDashView("shared")}>Shared with me</SubBtn>
        </>)}
        {section === "team" && (<>
          <SubBtn active={teamTab === "planned"} onClick={() => setTeamTab("planned")}>Planned</SubBtn>
          <SubBtn active={teamTab === "employees"} onClick={() => setTeamTab("employees")}>Employees</SubBtn>
          <SubBtn active={teamTab === "folders"} onClick={() => setTeamTab("folders")}>Folders</SubBtn>
        </>)}
        {section === "access" && (<>
          <SubBtn active={accessTab === "requests"} onClick={() => setAccessTab("requests")}>Requests</SubBtn>
          {manager.role === "admin" && <SubBtn active={accessTab === "managers"} onClick={() => setAccessTab("managers")}>Users</SubBtn>}
          {manager.role === "admin" && <SubBtn active={accessTab === "create"} onClick={() => setAccessTab("create")}>Create</SubBtn>}
          {manager.role === "admin" && <SubBtn active={accessTab === "teams"} onClick={() => setAccessTab("teams")}>Teams</SubBtn>}
          {manager.role === "admin" && <SubBtn active={accessTab === "unassigned"} onClick={() => setAccessTab("unassigned")}>Unassigned</SubBtn>}
          {manager.role === "admin" && <SubBtn active={accessTab === "org"} onClick={() => setAccessTab("org")}>Org</SubBtn>}
        </>)}
      </div>
        </div>
        <div style={{ flex: "1 1 340px", display: "flex", justifyContent: "center", paddingBottom: 10 }}>
          <WeekHeatmap teamId={team?.id} weekKey={dashWeekKey}
            onSelectWeek={(k) => { setDashWeekKey(k); setSection("dashboard"); setDashView("summary"); }}
            refreshKey={refreshTick} />
        </div>
      </div>

      {section === "dashboard" && team && dashView === "summary" && <Overview team={team} refreshKey={refreshTick} onNavigate={goTo} weekKey={dashWeekKey} onWeekChange={setDashWeekKey} />}
      {section === "dashboard" && team && dashView === "breakdown" && <Distribution team={team} refreshKey={refreshTick} weekKey={dashWeekKey} onWeekChange={setDashWeekKey} />}
      {section === "dashboard" && dashView === "self" && <SelfView email={manager.email} aliasOverride={manager.alias} />}
      {section === "dashboard" && dashView === "shared" && <SharedWithMe myUserId={manager.user_id} />}
      {section === "team" && team && teamTab === "employees" && <Employees team={team} refreshKey={refreshTick} />}
      {section === "team" && team && teamTab === "planned" && <Planned team={team} />}
      {section === "team" && team && teamTab === "folders" && <Folders team={team} isAdmin={manager.role === "admin"} myUserId={manager.user_id} />}
      {section === "access" && accessTab === "requests" && <Requests role={manager.role} myUserId={manager.user_id} />}
      {section === "access" && accessTab === "managers" && manager.role === "admin" &&
        <Managers teams={teams} myUserId={manager.user_id} refreshKey={refreshTick} />}
      {section === "access" && accessTab === "create" && manager.role === "admin" &&
        <CreateUsers teams={teams} />}
      {section === "access" && accessTab === "teams" && manager.role === "admin" &&
        <Teams refreshKey={refreshTick} />}
      {section === "access" && accessTab === "unassigned" && manager.role === "admin" &&
        <Unassigned teams={teams} refreshKey={refreshTick} />}
      {section === "access" && accessTab === "org" && manager.role === "admin" && <Org />}
      </>)}

      {askLogout && (
        <ConfirmModal
          title="Log out?"
          body="Are you sure you want to log out?"
          confirmLabel="Log out"
          onCancel={() => setAskLogout(false)}
          onConfirm={() => supabase.auth.signOut()}
        />
      )}

    </div>
    </>
  );
}

function ConfirmModal({ title, body, confirmLabel, onCancel, onConfirm }:
  { title: string; body: string; confirmLabel: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div onClick={onCancel}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: palette.panel, border: `1px solid ${palette.border}`, borderRadius: 0, padding: 24, width: 380, maxWidth: "90vw", boxShadow: "0 12px 40px rgba(0,0,0,.18)" }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 29, color: palette.text }}>{title}</h2>
        <p style={{ margin: "0 0 20px", color: palette.textDim, fontSize: 19 }}>{body}</p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onCancel} style={btn}>Cancel</button>
          <button onClick={onConfirm} style={{ ...btn, background: palette.bad, color: "#fff", border: "none" }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// banner que se muestra al aterrizar desde el link de confirmacion de email (Site URL apunta al
// dashboard). supabase-js ya establecio la sesion leyendo el token de la URL.
function ConfirmedBanner({ onClose }: { onClose: () => void }) {
  return (
    <div style={{ position: "fixed", top: 14, left: "50%", transform: "translateX(-50%)", zIndex: 80,
      background: palette.panel, border: `2px solid ${palette.text}`, borderRadius: 0, padding: "10px 14px",
      display: "flex", alignItems: "center", gap: 12, maxWidth: "92vw" }}>
      <span style={{ fontSize: 18, color: palette.text }}>Email confirmed. You are signed in.</span>
      <button className="npt-close" onClick={onClose} aria-label="Dismiss" title="Dismiss"
        style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2, display: "inline-flex", lineHeight: 0 }}>
        <IconX size={14} />
      </button>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      {children}
    </div>
  );
}

function TabBtn({ active, onClick, badge, children }:
  { active: boolean; onClick: () => void; badge?: number; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="npt-tab">
      {/* el chaflan vive en el inner; el activo se envuelve en ::palabra:: como marca de seleccion */}
      <span className={active ? "npt-tab-inner npt-tab-active" : "npt-tab-inner npt-tab-idle"}>
        {active ? <>::{children}::</> : children}
      </span>
      {badge != null && badge > 0 && (
        // burbuja cyan de notificacion: REDONDA, pegada a la esquina superior derecha del boton.
        // tope 99+ (no crece mas alla). circulo perfecto para 1-2 digitos; pildora redonda para "99+".
        <span style={{
          position: "absolute", top: -9, right: -9, minWidth: 22, height: 22, padding: "0 6px",
          boxSizing: "border-box", borderRadius: 999, background: "#06b6d4", color: "#fff",
          fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums",
          display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
          border: `2px solid ${palette.bg}`, boxShadow: "none",
        }}>{badge > 99 ? "99+" : badge}</span>
      )}
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
        fontSize: 18,
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
  borderRadius: 0,
  padding: "8px 14px",
  cursor: "pointer",
  fontSize: 19,
};
