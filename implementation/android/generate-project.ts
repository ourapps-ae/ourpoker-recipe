// Writes the Gradle project (settings, build files, manifest, launcher icon) for the design with android-host's
// renderer and installed settings. Run from this folder: `node generate-project.ts`, then build with Gradle.
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderAndroid, writeAndroid } from "../components/android-host/android/render.ts";
import { androidHostSettings } from "../components/android-host/android/settings.ts";

const components = new URL("../components/", import.meta.url);
const has = (path: string) => existsSync(new URL(path, components));
// Every installed component's Kotlin sources and resources join the application.
const componentFolders = readdirSync(components).filter((name) => has(`${name}/android/src/main/java`)).sort().map((name) => `../components/${name}/android`);
const video = has("video-calls/android/src/main/java");
writeAndroid(fileURLToPath(new URL(".", import.meta.url)), renderAndroid(androidHostSettings, {
  componentFolders,
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
}));
console.log(`Android project written with ${componentFolders.length} component folders${video ? " and LiveKit" : ""}`);
