import * as React from "react";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { palette } from "../theme";
import SwirlBackground from "./SwirlBackground";
import { InfoStar } from "./InfoStar";
import { IconMoon, IconSun, IconEye, IconEyeOff } from "./icons";

// solo altas con correo corporativo (el piloto es interno)
const ALLOWED_DOMAIN = "@amazon.com";
// highlight monocromatico dentro del texto del popover (bold en color de texto full)
const hi = { color: palette.text, fontWeight: 700 } as React.CSSProperties;

export default function Login({ dark, onToggleTheme }: { dark: boolean; onToggleTheme: () => void }) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(false);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  // prellena el email guardado en este dispositivo (NO se guarda la contrasena; de eso se encarga
  // el gestor del navegador via autocomplete)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("nptLoginEmail");
      if (saved) { setEmail(saved); setRemember(true); }
    } catch { /* noop */ }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setOk("");
    const mail = email.trim().toLowerCase();

    // remember me: solo el email (nunca la contrasena)
    try {
      if (remember) localStorage.setItem("nptLoginEmail", mail);
      else localStorage.removeItem("nptLoginEmail");
    } catch { /* noop */ }

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

  const nptStory = <>NPT = <strong style={hi}>Non-Productive Time</strong>.</>;

  return (
    <div style={{ position: "relative", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, overflow: "hidden" }}>
      <SwirlBackground dark={dark} />
      <form onSubmit={submit} style={{ position: "relative", zIndex: 1, width: 340, background: palette.panel, border: `1px solid ${palette.border}`, borderRadius: 14, padding: 24 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <h1 style={{ margin: "0 0 4px", fontSize: 31, color: palette.text }}>STAR NPT Dashboard</h1>
          {/* toggle de tema DENTRO de la carta, icono plano sin chrome */}
          <button type="button" onClick={onToggleTheme}
            title={dark ? "Switch to light mode" : "Switch to dark mode"} aria-label="Toggle theme"
            style={{ marginTop: 4, background: "transparent", border: "none", padding: 2, cursor: "pointer", color: palette.textDim, display: "inline-flex", alignItems: "center" }}>
            {dark ? <IconSun size={20} /> : <IconMoon size={20} />}
          </button>
        </div>
        <p style={{ margin: "0 0 20px", fontSize: 18, color: palette.textDim, lineHeight: 1.5 }}>
          {mode === "in" ? (
            <>Tracking your weekly NPT<InfoStar spin={false}>{nptStory}</InfoStar>. Data viewable depends on your role. Having trouble signing in? Contact{" "}
              <a href="https://phonetool.amazon.com/users/varseana" target="_blank" rel="noopener noreferrer" className="npt-storylink"
                style={{ fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 3, color: palette.text }}>@varseana</a>.</>
          ) : (
            <>Request access with your work email. An admin approves it.</>
          )}
        </p>
        <label style={label}>Email</label>
        <input style={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
        <label style={label}>Password</label>
        <div style={{ position: "relative" }}>
          <input style={{ ...input, paddingRight: 42 }} type={showPw ? "text" : "password"} value={password}
            onChange={(e) => setPassword(e.target.value)} required
            autoComplete={mode === "in" ? "current-password" : "new-password"} minLength={6} />
          <button type="button" className="npt-eye" onClick={() => setShowPw((s) => !s)}
            aria-label={showPw ? "Hide password" : "Show password"} title={showPw ? "Hide password" : "Show password"}
            style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", padding: 2, cursor: "pointer", display: "inline-flex" }}>
            {showPw ? <IconEyeOff size={18} /> : <IconEye size={18} />}
          </button>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "14px 0 0", fontSize: 16, color: palette.textDim, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Remember me
        </label>
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
  textTransform: "uppercase", letterSpacing: "0.06em",
};
const linkBtn: React.CSSProperties = {
  background: "none", border: "none", color: palette.accent, cursor: "pointer",
  fontSize: 18, fontWeight: 600, padding: 0, textTransform: "uppercase", letterSpacing: "0.04em",
};
