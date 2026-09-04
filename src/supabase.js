// src/supabase.js
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // No lanzamos error para no romper `npm run dev` antes de configurar
  // el .env, pero cualquier llamada a supabase.* fallará hasta que lo
  // configures. Copia .env.example a .env y llena tus credenciales.
  console.warn(
    "[OEX SISTEMA] Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copia .env.example a .env y complétalo."
  );
}

export const supabase = createClient(url || "https://placeholder.supabase.co", anonKey || "placeholder");
