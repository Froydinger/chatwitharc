import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  if (mode === "production") {
    const env = loadEnv(mode, process.cwd(), "VITE_");
    if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_PUBLISHABLE_KEY) {
      throw new Error("Production build requires VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY");
    }
  }

  return ({
  server: {
    host: "127.0.0.1",
    port: 5173,
    allowedHosts: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 5173,
    allowedHosts: true,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  });
});
