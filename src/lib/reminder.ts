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
