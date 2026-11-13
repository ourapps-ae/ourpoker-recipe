// Writes the Gradle project (settings, build files, manifest, launcher icon, the Gradle wrapper) for the design with
// android-host's renderer and installed settings. Run from this folder: `node generate-project.ts`, then `./gradlew assembleDebug`.
// The server address is the design's; `./gradlew assembleDebug -PserverUrl=<address>` builds against another one (an emulator
// reaches this Mac's localhost as http://10.0.2.2:<port>).
import { cpSync, existsSync, readdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { androidHostSettings, renderAndroid, writeAndroid, writeWrapper } from "../components/android-host/server/index.ts";

const components = new URL("../components/", import.meta.url);
const has = (path: string) => existsSync(new URL(path, components));
// Every installed component's Kotlin sources and resources join the application.
const componentFolders = readdirSync(components).filter((name) => has(`${name}/android/src/main/java`)).sort().map((name) => `../components/${name}/android`);
const video = has("video-calls/android/src/main/java");
const here = fileURLToPath(new URL(".", import.meta.url));
writeWrapper(here);
writeAndroid(here, renderAndroid(androidHostSettings, {
  componentFolders,
  // LiveKit's audio switch is published on JitPack.
  repositories: video ? ["https://jitpack.io"] : [],
  buildConfigStrings: [{ name: "SERVER_URL", property: "serverUrl", value: "{{serverAddress}}" }],
  kotlinSerialization: true,
  activityName: "app.ourapps.ourpoker.MainActivity",
  orientation: "portrait",
  allowCleartext: true,
  signingPrefix: "{{signingEnvironmentPrefix}}",
  permissions: ["android.permission.INTERNET", ...(video ? ["android.permission.CAMERA", "android.permission.RECORD_AUDIO", "android.permission.MODIFY_AUDIO_SETTINGS"] : [])],
  cameraOptional: video,
  dependencies: [
    "androidx.compose.material:material-icons-extended:1.7.8",
    "androidx.lifecycle:lifecycle-viewmodel-compose:2.10.0",
    "com.squareup.okhttp3:okhttp:4.12.0",
    "org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0",
    "org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2",
    ...(video ? ["io.livekit:livekit-android:2.29.0", "io.livekit:livekit-android-compose-components:2.4.2"] : []),
  ],
  testDependencies: ["junit:junit:4.13.2"],
}));
// The string resources of the design's languages only: the installed ones (strings/values*) hold all four.
const languages = "{{languages}}".split(" ");
for (const code of ["en", "fr", "de", "es"]) {
  const folder = code === "en" ? "values" : `values-${code}`;
  const target = new URL(`./app/src/main/res/${folder}/strings.xml`, import.meta.url);
  if (languages.includes(code)) cpSync(new URL(`./strings/${folder}/strings.xml`, import.meta.url), target);
  else rmSync(target, { force: true });
}
console.log(`Android project written with ${componentFolders.length} component folders${video ? " and LiveKit" : ""}, languages ${languages.join(" ")}`);
