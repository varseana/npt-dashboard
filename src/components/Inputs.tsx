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

// control cuadrado (borde 1px, radius 8): a la izquierda un ICONO que representa lo que se escribe
// (user / folder / tag / ...), el texto se escribe a la IZQUIERDA (icono siempre visible), y a la
// derecha un boton CUADRADO PERFECTO con "+" centrado (add y create son lo mismo). Hover del boton:
// el "+" brilla VERDE en claro / AZUL en oscuro (clase .npt-add-plus). Enter o el boton disparan
// onSubmit. Reusar con: <AddButtonInput icon={<IconUser/>} value onChange onSubmit buttonDisabled .../>
// Caso del placeholder: MAYUSCULAS si es un elemento sobresaliente; minusculas si vive dentro de un card
// (se pasa la string ya en el case correcto; no se usa textTransform salvo campos que SON mayuscula, ej code).
type AddButtonInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "onSubmit"> & {
  onSubmit: () => void;
  icon?: React.ReactNode;    // icono izquierdo = lo que se escribe; default "+" si no se pasa
  buttonDisabled?: boolean;
  containerStyle?: React.CSSProperties;
  iconSize?: number;
};
export function AddButtonInput({ onSubmit, icon, buttonDisabled, containerStyle, iconSize = 18, style, onKeyDown, ...rest }: AddButtonInputProps) {
  return (
    <div style={{ display: "flex", alignItems: "stretch", width: 260, border: `1px solid ${palette.border}`, borderRadius: 8, overflow: "hidden", background: palette.panel, ...containerStyle }}>
      <div style={{ position: "relative", display: "flex", alignItems: "center", flex: 1, minWidth: 0 }}>
        <span style={{ position: "absolute", left: 10, display: "inline-flex", color: palette.textDim, pointerEvents: "none" }}>
          {icon ?? <IconPlus size={iconSize} />}
        </span>
        <input {...rest}
          onKeyDown={(e) => { if (e.key === "Enter") onSubmit(); onKeyDown?.(e); }}
          style={{ width: "100%", background: "transparent", border: "none", outline: "none", color: palette.text, padding: "8px 10px 8px 34px", fontSize: 18, textAlign: "left", ...style }} />
      </div>
      <button type="button" onClick={onSubmit} disabled={buttonDisabled} className="npt-add-plus" aria-label="Add"
        style={{ flex: "0 0 auto", aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center",
          background: palette.accent, color: palette.accentText, border: "none",
          cursor: buttonDisabled ? "default" : "pointer", opacity: buttonDisabled ? 0.5 : 1 }}>
        <IconPlus size={20} />
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
