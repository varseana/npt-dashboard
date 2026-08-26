import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // devspaces expone el dev server via un proxy con host dinamico por sesion;
    // permitir el dominio (y subdominios) evita el "Blocked request / host not allowed".
    allowedHosts: [".devspaces.amazon.dev"],
  },
});
