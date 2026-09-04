import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173,
    host: "0.0.0.0",
    allowedHosts: process.env.VITE_FRONTEND_ALLOWED_HOSTS?.split(",") || [],
  },

  preview: {
    host: "0.0.0.0",
    allowedHosts: [
      "astonishing-renewal-production-d065.up.railway.app",
    ],
  },

  esbuild: {
    keepNames: true,
    minifyIdentifiers: false,
  },
});
