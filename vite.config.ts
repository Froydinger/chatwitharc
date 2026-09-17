import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { execFileSync } from "node:child_process";

function getBuildVersion() {
  const configuredVersion = process.env.VITE_APP_VERSION?.trim();
  if (configuredVersion) return configuredVersion;

  const hostedCommit = (process.env.COMMIT_REF || process.env.GITHUB_SHA || "").trim();
  if (hostedCommit) return hostedCommit.slice(0, 8);

  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() || "local";
  } catch {
    return "local";
  }
}

// https://vitejs.dev/config/
export default defineConfig(() => ({
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
  define: {
    __ARC_BUILD_VERSION__: JSON.stringify(getBuildVersion()),
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
}));
