import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// "engine" runs the adapter and service tests under Node; "room" runs the room tests in the local Workers runtime
// with the worker and bindings of server-host's wrangler.jsonc (no Cloudflare account is used).
export default defineConfig({
  test: {
    projects: [
      { test: { name: "engine", include: ["test/*.test.ts"], exclude: ["test/room.test.ts"] } },
      {
        plugins: [cloudflareTest({ wrangler: { configPath: "../components/server-host/server/wrangler.jsonc" }, miniflare: { bindings: { POLL_MS: "1500", WEB_ORIGINS: "https://display.example" } } })],
        test: { name: "room", include: ["test/room.test.ts"] },
      },
    ],
  },
});
