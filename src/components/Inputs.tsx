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

// separa una entrada de usernames por coma / espacio / salto de linea y limpia vacios.
// permite agregar en bulk desde un solo AddInput: "user, user, user".
export function splitAliases(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}
