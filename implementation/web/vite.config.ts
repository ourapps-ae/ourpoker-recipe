import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { webHostConfig, webHostSettings } from "../components/web-host/server/index.ts";
import { colourTable, resolveTheme, themes, type ThemeFile } from "../components/theme/server/index.ts";

// The version the clients show: VITE_APP_VERSION, else APP_VERSION (the Windows package's), else "dev".
if (!process.env.VITE_APP_VERSION && process.env.APP_VERSION) process.env.VITE_APP_VERSION = process.env.APP_VERSION;

// The web shell (page head, manifest, service worker, headers) is web-host's, rendered from its installed settings;
// the colour names resolve through the theme. Components import livekit-client from their own folders, so it
// resolves to this project's copy (installed only when the design includes video-calls).
export default defineConfig(({ mode }) => ({
  ...webHostConfig({
    mode,
    root: fileURLToPath(new URL(".", import.meta.url)),
    settings: webHostSettings,
    colours: colourTable(resolveTheme(themes as ThemeFile)),
    description: "Texas hold'em for friends at one table",
  }),
  resolve: { alias: { "livekit-client": fileURLToPath(new URL("./node_modules/livekit-client", import.meta.url)) } },
}));
