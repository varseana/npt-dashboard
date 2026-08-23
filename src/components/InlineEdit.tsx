import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { palette } from "../theme";
import { IconPencil } from "./icons";

// Edicion inline reusable, siguiendo los 5 principios que pidio Sean:
//  1. affordance   -> lapiz (IconPencil) + tinte de fondo al hacer hover sobre la lectura.
//  2. zero layout shift -> lectura e input comparten la MISMA metrica (font/padding/width/box-sizing);
//     lo unico que cambia entre modos es el borde (transparente -> visible). El lapiz va absoluto,
//     asi no empuja el contenido ni al entrar en edicion ni al hacer hover.
//  3. keyboard semantics -> Enter confirma, Escape cancela, blur confirma (regla estilo Notion,
//     consistente en todo el dashboard).
//  4. optimistic save -> muestra el valor nuevo YA; si onSave throwea, revierte, conserva el
//     borrador y reabre el campo mostrando el error.
//  5. edit modes -> este componente es edicion DIRECTA (campos baratos). Lo destructivo/caro sigue
//     yendo por ConfirmDialog, no por aca.
interface Props {
  value: string;                                   // valor de lectura, ya editable tal cual
  onSave: (next: string) => Promise<void>;         // persiste; si throwea -> rollback + error visible
  format?: (v: string) => string;                  // normaliza el borrador al confirmar (ej. duracion -> H:MM:SS)
  render?: (v: string) => React.ReactNode;         // como pintar el valor (no vacio) en lectura
  emptyHint?: React.ReactNode;                      // que mostrar en lectura cuando value === ""
  placeholder?: string;                            // placeholder del input
  width?: number | string;
  align?: "left" | "center";
  fontSize?: number;
  fontWeight?: number;
  ariaLabel?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}

export function InlineEdit({
  value, onSave, format, render, emptyHint, placeholder,
  width = 140, align = "left", fontSize = 19, fontWeight = 400, ariaLabel, inputMode,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(false);   // Escape marca este flag antes del blur para descartar

  // cuando el padre actualiza value (tras guardar + recargar), soltamos el optimista
  useEffect(() => { setOptimistic(null); }, [value]);
  // al entrar en edicion: foco + seleccion del texto para reemplazarlo de una
  useEffect(() => { if (editing) { inputRef.current?.focus(); inputRef.current?.select(); } }, [editing]);

  function enter() { setDraft(value); setErr(""); setEditing(true); }
  function cancel() { setEditing(false); setDraft(value); setErr(""); }

  async function commit() {
    const next = format ? format(draft) : draft;
    setEditing(false);
    if (next === value) { setDraft(next); return; }   // sin cambios reales: no dispara guardado
    setOptimistic(next);                               // optimista: se ve el valor nuevo ya
    setBusy(true);
    try {
      await onSave(next);
      setErr("");
    } catch (e: any) {
      setOptimistic(null);                             // rollback del display al valor original
      setErr(e?.message || String(e));
      setDraft(next);                                  // conserva el borrador que escribio
      setEditing(true);                                // reabre para que corrija
    } finally {
      setBusy(false);
    }
  }

  const shown = optimistic ?? value;
  // el lapiz vive absoluto a la derecha: reservamos padding para que el texto no quede debajo.
  const padPencil = 22;
  const padding = align === "left" ? `7px ${padPencil}px 7px 9px` : `7px ${padPencil}px`;
  const metric: React.CSSProperties = { fontSize, fontWeight, textAlign: align, width, padding, lineHeight: 1.3 };

  return (
    <span className="npt-inline-field" style={{ position: "relative", display: "inline-block", width }}>
      {editing ? (
        <input
          ref={inputRef}
          className="npt-inline-input"
          style={metric}
          value={draft}
          placeholder={placeholder}
          inputMode={inputMode}
          aria-label={ariaLabel}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); inputRef.current?.blur(); }
            else if (e.key === "Escape") { e.preventDefault(); cancelRef.current = true; inputRef.current?.blur(); }
          }}
          onBlur={() => { if (cancelRef.current) { cancelRef.current = false; cancel(); } else void commit(); }}
        />
      ) : (
        <div
          className="npt-inline-read"
          style={metric}
          role="button"
          tabIndex={0}
          aria-label={ariaLabel ? `Edit ${ariaLabel}` : "Edit"}
          title="Click to edit"
          onClick={enter}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); enter(); } }}
        >
          {shown === ""
            ? (emptyHint ?? <span style={{ color: palette.textDim }}>{placeholder ?? "-"}</span>)
            : (render ? render(shown) : shown)}
        </div>
      )}
      {!editing && (
        <span className="npt-inline-pencil" aria-hidden="true"
          style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", display: "inline-flex" }}>
          <IconPencil size={13} />
        </span>
      )}
      {err && (
        <span style={{ position: "absolute", top: "100%", left: 0, marginTop: 3, fontSize: 14, color: palette.bad, whiteSpace: "nowrap", zIndex: 5 }}>{err}</span>
      )}
    </span>
  );
}
