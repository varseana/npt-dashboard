import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { palette } from "../theme";
import {
  NPT_AUX, computeDay, dedupePersonDay, fmtHms, buildPlanOverrides, statusFor,
  weekInfo, weekLabel, recentWeeks, isoDate,
  type NptDailyRow, type PlannedRow,
} from "../lib/npt";
import { StatusChip } from "./status";
import { InfoStar } from "./InfoStar";
import { Dropdown } from "./Dropdown";
import { Bar, BracketFrame } from "./skeleton";

// highlight monocromatico dentro del texto del popover (bold en color de texto full)
const hi = { color: palette.text, fontWeight: 700 } as React.CSSProperties;

// vista del rol 'user': su propio NPT de la semana vs lo que le asigno su manager.
// el alias sale del override (si el admin lo puso) o del email local-part.
export default function SelfView({ email, aliasOverride }: { email: string; aliasOverride: string | null }) {
  const alias = useMemo(
    () => (aliasOverride?.trim() || email.split("@")[0] || "").toLowerCase(),
    [email, aliasOverride],
  );
  const weeks = useMemo(() => recentWeeks(new Date(), 16), []);
  const [weekKey, setWeekKey] = useState(() => weekInfo(new Date()).key);
  const [rows, setRows] = useState<NptDailyRow[]>([]);
  const [plannedSec, setPlannedSec] = useState<number | null>(null);
  const [everReported, setEverReported] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const sel = useMemo(() => weekInfo(new Date(weekKey + "T12:00:00")), [weekKey]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const [{ data: d }, { data: p }, { data: any }] = await Promise.all([
        supabase.from("npt_daily").select("alias,tenant,work_date,profile,aux_seconds")
          .eq("alias", alias).gte("work_date", isoDate(sel.start)).lte("work_date", isoDate(sel.end)),
        supabase.from("npt_planned").select("alias,week_key,planned_seconds"),
        supabase.from("npt_daily").select("work_date").eq("alias", alias).limit(1),
      ]);
      if (!alive) return;
      setRows((d as NptDailyRow[]) ?? []);
      setEverReported(((any as unknown[]) ?? []).length > 0);
      // planned bajo el modelo budget-first: RPC server-side (por RLS el user no ve data del team).
      // fallback a su propio custom si el RPC todavia no se corrio en Supabase.
      const { data: pv, error: pe } = await supabase.rpc("my_planned_seconds", { p_week_key: weekKey });
      if (!alive) return;
      if (!pe && pv != null) setPlannedSec(pv as number);
      else setPlannedSec(buildPlanOverrides((p as PlannedRow[]) ?? [], weekKey).get(alias) ?? null);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [alias, weekKey, sel.start, sel.end]);

  // suma por AUX de NPT en la semana + total
  const { perAux, totalNpt } = useMemo(() => {
    const per: Record<string, number> = {};
    for (const a of NPT_AUX) per[a] = 0;
    let total = 0;
    for (const r of dedupePersonDay(rows)) {
      total += computeDay(r.aux_seconds).nptSeconds;
      for (const a of NPT_AUX) per[a] += r.aux_seconds?.[a] ?? 0;
    }
    return { perAux: per, totalNpt: total };
  }, [rows]);

  const remaining = plannedSec == null ? null : plannedSec - totalNpt;
  const status = statusFor(plannedSec, totalNpt);

  if (loading) return <SelfViewSkeleton />;

  // sin data historica => probablemente no enrolado o typo en el email
  if (everReported === false) {
    return (
      <div style={card}>
        <h2 style={{ margin: "0 0 8px", fontSize: 29 }}>No NPT data for "{alias}"</h2>
        <p style={{ color: palette.textDim, fontSize: 19, margin: 0, lineHeight: 1.5 }}>
          We could not find any reported NPT for the user <strong>{alias}</strong> (derived from
          your email). Make sure you are enrolled in STAR Tracker with your work account and that
          it has uploaded at least once. If your Paragon username is different from your email,
          ask the administrator to set it for you.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <Dropdown value={weekKey} onChange={setWeekKey} minWidth={260} ariaLabel="Select week"
          options={weeks.map((w) => ({ value: w.key, label: weekLabel(w) }))} />
        <span style={{ color: palette.textDim, fontSize: 18 }}>Signed in as {alias}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        <Stat label="Used" value={fmtHms(totalNpt)} story={
          <>The NPT you have logged so far this week / <strong style={hi}>Meeting + Training + Project + Personal + System</strong> / captured automatically by STAR Tracker. Shown in Hh:mm:ss.</>
        } />
        <Stat label="Planned" value={plannedSec == null ? "Not set" : fmtHms(plannedSec)} story={
          <>Your weekly NPT target: your <strong style={hi}>custom allowance</strong> if your manager set one, otherwise your <strong style={hi}>fair share</strong> of the team threshold. <strong style={hi}>Not set</strong> means there is no team threshold yet.</>
        } />
        <Stat label="Remaining" value={remaining == null ? "-" : fmtHms(remaining)}
          extra={<StatusChip status={status} />} story={
          <><strong style={hi}>Remaining = Planned - Used</strong>. Positive means you still have allowance / negative means you are over. The chip flags On track . Near limit . Over.</>
        } />
      </div>

      {/* titulo AFUERA del rectangulo; la tabla va dentro de los 4 marcos esquineros */}
      <div className="npt-title" style={{ fontWeight: 700, marginBottom: 12, fontSize: 28, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        Breakdown<InfoStar>{
          <>How your weekly NPT splits across the activities that count / <strong style={hi}>Meeting, Training, Project, Personal, System</strong>. Everything else / Available, Offline, breaks / does not count as NPT.</>
        }</InfoStar>
      </div>
      <div style={{ position: "relative", padding: "18px 22px" }}>
        <span className="npt-bracket tl" /><span className="npt-bracket tr" /><span className="npt-bracket bl" /><span className="npt-bracket br" />
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 19 }}>
          <tbody>
            {NPT_AUX.map((a) => (
              <tr key={a} style={{ borderBottom: `1px solid ${palette.border}` }}>
                <td style={{ padding: "8px 4px", color: palette.textDim }}>{a}</td>
                <td style={{ padding: "8px 4px", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{fmtHms(perAux[a])}</td>
              </tr>
            ))}
            <tr>
              <td style={{ padding: "10px 4px", fontWeight: 700 }}>Total NPT</td>
              <td style={{ padding: "10px 4px", textAlign: "center", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtHms(totalNpt)}</td>
            </tr>
          </tbody>
        </table>
        {plannedSec == null && (
          <div style={{ marginTop: 12, color: palette.textDim, fontSize: 18 }}>
            Your manager has not set a planned NPT for this week yet.
          </div>
        )}
      </div>
    </div>
  );
}

// skeleton 1:1 de SelfView: dropdown + "signed in as" -> 3 stat cards (Used/Planned/Remaining) ->
// titulo Breakdown -> card de esquinas con 6 filas clave/valor (Meeting..System + Total NPT)
function SelfViewSkeleton() {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Bar w={260} h={42} /><Bar w={160} h={16} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="npt-card-cut"><div className="npt-card-cut-body" style={{ padding: "12px 16px" }}>
            <Bar w={70} h={13} style={{ marginBottom: 10 }} /><Bar w={90} h={30} />
          </div></div>
        ))}
      </div>
      <Bar w={150} h={26} style={{ marginBottom: 12 }} />
      <BracketFrame>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: i < 5 ? "1px solid var(--border)" : "none" }}>
            <Bar w={110} h={16} /><Bar w={90} h={16} />
          </div>
        ))}
      </BracketFrame>
    </div>
  );
}

function Stat({ label, value, extra, story }: { label: string; value: string; extra?: React.ReactNode; story?: React.ReactNode }) {
  return (
    <div className="npt-card-cut">
      <div className="npt-card-cut-body" style={{ padding: "16px 18px" }}>
        <div style={{ color: palette.textDim, fontSize: 17, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
          {label}{story && <InfoStar>{story}</InfoStar>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 31, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{value}</span>
          {extra}
        </div>
      </div>
    </div>
  );
}

const card: React.CSSProperties = {
  background: palette.panel, border: `1px solid ${palette.border}`, borderRadius: 12, padding: 20,
};
