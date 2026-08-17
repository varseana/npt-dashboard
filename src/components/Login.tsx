import * as React from "react";
import { useState } from "react";
import { supabase } from "../lib/supabase";
import { palette } from "../theme";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setMsg(error.message);
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <form onSubmit={signIn} style={{ width: 340, background: palette.panel, border: `1px solid ${palette.border}`, borderRadius: 14, padding: 24 }}>
        <h1 style={{ margin: "0 0 4px", fontSize: 20, color: palette.text }}>STAR NPT Dashboard</h1>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: palette.textDim }}>Manager access. Sign in to continue.</p>
        <label style={label}>Email</label>
        <input style={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label style={label}>Password</label>
        <input style={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button style={submit} disabled={busy} type="submit">{busy ? "Signing in..." : "Sign in"}</button>
        {msg && <div style={{ marginTop: 12, color: palette.over, fontSize: 13 }}>{msg}</div>}
      </form>
    </div>
  );
}

const label: React.CSSProperties = { display: "block", fontSize: 12, color: palette.textDim, margin: "10px 0 4px" };
const input: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", background: palette.bg, color: palette.text,
  border: `1px solid ${palette.border}`, borderRadius: 8, padding: "9px 10px", fontSize: 14,
};
const submit: React.CSSProperties = {
  width: "100%", marginTop: 18, background: palette.accent, color: "#fff", border: "none",
  borderRadius: 8, padding: "10px", fontSize: 14, cursor: "pointer", fontWeight: 600,
};
