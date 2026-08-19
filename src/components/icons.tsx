// iconos SOLID (rellenos), inline, sin dependencias. Estilo flat B&N que combina con el
// blob/favicon; NO son los outline de Lucide. Rellenan con currentColor; los detalles
// (pliegue del sobre, signo de alerta) van en blanco knockout, pensados para botones claros.
import * as React from "react";

type P = { size?: number; style?: React.CSSProperties };

export function IconMail({ size = 16, style }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block", ...style }} aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="3.5" fill="currentColor" />
      <path d="M4 8l8 5 8-5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconAlert({ size = 16, style }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block", ...style }} aria-hidden="true">
      <path d="M12 3l9.5 16.5H2.5L12 3Z" fill="currentColor" />
      <line x1="12" y1="9.5" x2="12" y2="14" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="16.8" r="1.1" fill="#fff" />
    </svg>
  );
}

export function IconLogout({ size = 16, style }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block", ...style }} aria-hidden="true">
      <path d="M4 4h7v2.2H6.2v11.6H11V20H4V4Z" fill="currentColor" />
      <path d="M20.5 12l-4.7-4.2v3H10v2.4h5.8v3L20.5 12Z" fill="currentColor" />
    </svg>
  );
}

export function IconX({ size = 16, style }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2.4} strokeLinecap="round" style={{ display: "block", ...style }} aria-hidden="true">
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  );
}
