import * as React from "react";
import { useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { palette } from "../theme";
import { InfoStar } from "./InfoStar";
import { Dropdown } from "./Dropdown";
import { baseInput, splitAliases } from "./Inputs";
import { IconEye, IconEyeOff } from "./icons";

type Role = "user" | "manager" | "admin";
interface Team { id: string; name: string }
interface Result { username: string; status: string; detail?: string }

// Onboarding directo: el admin crea las cuentas EL MISMO. Pega usernames (sin @amazon.com,
// el sistema lo agrega), define UNA contrasena de batch, elige rol + team y crea. Las cuentas
// nacen confirmadas y aprobadas; la persona entra con esas credenciales y en el primer login
// el sistema la obliga a poner su propia contrasena. Todo el trabajo con la service_role key
// vive en la Edge Function `admin-users` (el frontend no puede crear cuentas de Auth).
export default function CreateUsers({ teams }: { teams: Team[] }) {
  const [bulk, setBulk] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [role, setRole] = useState<Role>("user");
  const [teamId, setTeamId] = useState<string>(teams[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);

  // usernames limpios: soporta que peguen el @amazon.com igual (lo recorta el local-part).
  const usernames = useMemo(() => {
    const seen = new Set<string>(); const out: string[] = [];
    for (const raw of splitAliases(bulk)) {
      const u = raw.includes("@") ? raw.split("@")[0] : raw;
      if (!u || seen.has(u)) continue;
      seen.add(u); out.push(u);
    }
    return out;
  }, [bulk]);

  async function create() {
    setMsg(""); setResults(null);
    if (!usernames.length) { setMsg("Paste at least one username."); return; }
    if (password.length < 6) { setMsg("Batch password must be at least 6 characters."); return; }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("admin-users", {
      body: { action: "create", usernames, password, role, team_id: teamId || null },
    });
    setBusy(false);
    if (error) { setMsg("Error: " + (error.message || "request failed")); return; }
    if (data?.error) { setMsg("Error: " + data.error); return; }
    setResults((data?.results as Result[]) ?? []);
    setBulk("");
  }

  const summary = useMemo(() => {
    if (!results) return null;
    const created = results.filter((r) => r.status === "created").length;
    const exists = results.filter((r) => r.status === "exists").length;
    const errors = results.filter((r) => r.status === "error").length;
    return { created, exists, errors };
  }, [results]);

  const story = (
    <>
      Type <strong style={{ fontWeight: 700, color: palette.text }}>usernames</strong> (the
      <strong style={{ fontWeight: 700, color: palette.text }}> @amazon.com</strong> is added automatically),
      set one batch password (e.g. <em>groupA2025</em>), pick a role and team, and create.
      Accounts are ready to use right away, no email confirmation. On first sign-in each person
      is required to set their own password. To onboard two groups, just run it twice with
      different passwords.
    </>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 27, color: palette.text }}>"Create accounts"</h2>
        <InfoStar>{story}</InfoStar>
      </div>

      <div style={{ background: palette.panel, border: `1px solid ${palette.border}`, borderRadius: 0, padding: 18 }}>
        <label style={label}>Usernames</label>
        <textarea
          value={bulk} onChange={(e) => setBulk(e.target.value)}
          placeholder={"jdoe, msmith\nkwong"}
          rows={4}
          style={{ ...baseInput, width: "100%", boxSizing: "border-box", fontFamily: "inherit", resize: "vertical", minHeight: 90 }}
        />
        <div style={{ fontSize: 14, color: palette.textDim, marginTop: 4 }}>
          {usernames.length
            ? `${usernames.length} username${usernames.length === 1 ? "" : "s"} - will become ${usernames[0]}@amazon.com${usernames.length > 1 ? ", ..." : ""}`
            : "Separate with commas, spaces, or new lines. Do not include @amazon.com (added for you)."}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 14, alignItems: "flex-end" }}>
          <div style={{ minWidth: 240 }}>
            <label style={label}>Batch password</label>
            <div style={{ position: "relative" }}>
              <input
                value={password} onChange={(e) => setPassword(e.target.value)}
                type={showPw ? "text" : "password"} placeholder="e.g. groupA2025"
                style={{ ...baseInput, width: "100%", boxSizing: "border-box", paddingRight: 40 }}
              />
              <button type="button" className="npt-eye" onClick={() => setShowPw((s) => !s)}
                aria-label={showPw ? "Hide password" : "Show password"} title={showPw ? "Hide" : "Show"}
                style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", padding: 2, cursor: "pointer", display: "inline-flex" }}>
                {showPw ? <IconEyeOff size={18} /> : <IconEye size={18} />}
              </button>
            </div>
          </div>
          <div style={{ minWidth: 200 }}>
            <label style={label}>Role</label>
            <Dropdown value={role} onChange={(v) => setRole(v as Role)} minWidth={200} ariaLabel="Role"
              options={[
                { value: "user", label: "User (sees own NPT)" },
                { value: "manager", label: "Manager (sees team)" },
                { value: "admin", label: "Admin (sees all)" },
              ]} />
          </div>
          <div style={{ minWidth: 220 }}>
            <label style={label}>Team</label>
            <Dropdown value={teamId} onChange={setTeamId} minWidth={220} ariaLabel="Team"
              options={[{ value: "", label: "No team" }, ...teams.map((t) => ({ value: t.id, label: t.name }))]} />
          </div>
          <button onClick={create} disabled={busy || !usernames.length || password.length < 6}
            style={{ background: palette.accent, color: palette.accentText, border: "none", borderRadius: 0, padding: "10px 18px", fontSize: 17, fontWeight: 600, cursor: (busy || !usernames.length || password.length < 6) ? "default" : "pointer", opacity: (busy || !usernames.length || password.length < 6) ? 0.5 : 1, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {busy ? "Creating..." : `Create ${usernames.length || ""}`.trim()}
          </button>
        </div>

        {msg && <div style={{ marginTop: 12, color: palette.bad, fontSize: 16 }}>{msg}</div>}
      </div>

      {results && (
        <div style={{ marginTop: 20 }}>
          {summary && (
            <div style={{ fontSize: 17, color: palette.text, marginBottom: 10 }}>
              <strong style={{ color: palette.ok }}>{summary.created} created</strong>
              {summary.exists > 0 && <span style={{ color: palette.textDim }}> · {summary.exists} already existed</span>}
              {summary.errors > 0 && <span style={{ color: palette.bad }}> · {summary.errors} failed</span>}
            </div>
          )}
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Username</th>
                <th style={{ ...th, textAlign: "center" }}>Status</th>
                <th style={th}>Detail</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.username} style={{ borderTop: `1px solid ${palette.border}` }}>
                  <td style={td}>{r.username}</td>
                  <td style={{ ...td, textAlign: "center", color: r.status === "created" ? palette.ok : r.status === "exists" ? palette.warn : palette.bad, fontWeight: 600 }}>
                    {r.status}
                  </td>
                  <td style={{ ...td, color: palette.textDim, fontSize: 15 }}>{r.detail ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const label: React.CSSProperties = {
  display: "block", fontSize: 15, color: palette.textDim, margin: "0 0 6px",
  textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600,
};
const th: React.CSSProperties = {
  textAlign: "left", fontSize: 15, color: palette.textDim, padding: "8px 10px",
  textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600,
  borderBottom: `1px solid ${palette.border}`,
};
const td: React.CSSProperties = { padding: "10px", fontSize: 17, color: palette.text };
