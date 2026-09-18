import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Served by Nginx under /crm, so assets must resolve from that base.
export default defineConfig({
  base: "/crm/",
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { "/crm/api": "http://localhost:4000" },
  },
});
