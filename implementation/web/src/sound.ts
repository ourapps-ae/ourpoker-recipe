// The game's sounds (assets/sounds): short and quiet, as players' microphones are open. The
// sound-cues component plays them from the manifest; this keeps the game's names and the rule that a
// shared display never makes a sound. Browsers allow sound only after a tap, so nothing plays before the first one.
import { createCues } from "../../components/sound-cues/web/index";
import { createPreferences } from "../../components/preferences/web/index";
import manifest from "../public/sounds/manifest.json";
import { modeEvent, sessionMode } from "./mode";

export type SoundName =
  | "click" | "enter" | "exit" | "start" | "end" | "bot_add" | "bot_remove"
  | "deal" | "burn" | "flip" | "check" | "fold" | "chips" | "allin" | "win" | "turn";

// The device's choices (sound, language, camera, microphone), kept under the keys this game always used.
export const preferences = createPreferences(localStorage);

const cues = createCues({
  manifest: manifest as never,
  baseUrl: new URL("sounds", document.baseURI).href,
  preferences,
  allowed: () => sessionMode() !== "board",
});
cues.unlockOn(document, "pointerdown");
window.addEventListener(modeEvent, () => cues.stopAll());

// Sounds on or off on this device; off also silences the other players' voices (video).
export const soundOn = (): boolean => !cues.muted();
export const setSound = (on: boolean) => cues.setMuted(!on);
export const play = (name: SoundName, delayMs = 0) => cues.play(name, delayMs);
