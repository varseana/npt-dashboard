import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { palette } from "../theme";

interface Team { id: string; name: string; npt_target_pct: number; }
interface Raw { alias: string; tenant: string | null; profile: string; work_date: string; enrollment_code: string; }
interface Person {
  alias: string;
  tenant: string | null;
  profiles: Set<string>;
  codes: Set<string>;
  days: Set<string>;
  last: string;
}

// lista de todos los que estan reportando (enrolled): derivada de quien subio data.
// el backend no marca "enrolled" por persona (el enrollment es del lado del cliente),
// asi que la fuente de verdad de "quien reporta" son los alias distintos en npt_daily.
export default function Enrolled({ team, refreshKey }: { team: Team; refreshKey?: number }) {
  const [raw, setRaw] = useState<Raw[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const first = useRef(true);   // solo la 1ra carga muestra "Loading..."; el auto-refresco es silencioso

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (first.current) setLoading(true);
      setErr("");
      const { data, error } = await supabase
        .from("npt_daily")
        .select("alias,tenant,profile,work_date,enrollment_code")
        .eq("team_id", team.id);
      if (cancelled) return;
      if (error) setErr(error.message);
      setRaw((data as Raw[]) ?? []);
      first.current = false;
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [team.id, refreshKey]);

  const people = useMemo(() => {
    const m = new Map<string, Person>();
    for (const r of raw) {
      let p = m.get(r.alias);
      if (!p) {
        p = { alias: r.alias, tenant: r.tenant, profiles: new Set(), codes: new Set(), days: new Set(), last: r.work_date };
        m.set(r.alias, p);
      }
      p.profiles.add(r.profile);
      if (r.enrollment_code) p.codes.add(r.enrollment_code);
      p.days.add(r.work_date);
      if (r.work_date > p.last) p.last = r.work_date;
    }
    const out = Array.from(m.values());
    out.sort((a, b) => (a.last < b.last ? 1 : a.last > b.last ? -1 : a.alias.localeCompare(b.alias)));
    return out;
  }, [raw]);

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "baseline" }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{people.length}</div>
        <div style={{ color: palette.textDim, fontSize: 13 }}>currently enrolled (reporting) in {team.name}</div>
      </div>

      {err && <div style={{ color: palette.over, marginBottom: 12 }}>{err}</div>}
      {loading ? (
        <div style={{ color: palette.textDim }}>Loading...</div>
      ) : people.length === 0 ? (
        <div style={{ color: palette.textDim }}>Nobody has reported yet. Enrolled devices show up here after their first upload.</div>
      ) : (
        <div style={{ border: `1px solid ${palette.border}`, borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr>
                {["#", "Investigator", "Profile", "Code", "Days reported", "Last report"].map((h, i) => (
                  <th key={h} style={{ ...th, textAlign: i <= 3 ? "left" : "right" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people.map((p, i) => (
                <tr key={p.alias} style={{ background: i % 2 ? palette.panelAlt : palette.panel }}>
                  <td style={{ ...td, color: palette.textDim }}>{i + 1}</td>
                  <td style={{ ...td, fontWeight: 600 }}>
                    {p.alias}{p.tenant ? <span style={{ color: palette.textDim, fontWeight: 400 }}> ({p.tenant})</span> : null}
                  </td>
                  <td style={td}>{Array.from(p.profiles).join(", ")}</td>
                  <td style={{ ...td, color: palette.textDim }}>{Array.from(p.codes).join(", ")}</td>
                  <td style={{ ...td, textAlign: "right" }}>{p.days.size}</td>
                  <td style={{ ...td, textAlign: "right" }}>{p.last}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = { textAlign: "left", padding: "9px 12px", color: palette.textDim, fontWeight: 600, borderBottom: `1px solid ${palette.border}` };
const td: React.CSSProperties = { textAlign: "left", padding: "9px 12px", borderBottom: `1px solid ${palette.border}` };
