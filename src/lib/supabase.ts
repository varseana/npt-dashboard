import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anon) {
  // no lanzamos: la UI muestra un aviso claro en vez de romperse en blanco
  console.warn("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.");
}

export const supabase = createClient(url ?? "", anon ?? "");
