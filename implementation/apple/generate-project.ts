// Writes the Xcode project description (project.yml, the Info.plist files, export options) for the design's Apple
// targets with apple-host's renderer and installed settings. Run from this folder: `node generate-project.ts`, then
// `xcodegen generate`. SERVER_ADDRESS replaces the server address the design was installed with.
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderApple, writeApple } from "../components/apple-host/apple/render.ts";
import { appleHostSettings } from "../components/apple-host/apple/settings.ts";

const components = new URL("../components/", import.meta.url);
const has = (path: string) => existsSync(new URL(path, components));
// Every installed component's Swift sources join the application's module; apple-host adds its own.
const componentSources = readdirSync(components).filter((name) => name !== "apple-host" && has(`${name}/apple/Sources`)).sort().map((name) => `../components/${name}/apple/Sources`);
const { files, message } = renderApple(appleHostSettings, {
  componentSources,
  packages: has("video-calls/apple/Sources") ? [{ name: "LiveKit", url: "https://github.com/livekit/client-sdk-swift", from: "2.18.0" }] : [],
  serverAddress: process.env.SERVER_ADDRESS ?? "{{serverAddress}}",
  signingPrefix: "{{signingEnvironmentPrefix}}",
  appCategory: "public.app-category.card-games",
  cameraUsage: "Shows your face to the other players at the table.",
  microphoneUsage: "Lets the other players hear you.",
});
writeApple(fileURLToPath(new URL(".", import.meta.url)), files);
// The string catalogue with the design's languages only: the installed one holds all four.
const languages = "{{languages}}".split(" ");
const catalogue = JSON.parse(readFileSync(new URL("./strings/Localizable.xcstrings", import.meta.url), "utf8"));
for (const entry of Object.values(catalogue.strings) as { localizations: Record<string, unknown> }[]) {
  for (const code of Object.keys(entry.localizations)) if (!languages.includes(code)) delete entry.localizations[code];
}
writeFileSync(new URL("./OurPoker/Resources/Localizable.xcstrings", import.meta.url), JSON.stringify(catalogue, null, 2) + "\n");
console.log(`${message} Languages: ${languages.join(" ")}.`);
