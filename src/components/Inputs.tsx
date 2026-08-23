import * as React from "react";
import { palette } from "../theme";
import { IconSearch, IconPlus } from "./icons";

// estilo base compartido de todos los inputs del dashboard (antes copy-pasteado en cada componente).
export const baseInput: React.CSSProperties = {
  background: palette.panel, color: palette.text, border: `1px solid ${palette.border}`,
  borderRadius: 8, padding: "8px 10px", fontSize: 19, boxSizing: "border-box",
};

type IconInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  containerStyle?: React.CSSProperties;
  iconSize?: number;
};

// input con lupa adentro (BUSCAR en una lista que ya existe). placeholder = lo que se busca,
// sin label externo. Es el patron de Dashboard > Summary, reusado en todo el dashboard.
export function SearchInput({ style, containerStyle, iconSize = 17, ...rest }: IconInputProps) {
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center", ...containerStyle }}>
      <span style={{ position: "absolute", left: 10, display: "inline-flex", color: palette.textDim, pointerEvents: "none" }}>
        <IconSearch size={iconSize} />
      </span>
      <input {...rest} style={{ ...baseInput, paddingLeft: 34, ...style }} />
    </div>
  );
}

// input con "+" adentro (AGREGAR / crear / asignar). placeholder = lo que se agrega.
// Mismo lenguaje visual que SearchInput: lupa = buscar, + = agregar.
export function AddInput({ style, containerStyle, iconSize = 18, ...rest }: IconInputProps) {
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center", ...containerStyle }}>
      <span style={{ position: "absolute", left: 10, display: "inline-flex", color: palette.textDim, pointerEvents: "none" }}>
        <IconPlus size={iconSize} />
      </span>
      <input {...rest} style={{ ...baseInput, paddingLeft: 34, ...style }} />
    </div>
  );
}

// input con "+" adentro + boton PEGADO a la derecha, todo en un solo control cuadrado (bordes 8),
// ~75% input / 25% boton. Enter o el boton disparan onSubmit. Es el patron "Add code" de Access>Teams
// (a Sean le gusto). Reusar con: <AddButtonInput value onChange onSubmit buttonDisabled placeholder .../>
type AddButtonInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "onSubmit"> & {
  onSubmit: () => void;
  buttonLabel?: string;      // default "Add"
  buttonDisabled?: boolean;
  containerStyle?: React.CSSProperties;
  iconSize?: number;
};
export function AddButtonInput({ onSubmit, buttonLabel = "Add", buttonDisabled, containerStyle, iconSize = 18, style, onKeyDown, ...rest }: AddButtonInputProps) {
  return (
    <div style={{ display: "flex", alignItems: "stretch", width: 260, border: `1px solid ${palette.border}`, borderRadius: 8, overflow: "hidden", background: palette.panel, ...containerStyle }}>
      <div style={{ position: "relative", display: "flex", alignItems: "center", flex: "1 1 75%", minWidth: 0 }}>
        <span style={{ position: "absolute", left: 10, display: "inline-flex", color: palette.textDim, pointerEvents: "none" }}>
          <IconPlus size={iconSize} />
        </span>
        <input {...rest}
          onKeyDown={(e) => { if (e.key === "Enter") onSubmit(); onKeyDown?.(e); }}
          style={{ width: "100%", background: "transparent", border: "none", outline: "none", color: palette.text, padding: "8px 34px", fontSize: 18, textAlign: "center", ...style }} />
      </div>
      <button type="button" onClick={onSubmit} disabled={buttonDisabled}
        style={{ flex: "0 0 25%", background: palette.accent, color: palette.accentText, border: "none",
          cursor: buttonDisabled ? "default" : "pointer", opacity: buttonDisabled ? 0.5 : 1,
          fontWeight: 700, fontSize: 15, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {buttonLabel}
      </button>
    </div>
  );
}

// separa una entrada de usernames por coma / espacio / salto de linea y limpia vacios.
// permite agregar en bulk desde un solo AddInput: "user, user, user".
export function splitAliases(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}
