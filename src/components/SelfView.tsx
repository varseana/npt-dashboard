import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { palette } from "../theme";
import {
  NPT_AUX, computeDay, fmtHms, buildPlanOverrides, statusFor,
  weekInfo, weekLabel, recentWeeks, isoDate,
  type NptDailyRow, type PlannedRow,
} from "../lib/npt";
import { StatusChip } from "./status";
import { InfoStar } from "./InfoStar";
import { BlockSkeleton } from "./skeleton";

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
    for (const r of rows) {
      total += computeDay(r.aux_seconds).nptSeconds;
      for (const a of NPT_AUX) per[a] += r.aux_seconds?.[a] ?? 0;
    }
    return { perAux: per, totalNpt: total };
  }, [rows]);

  const remaining = plannedSec == null ? null : plannedSec - totalNpt;
  const status = statusFor(plannedSec, totalNpt);

  if (loading) return <BlockSkeleton />;

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
        <select value={weekKey} onChange={(e) => setWeekKey(e.target.value)} style={select}>
          {weeks.map((w) => <option key={w.key} value={w.key}>{weekLabel(w)}</option>)}
        </select>
        <span style={{ color: palette.textDim, fontSize: 18 }}>Signed in as {alias}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        <Stat label="Used" value={fmtHms(totalNpt)} story={
          <>The NPT you have logged so far this week / <strong style={hi}>Meeting + Training + Project + Personal + System</strong> / captured automatically by STAR Tracker. Shown in Hh:mm:ss.</>
        } />
        <Stat label="Planned" value={plannedSec == null ? "Not set" : fmtHms(plannedSec)} story={
          <>Your weekly NPT target: your <strong style={hi}>custom allowance</strong> if your manager set one, otherwise your <strong style={hi}>fair share</strong> of the team budget. <strong style={hi}>Not set</strong> means there is no team budget yet.</>
        } />
        <Stat label="Remaining" value={remaining == null ? "-" : fmtHms(remaining)}
          extra={<StatusChip status={status} />} story={
          <><strong style={hi}>Remaining = Planned - Used</strong>. Positive means you still have allowance / negative means you are over. The chip flags On track . Near limit . Over.</>
        } />
      </div>

      <div style={card}>
        <div className="npt-title" style={{ fontWeight: 700, marginBottom: 10, fontSize: 28, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Breakdown<InfoStar>{
            <>How your weekly NPT splits across the activities that count / <strong style={hi}>Meeting, Training, Project, Personal, System</strong>. Everything else / Available, Offline, breaks / does not count as NPT.</>
          }</InfoStar>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 19 }}>
          <tbody>
            {NPT_AUX.map((a) => (
              <tr key={a} style={{ borderBottom: `1px solid ${palette.border}` }}>
                <td style={{ padding: "8px 4px", color: palette.textDim }}>{a}</td>
                <td style={{ padding: "8px 4px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtHms(perAux[a])}</td>
              </tr>
            ))}
            <tr>
              <td style={{ padding: "10px 4px", fontWeight: 700 }}>Total NPT</td>
              <td style={{ padding: "10px 4px", textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtHms(totalNpt)}</td>
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

function Stat({ label, value, extra, story }: { label: string; value: string; extra?: React.ReactNode; story?: React.ReactNode }) {
  return (
    <div style={{ ...card, padding: "16px 18px" }}>
      <div style={{ color: palette.textDim, fontSize: 17, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
        {label}{story && <InfoStar>{story}</InfoStar>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 31, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{value}</span>
        {extra}
      </div>
    </div>
  );
}

const card: React.CSSProperties = {
  background: palette.panel, border: `1px solid ${palette.border}`, borderRadius: 12, padding: 20,
};
const select: React.CSSProperties = {
  background: palette.panel, color: palette.text, border: `1px solid ${palette.border}`,
  borderRadius: 8, padding: "8px 10px", fontSize: 19,
};
