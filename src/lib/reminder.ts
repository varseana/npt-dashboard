// genera archivos .eml (RFC822) descargables, listos para enviar como borrador en Outlook
// (X-Unsent: 1). Un dashboard estatico no puede enviar correo: el manager lo abre y lo envia.
// Los correos son HTML (text/html) en ingles, neutrales y corporativos, con negritas en las
// etiquetas y "chips" de color (verde / ambar / rojo) en las cifras clave para lectura rapida.
import { fmtHms, type NptStatus } from "./npt";

// ---- helpers de formato HTML ----
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// chip de color: fondo tenue + texto de color + bold. inline styles (los clientes de correo
// no respetan <style> ni clases de forma fiable).
function chip(text: string, kind: "ok" | "warn" | "bad" | "neutral"): string {
  const c = {
    ok: { fg: "#1a7f37", bg: "#e6f4ea" },
    warn: { fg: "#9a6700", bg: "#fdf3d8" },
    bad: { fg: "#b42318", bg: "#fbeae8" },
    neutral: { fg: "#111111", bg: "#eeeeec" },
  }[kind];
  return `<span style="background:${c.bg};color:${c.fg};font-weight:700;padding:1px 6px;border-radius:4px;white-space:nowrap;">${text}</span>`;
}

function htmlDoc(inner: string): string {
  return [
    "<!doctype html><html><body style=\"margin:0;padding:0;background:#ffffff;\">",
    "<div style=\"font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#111111;max-width:560px;\">",
    inner,
    "</div></body></html>",
  ].join("");
}

function emlHtml(to: string, subject: string, inner: string): string {
  const headers = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "X-Unsent: 1",
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
  ];
  // los headers y el cuerpo se separan con UNA LINEA EN BLANCO (\r\n\r\n). sin esto, el cuerpo
  // se toma como continuacion de los headers y Outlook muestra el correo VACIO.
  return headers.join("\r\n") + "\r\n\r\n" + htmlDoc(inner);
}

function download(content: string, filename: string): void {
  const blob = new Blob([content], { type: "message/rfc822" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// =============== recordatorio INDIVIDUAL ===============
export interface ReminderData {
  alias: string;
  weekNum: number;
  weekRange: string;     // ej. "Dom 17 Ago - Sab 23 Ago"
  status: NptStatus;
  actual: number;        // segundos NPT actuales
  planned: number;       // segundos planned
  remaining: number;     // planned - actual (negativo = sobre el limite)
}

function reminderInner(d: ReminderData): string {
  let statusLine: string;
  let advice: string;
  if (d.status === "bad") {
    statusLine = `You are ${chip(fmtHms(-d.remaining) + " over", "bad")} your plan.`;
    advice = "Please avoid non-essential NPT for the rest of the week. If something justified it, kindly align with your manager.";
  } else if (d.status === "warn") {
    statusLine = `You have ${chip(fmtHms(d.remaining), "warn")} left before reaching your limit.`;
    advice = "You are close to the limit. Please try to avoid non-essential NPT for the rest of the week.";
  } else {
    statusLine = `You have ${chip(fmtHms(d.remaining), "ok")} of margin left, and you are within your plan.`;
    advice = "You are on track. Thank you.";
  }
  const alias = esc(d.alias);
  return [
    `<p>Hi <b>${alias}</b>,</p>`,
    `<p>Here is your <b>NPT summary</b> for this week (<b>Week ${d.weekNum}</b>, ${esc(d.weekRange)}) to date:</p>`,
    `<ul style="margin:0 0 14px 0;padding-left:20px;">`,
    `<li><b>Current NPT:</b> ${fmtHms(d.actual)}</li>`,
    `<li><b>Planned:</b> ${fmtHms(d.planned)}</li>`,
    `<li>${statusLine}</li>`,
    `</ul>`,
    `<p>${advice}</p>`,
    `<p>Best regards.</p>`,
  ].join("");
}

export function buildReminderEml(d: ReminderData): string {
  return emlHtml(`${d.alias}@amazon.com`, `NPT reminder - Week ${d.weekNum}`, reminderInner(d));
}

export function downloadEml(d: ReminderData): void {
  download(buildReminderEml(d), `npt-reminder_${d.alias}_week${d.weekNum}.eml`);
}

// =============== correo de visibilidad para TODO el equipo ===============
// UN solo .eml con varios destinatarios (To: alias1@amazon.com, alias2@amazon.com, ...). Mensaje
// neutro y corporativo sobre el NPT del EQUIPO (presupuesto compartido, cuanto queda). No lleva
// numeros individuales, asi nadie queda expuesto. Incluye el link al dashboard personal.
export interface TeamReminderData {
  aliases: string[];     // destinatarios (van todos en el To:)
  weekNum: number;
  weekRange: string;
  budget: number;        // presupuesto total del team (seg)
  used: number;          // consumido por todo el team (seg)
  remaining: number;     // budget - used (negativo = el team se paso)
  dashboardUrl: string;
}

function teamInner(d: TeamReminderData): string {
  const over = d.remaining < 0;
  const marginLine = over
    ? `<b>Over threshold by</b> ${chip(fmtHms(-d.remaining), "bad")} for the week.`
    : `<b>Available for the rest of the week:</b> ${chip(fmtHms(d.remaining), "ok")}.`;
  const ask = over
    ? "The threshold is shared across the whole team, so we would appreciate limiting non-essential NPT for the rest of the week to get us back within it."
    : "The threshold is shared across the whole team, so please keep the remaining margin in mind when planning non-essential NPT over the next few days, so that together we stay within it.";
  const url = esc(d.dashboardUrl);
  return [
    `<p>Hi team,</p>`,
    `<p>Here is the <b>team NPT summary</b> for this week (<b>Week ${d.weekNum}</b>, ${esc(d.weekRange)}), for everyone's visibility:</p>`,
    `<ul style="margin:0 0 14px 0;padding-left:20px;">`,
    `<li><b>Team threshold:</b> ${fmtHms(d.budget)}</li>`,
    `<li><b>Used so far:</b> ${fmtHms(d.used)}</li>`,
    `<li>${marginLine}</li>`,
    `</ul>`,
    `<p>${ask}</p>`,
    `<p>If you already have your account and access set up, you can review your own NPT detail here: <a href="${url}" style="color:#0b5fff;">${url}</a></p>`,
    `<p>Thank you for the support.</p>`,
  ].join("");
}

export function buildTeamEml(d: TeamReminderData): string {
  const to = d.aliases.map((a) => `${a}@amazon.com`).join(", ");
  return emlHtml(to, `Team NPT - Week ${d.weekNum}`, teamInner(d));
}

export function downloadTeamEml(d: TeamReminderData): void {
  download(buildTeamEml(d), `npt-team_week${d.weekNum}.eml`);
}
