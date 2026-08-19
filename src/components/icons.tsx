// iconos vectoriales outline (estilo Lucide/Feather), inline, sin dependencias.
// trazo en currentColor => heredan el color del texto/boton. NADA de emojis.
import * as React from "react";

type P = { size?: number; style?: React.CSSProperties };

function Svg({ size = 16, style, children }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      style={{ display: "block", ...style }} aria-hidden="true">
      {children}
    </svg>
  );
}

export function IconMail(p: P) {
  return (<Svg {...p}>
    <rect width="20" height="16" x="2" y="4" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </Svg>);
}

export function IconAlert(p: P) {
  return (<Svg {...p}>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </Svg>);
}

export function IconLogout(p: P) {
  return (<Svg {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" x2="9" y1="12" y2="12" />
  </Svg>);
}

export function IconX(p: P) {
  return (<Svg {...p}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </Svg>);
}
