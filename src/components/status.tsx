import { palette } from "../theme";
import type { NptStatus } from "../lib/npt";

// chip de estado con color semaforo. unico lugar del dashboard con color.
const MAP: Record<NptStatus, { label: string; fg: string; bg: string }> = {
  ok: { label: "On track", fg: palette.ok, bg: palette.okBg },
  warn: { label: "Near limit", fg: palette.warn, bg: palette.warnBg },
  bad: { label: "Over", fg: palette.bad, bg: palette.badBg },
  none: { label: "No plan", fg: palette.textDim, bg: palette.panelAlt },
};

export function StatusChip({ status }: { status: NptStatus }) {
  const s = MAP[status];
  return (
    <span style={{
      display: "inline-block",
      fontSize: 12,
      fontWeight: 600,
      padding: "2px 10px",
      borderRadius: 6,
      color: s.fg,
      background: s.bg,
      border: `1px solid ${s.fg}33`,
    }}>{s.label}</span>
  );
}
