import * as React from "react";
import { useState } from "react";
import { supabase } from "../lib/supabase";
import { palette } from "../theme";
import { IconEye, IconEyeOff } from "./icons";

// Pantalla obligatoria: cuando el admin crea la cuenta (o resetea la contrasena), la
// persona entra con la contrasena de batch y aca DEBE poner la suya propia antes de
// seguir. updateUser cambia la contrasena del usuario logueado (no necesita service_role);
// luego limpiamos el flag via RPC clear_must_set_password y avisamos al App (onDone).
export default function SetPassword({ email, onDone }: { email: string; onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    if (pw.length < 6) { setMsg("Password must be at least 6 characters."); return; }
    if (pw !== pw2) { setMsg("Passwords do not match."); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) { setBusy(false); setMsg(error.message); return; }
    const { error: rErr } = await supabase.rpc("clear_must_set_password");
    setBusy(false);
    if (rErr) { setMsg(rErr.message); return; }
    onDone();
  }

  return (
    <div style={{ height: "100vh", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <form onSubmit={submit} className="npt-card-cut" style={{ width: 360 }}>
        <div className="npt-card-cut-body" style={{ padding: 24 }}>
          <h1 style={{ margin: "0 0 6px", fontSize: 27, color: palette.text }}>Set your password</h1>
          <p style={{ margin: "0 0 18px", fontSize: 17, color: palette.textDim, lineHeight: 1.5 }}>
            Signed in as <strong style={{ color: palette.text }}>{email}</strong>. Choose your own
            password to finish setting up your account.
          </p>

          <label style={label}>New password</label>
          <div style={{ position: "relative" }}>
            <input style={{ ...input, paddingRight: 42 }} type={show ? "text" : "password"} value={pw}
              onChange={(e) => setPw(e.target.value)} required minLength={6} autoComplete="new-password" autoFocus />
            <button type="button" className="npt-eye" onClick={() => setShow((s) => !s)}
              aria-label={show ? "Hide password" : "Show password"} title={show ? "Hide" : "Show"}
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", padding: 2, cursor: "pointer", display: "inline-flex" }}>
              {show ? <IconEyeOff size={18} /> : <IconEye size={18} />}
            </button>
          </div>

          <label style={label}>Confirm password</label>
          <input style={input} type={show ? "text" : "password"} value={pw2}
            onChange={(e) => setPw2(e.target.value)} required minLength={6} autoComplete="new-password" />

          <button type="submit" disabled={busy}
            style={{ width: "100%", marginTop: 18, background: palette.accent, color: palette.accentText, border: "none", borderRadius: 0, padding: "10px", fontSize: 19, cursor: busy ? "default" : "pointer", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", opacity: busy ? 0.6 : 1 }}>
            {busy ? "Saving..." : "Save and continue"}
          </button>

          {msg && <div style={{ marginTop: 12, color: palette.bad, fontSize: 17 }}>{msg}</div>}

          <div style={{ marginTop: 16, textAlign: "center" }}>
            <button type="button" onClick={() => supabase.auth.signOut()}
              style={{ background: "none", border: "none", color: palette.textDim, cursor: "pointer", fontSize: 16, padding: 0 }}>
              Sign out
            </button>
          </div>
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
