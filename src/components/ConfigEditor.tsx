import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { palette } from "../theme";
import { discoverAux, type NptDailyRow } from "../lib/npt";

interface Team { id: string; name: string; npt_target_pct: number; }

export default function ConfigEditor({ team }: { team: Team }) {
  const [auxNames, setAuxNames] = useState<string[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: cfg }, { data: rows }] = await Promise.all([
        supabase.from("npt_config").select("excluded_aux").eq("team_id", team.id).maybeSingle(),
        supabase.from("npt_daily").select("alias,tenant,work_date,profile,aux_seconds").eq("team_id", team.id).limit(500),
      ]);
      if (cancelled) return;
      setAuxNames(discoverAux((rows as NptDailyRow[]) ?? []));
      setExcluded(new Set((cfg?.excluded_aux as string[]) ?? []));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [team.id]);

  function toggle(name: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setMsg("");
    const { error } = await supabase
      .from("npt_config")
      .upsert({ team_id: team.id, excluded_aux: Array.from(excluded), updated_at: new Date().toISOString() }, { onConflict: "team_id" });
    setSaving(false);
    setMsg(error ? error.message : "Saved. Rankings recompute automatically.");
  }

  if (loading) return <div style={{ color: palette.textDim }}>Loading...</div>;

  return (
    <div style={{ maxWidth: 520 }}>
      <p style={{ color: palette.textDim, fontSize: 14, lineHeight: 1.6 }}>
        Check any AUX status that should <strong>NOT</strong> count as NPT for {team.name}. Everything
        left unchecked counts as NPT (Available and Offline never count). Changing this recomputes
        history from raw data, no re-collection needed.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, margin: "16px 0" }}>
        {auxNames.map((name) => (
          <label key={name} style={{ display: "flex", alignItems: "center", gap: 8, background: palette.panel, border: `1px solid ${palette.border}`, borderRadius: 8, padding: "8px 10px", cursor: "pointer" }}>
            <input type="checkbox" checked={excluded.has(name)} onChange={() => toggle(name)} />
            <span>{name}</span>
          </label>
        ))}
      </div>
      <button onClick={save} disabled={saving} style={{ background: palette.accent, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 14, cursor: "pointer", fontWeight: 600 }}>
        {saving ? "Saving..." : "Save exclusion list"}
      </button>
      {msg && <div style={{ marginTop: 12, color: palette.accentSoft, fontSize: 13 }}>{msg}</div>}
    </div>
  );
}
