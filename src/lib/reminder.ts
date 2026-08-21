// genera un archivo .eml (RFC822) descargable con el resumen de NPT de una persona.
// se abre en Outlook como borrador listo para enviar (X-Unsent: 1). No manda nada solo:
// un dashboard estatico no puede enviar correo, el manager lo abre y lo envia.
import { fmtHms, type NptStatus } from "./npt";

export interface ReminderData {
  alias: string;
  weekNum: number;
  weekRange: string;     // ej. "Dom 17 Ago - Sab 23 Ago"
  status: NptStatus;
  actual: number;        // segundos NPT actuales
  planned: number;       // segundos planned
  remaining: number;     // planned - actual (negativo = sobre el limite)
}

function bodyFor(d: ReminderData): string {
  let statusLine: string;
  let advice: string;
  if (d.status === "bad") {
    statusLine = `Estas ${fmtHms(-d.remaining)} POR ENCIMA de tu planned.`;
    advice = "Por favor evita NPT no esencial el resto de la semana. Si hubo algo que lo justifique, coordinalo con tu manager.";
  } else if (d.status === "warn") {
    statusLine = `Te queda ${fmtHms(d.remaining)} de margen antes de tu limite.`;
    advice = "Estas cerca del limite. Trata de evitar NPT no esencial el resto de la semana.";
  } else {
    statusLine = `Te queda ${fmtHms(d.remaining)} de margen. Estas dentro de tu planned.`;
    advice = "Vas bien, segui asi.";
  }
  return [
    `Hola ${d.alias},`,
    "",
    `Este es un resumen de tu NPT de la semana (Week ${d.weekNum}, ${d.weekRange}) a la fecha:`,
    "",
    `- NPT actual: ${fmtHms(d.actual)}`,
    `- Planned:    ${fmtHms(d.planned)}`,
    `- ${statusLine}`,
    "",
    advice,
    "",
    "Saludos.",
  ].join("\r\n");
}

export function buildReminderEml(d: ReminderData): string {
  const headers = [
    `To: ${d.alias}@amazon.com`,
    `Subject: Recordatorio NPT - Week ${d.weekNum}`,
    "X-Unsent: 1",
    "Content-Type: text/plain; charset=utf-8",
    "",
  ];
  return headers.join("\r\n") + bodyFor(d);
}

export function downloadEml(d: ReminderData): void {
  const content = buildReminderEml(d);
  const blob = new Blob([content], { type: "message/rfc822" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `npt-reminder_${d.alias}_week${d.weekNum}.eml`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---- correo de visibilidad para TODO el equipo ----
// un .eml separado por persona (To: alias@amazon.com), todos con el MISMO mensaje neutro y
// corporativo sobre el NPT del EQUIPO (presupuesto compartido, cuanto queda). No lleva numeros
// individuales, asi nadie queda expuesto ("sin tirar a nadie bajo el tren"). Incluye el link al
// dashboard para que quien ya tenga cuenta y permiso revise su propio detalle.
export interface TeamReminderData {
  alias: string;         // destinatario
  weekNum: number;
  weekRange: string;     // ej. "Dom 17 Ago - Sab 23 Ago"
  budget: number;        // presupuesto total del team (seg)
  used: number;          // consumido por todo el team (seg)
  remaining: number;     // budget - used (negativo = el team se paso)
  dashboardUrl: string;  // link al dashboard personal
}

function teamBody(d: TeamReminderData): string {
  const over = d.remaining < 0;
  const marginLine = over
    ? `- El equipo ya supero el presupuesto de la semana por ${fmtHms(-d.remaining)}.`
    : `- Disponible para el resto de la semana: ${fmtHms(d.remaining)}.`;
  const ask = over
    ? "Como el presupuesto es compartido por todo el equipo, agradecemos limitar el NPT no esencial durante lo que queda de la semana para volver a encuadrarnos."
    : "Como el presupuesto es compartido por todo el equipo, les pedimos tener en cuenta el margen restante al planificar NPT no esencial en los proximos dias, para que entre todos no lo excedamos.";
  return [
    `Hola ${d.alias},`,
    "",
    `Comparto un resumen del NPT del equipo para esta semana (Week ${d.weekNum}, ${d.weekRange}), para visibilidad de todos:`,
    "",
    `- Presupuesto del equipo: ${fmtHms(d.budget)}`,
    `- Consumido hasta ahora:  ${fmtHms(d.used)}`,
    marginLine,
    "",
    ask,
    "",
    `Si ya tenes tu cuenta y acceso al dashboard, podes revisar tu propio detalle de NPT aca: ${d.dashboardUrl}`,
    "",
    "Gracias por el apoyo.",
    "Saludos.",
  ].join("\r\n");
}

export function buildTeamEml(d: TeamReminderData): string {
  const headers = [
    `To: ${d.alias}@amazon.com`,
    `Subject: NPT del equipo - Week ${d.weekNum}`,
    "X-Unsent: 1",
    "Content-Type: text/plain; charset=utf-8",
    "",
  ];
  return headers.join("\r\n") + teamBody(d);
}

export function downloadTeamEml(d: TeamReminderData): void {
  const content = buildTeamEml(d);
  const blob = new Blob([content], { type: "message/rfc822" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `npt-team_${d.alias}_week${d.weekNum}.eml`;
  a.click();
  URL.revokeObjectURL(url);
}
