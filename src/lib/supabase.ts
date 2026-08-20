import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anon) {
  // no lanzamos: la UI muestra un aviso claro en vez de romperse en blanco
  console.warn("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.");
}

// detecta si la carga viene del link de confirmacion de email (Supabase redirige con type=signup).
// se lee ANTES de crear el cliente, porque supabase-js limpia el hash de la URL al inicializar.
export const emailConfirmed = (() => {
  try {
    const s = (window.location.hash || "") + (window.location.search || "");
    return /[#&?]type=signup(?:&|$)/.test(s);
  } catch { return false; }
})();

export const supabase = createClient(url ?? "", anon ?? "");
