// The application passes display-mode, video-calls and windows-desktop their configuration in code, since their
// `configuration` requirement is optional. This example, without the game, builds those documents from a settings
// object (the values the recipe collects) and checks each against what that component's contract asks for.
export type Settings = {
  applicationId: string;
  applicationName: string;
  scheme: string;
  serverAddress: string;
  roomPrefix: string;
  modeEvent: string;
};

export const defaults: Settings = {
  applicationId: "ourpoker",
  applicationName: "OurPoker",
  scheme: "ourpoker",
  serverAddress: "https://rooms.example",
  roomPrefix: "ourpoker-",
  modeEvent: "ourpoker-mode",
};

const LOOPBACK = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const FORBIDDEN_SCHEMES = new Set(["http", "https", "file", "data", "javascript"]);

export function displayModeConfiguration(s: Settings) {
  if (!s.modeEvent) throw new Error("display-mode needs a nonempty event name");
  return { initialMode: "player" as const, eventName: s.modeEvent };
}

export function videoCallsConfiguration(s: Settings) {
  if (!/^[a-z][a-z0-9-]*[-_.]$/.test(s.roomPrefix)) throw new Error("video-calls needs a room prefix that ends with its separator");
  return { roomPrefix: s.roomPrefix, eventName: s.modeEvent };
}

export function windowsDesktopConfiguration(s: Settings, webRoot = "/app/build/web") {
  if (!/^[a-z][a-z0-9-]*$/.test(s.scheme) || FORBIDDEN_SCHEMES.has(s.scheme)) throw new Error("windows-desktop needs a lowercase custom scheme");
  if (!s.serverAddress.startsWith("https://") && !LOOPBACK.test(s.serverAddress)) throw new Error("the server origin must be https, or loopback");
  if (!webRoot.startsWith("/")) throw new Error("webRoot must be absolute");
  return { scheme: s.scheme, appName: s.applicationName, partition: `persist:${s.applicationId}`, serverOrigin: s.serverAddress, modeEvent: s.modeEvent, externalOrigins: [] as string[], webRoot };
}

export function configurations(s: Settings = defaults) {
  return { displayMode: displayModeConfiguration(s), videoCalls: videoCallsConfiguration(s), windowsDesktop: windowsDesktopConfiguration(s) };
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file://").href) console.log(JSON.stringify(configurations(), null, 2));
