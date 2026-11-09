import { browserHost, startShell } from "../../components/web-host/web/runtime";

// The only web module that imports web-host: the manifest installs it only when the design includes that component.
// Installability (service worker and the add-to-home-screen banner) is the web shell's; the desktop wrapper has neither.
export function startWebShell(desktop: boolean) {
  startShell(browserHost(), { desktop });
}
