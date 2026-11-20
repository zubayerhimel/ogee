import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ command, mode }) => ({
  plugins: [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      // Builds the server from src/server.ts, our SSR error wrapper.
      server: { entry: "server" },
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
    }),
    // Cloudflare Workers unless the host is auto-detected or NITRO_PRESET is set.
    command === "build" && nitro({ defaultPreset: "cloudflare-module" }),
    viteReact(),
  ],
  resolve: {
    dedupe: ["react", "react-dom", "@tanstack/react-query", "@tanstack/query-core"],
  },
  // `pnpm build:dev` produces an unminified-style development client bundle.
  ...(command === "build" && mode === "development"
    ? {
        environments: {
          client: { define: { "process.env.NODE_ENV": JSON.stringify("development") } },
        },
      }
    : {}),
  server: { host: "::", port: 8080 },
}));
