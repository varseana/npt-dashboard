// iconos SOLID (rellenos), inline, sin dependencias. Estilo flat B&N que combina con el
// blob/favicon; NO son los outline de Lucide. La forma rellena con currentColor; los detalles
// (pliegue del sobre, signo de alerta) van en KNOCKOUT del color del panel (var(--panel)) para
// que se vean bien en light Y dark: si fuera #fff fijo, en dark la forma es casi-blanca y el
// detalle blanco desaparece (se ve un cuadrado/triangulo solido).
import * as React from "react";

type P = { size?: number; style?: React.CSSProperties };

export function IconMail({ size = 16, style }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block", ...style }} aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="3.5" fill="currentColor" />
      <path d="M4 8l8 5 8-5" fill="none" stroke="var(--panel)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconAlert({ size = 16, style }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block", ...style }} aria-hidden="true">
      <path d="M12 3l9.5 16.5H2.5L12 3Z" fill="currentColor" />
      <line x1="12" y1="9.5" x2="12" y2="14" stroke="var(--panel)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="16.8" r="1.1" fill="var(--panel)" />
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

// ojo solido para revelar la contrasena: almendra en currentColor, pupila knockout = fondo del tema
export function IconEye({ size = 16, style }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block", ...style }} aria-hidden="true">
      <path d="M12 5C5 5 1.5 11.2 1.5 12S5 19 12 19s10.5-6.2 10.5-7S19 5 12 5Z" fill="currentColor" />
      <circle cx="12" cy="12" r="3.4" fill="var(--bg)" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

// ojo tachado (contrasena oculta): mismo ojo + slash con halo del fondo para que se vea sobre el relleno
export function IconEyeOff({ size = 16, style }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block", ...style }} aria-hidden="true">
      <path d="M12 5C5 5 1.5 11.2 1.5 12S5 19 12 19s10.5-6.2 10.5-7S19 5 12 5Z" fill="currentColor" />
      <circle cx="12" cy="12" r="3.4" fill="var(--bg)" />
      <line x1="4" y1="3.6" x2="20" y2="20.4" stroke="var(--bg)" strokeWidth="4" strokeLinecap="round" />
      <line x1="4" y1="3.6" x2="20" y2="20.4" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
    </svg>
  );
}

// lupa (outline, currentColor -> se adapta a light y dark). va dentro del input de busqueda.
export function IconSearch({ size = 16, style }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2.2} strokeLinecap="round" style={{ display: "block", ...style }} aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" />
    </svg>
  );
}

// mas (outline, currentColor -> se adapta a light y dark). va dentro del input de "agregar".
export function IconPlus({ size = 16, style }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2.4} strokeLinecap="round" style={{ display: "block", ...style }} aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

// folder solido (currentColor). usado como toggle de "group by folder".
export function IconFolder({ size = 16, style }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block", ...style }} aria-hidden="true">
      <path d="M3 6.5C3 5.67 3.67 5 4.5 5h4.1l2 2H19.5c.83 0 1.5.67 1.5 1.5v9c0 .83-.67 1.5-1.5 1.5h-15C3.67 19 3 18.33 3 17.5V6.5Z" fill="currentColor" />
    </svg>
  );
}

// check (outline, currentColor). usado como badge de "activo" sobre el folder.
export function IconCheck({ size = 16, style }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", ...style }} aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 6.5" />
    </svg>
  );
}

// luna solida (se muestra en modo claro: click -> oscuro)
export function IconMoon({ size = 16, style }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block", ...style }} aria-hidden="true">
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" fill="currentColor" />
    </svg>
  );
}

// sol solido (se muestra en modo oscuro: click -> claro)
export function IconSun({ size = 16, style }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block", ...style }} aria-hidden="true">
      <circle cx="12" cy="12" r="4.6" fill="currentColor" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M19.4 4.6l-2.1 2.1M6.7 17.3l-2.1 2.1"
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
