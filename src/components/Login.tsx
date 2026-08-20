import * as React from "react";
import { useState } from "react";
import { supabase } from "../lib/supabase";
import { palette } from "../theme";
import SwirlBackground from "./SwirlBackground";
import { IconMoon, IconSun } from "./icons";

// solo altas con correo corporativo (el piloto es interno)
const ALLOWED_DOMAIN = "@amazon.com";

export default function Login({ dark, onToggleTheme }: { dark: boolean; onToggleTheme: () => void }) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setOk("");
    const mail = email.trim().toLowerCase();

    if (mode === "up" && !mail.endsWith(ALLOWED_DOMAIN)) {
      setMsg(`Use your ${ALLOWED_DOMAIN} email to request access.`);
      return;
    }

    setBusy(true);
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email: mail, password });
      if (error) setMsg(error.message);
    } else {
      const { data, error } = await supabase.auth.signUp({ email: mail, password });
      if (error) {
        setMsg(error.message);
      } else if (!data.session) {
        // "Confirm email" esta ON en Supabase: no hay sesion todavia
        setOk("Account created. Check your email to confirm, then sign in.");
        setMode("in");
      } else {
        // sesion activa: App.tsx crea la fila pending y muestra la pantalla de espera
        setOk("Account created. Waiting for admin approval.");
      }
    }
    setBusy(false);
  }

  return (
    <div style={{ position: "relative", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, overflow: "hidden" }}>
      <SwirlBackground dark={dark} />
      {/* toggle de tema, mismo patron que el dashboard: icono plano, sin chrome de boton */}
      <button onClick={onToggleTheme}
        title={dark ? "Switch to light mode" : "Switch to dark mode"} aria-label="Toggle theme"
        style={{ position: "absolute", top: 20, right: 20, zIndex: 2, background: "transparent",
          border: "none", padding: 2, cursor: "pointer", color: palette.text, display: "inline-flex", alignItems: "center" }}>
        {dark ? <IconSun size={22} /> : <IconMoon size={22} />}
      </button>
      <form onSubmit={submit} style={{ position: "relative", zIndex: 1, width: 340, background: palette.panel, border: `1px solid ${palette.border}`, borderRadius: 14, padding: 24 }}>
        <h1 style={{ margin: "0 0 4px", fontSize: 31, color: palette.text }}>STAR NPT Dashboard</h1>
        <p style={{ margin: "0 0 20px", fontSize: 18, color: palette.textDim }}>
          {mode === "in" ? "Manager access. Sign in to continue." : "Request access with your work email. An admin approves it."}
        </p>
        <label style={label}>Email</label>
        <input style={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        <label style={label}>Password</label>
        <input style={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
          autoComplete={mode === "in" ? "current-password" : "new-password"} minLength={6} />
        <button style={submit_} disabled={busy} type="submit">
          {busy ? "Please wait..." : mode === "in" ? "Sign in" : "Create account"}
        </button>
        {msg && <div style={{ marginTop: 12, color: palette.bad, fontSize: 18 }}>{msg}</div>}
        {ok && <div style={{ marginTop: 12, color: palette.ok, fontSize: 18 }}>{ok}</div>}
        <div style={{ marginTop: 16, textAlign: "center", fontSize: 18, color: palette.textDim }}>
          {mode === "in" ? "Need access? " : "Already have an account? "}
          <button type="button" onClick={() => { setMode(mode === "in" ? "up" : "in"); setMsg(""); setOk(""); }}
            style={linkBtn}>
            {mode === "in" ? "Create account" : "Sign in"}
          </button>
        </div>
      </form>
    </div>
  );
}

const label: React.CSSProperties = { display: "block", fontSize: 17, color: palette.textDim, margin: "10px 0 4px" };
const input: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", background: palette.bg, color: palette.text,
  border: `1px solid ${palette.border}`, borderRadius: 8, padding: "9px 10px", fontSize: 19,
};
const submit_: React.CSSProperties = {
  width: "100%", marginTop: 18, background: palette.accent, color: palette.accentText, border: "none",
  borderRadius: 8, padding: "10px", fontSize: 19, cursor: "pointer", fontWeight: 600,
};
const linkBtn: React.CSSProperties = {
  background: "none", border: "none", color: palette.accent, cursor: "pointer",
  fontSize: 18, fontWeight: 600, padding: 0,
};
