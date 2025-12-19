import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  ...(mode !== 'development'
    ? {
        define: {
          // Production fallback: some deploy targets don't inject VITE_* vars.
          // Use backend-provided env vars at build time.
          'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(
            process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
          ),
          'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(
            process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
              process.env.SUPABASE_PUBLISHABLE_KEY ||
              process.env.SUPABASE_ANON_KEY ||
              ''
          ),
        },
      }
    : {}),
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === 'development' && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
