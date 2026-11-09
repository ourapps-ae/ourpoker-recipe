// The application's entry: starts the store, draws the screen for the state, and keeps the room's
// look, the video, the lessons and the update notice in step with it. The installable shell (manifest,
// service worker, install banner) is the web-host component's; the look is the theme's.
import "../../components/theme/web/theme.css";
import "../../components/controls/web/controls.css";
import "../../components/card-graphics/web/cards.css";
import "../../components/chip-graphics/web/chips.css";
import "../../components/table-layout/web/table-layout.css";
import "./guide-style";
import "./poker.css";
import { Background } from "../../components/theme/web/background";
import { startWebShell } from "./shell";
import { boardScreen } from "./board";
import { loadArtManifest, h, icon, cardEl, setCardTheme } from "./ui";
import { onGuideChange, onScreen } from "./guide";
import { L } from "./i18n";
import { showRoom, tokensFor } from "./rooms";
import { endScreen, helpScreen, homeScreen, lobbyScreen, nameScreen, tableScreen } from "./screens";
import { resetTablePresentation, soloGame } from "./table";
import { Store } from "./store";
import { play, soundOn } from "./sound";
import { Video } from "./video";
import { desktop, canCapture, modeEvent } from "./mode";
import { availableUpdate } from "./update";
const app = document.getElementById("app")!;
const bg = new Background(document.getElementById("bg") as HTMLCanvasElement, tokensFor("casino"));
const store = new Store();
const video = new Video(() => store.set({}), { canCapture, soundOn, modeEvent });
// A guide open at the table holds the play clock for everyone.
onGuideChange(() => store.updateHold());
// Development only (removed from release builds): lets test scripts read the state.
if (import.meta.env.DEV) Object.assign(window, { pokerVideo: video, pokerStore: store, pokerCard: cardEl });

let lastVideo: string | null = null;
let lastVersion = -1;
let lastSession = "";

store.subscribe((s) => {
  const session = `${s.mode}:${s.roomId}:${s.token}`;
  if (session !== lastSession) {
    lastSession = session;
    resetTablePresentation();
  }
  const board = s.mode === "board";
  // Theme follows the room, or the previewed one at home.
  showRoom(bg, s.view?.roomId ?? s.previewRoom);
  bg.figures = !(s.token && s.view?.status === "running" && !s.help);
  setCardTheme(s.view?.roomId ?? s.previewRoom);
  // Video follows the seat.
  const grant = board ? null : s.video;
  if (grant && grant.room !== lastVideo) {
    lastVideo = grant.room;
    video.connect(grant.url, grant.token, grant.room);
  }
  if ((board || !s.token || !grant) && lastVideo) {
    lastVideo = null;
    video.disconnect();
  }
  if (!board && s.view && s.view.version !== lastVersion) {
    lastVersion = s.view.version;
    video.armIdle();
  }
  // Home keeps a live connection to the room list while it shows.
  store.watchRooms(!s.editingName && !s.token && !s.help);
  render(s);
});

function render(s: Store["state"]) {
  const board = s.mode === "board";
  app.dataset.mode = s.mode;
  app.classList.toggle("wide", board || Boolean(s.view?.status === "running"));
  onScreen(board || s.help || s.editingName ? "other" : !s.token || !s.view ? "home" : s.view.status === "lobby" ? "lobby" : s.view.status === "running" ? "table" : "other");
  // Camera and microphone stay off through a game with only computer players.
  if (!board) video.hold(Boolean(s.token && s.view && soloGame(s.view)));
  const atTable = Boolean(s.token && s.view && s.view.status === "running" && !s.help && s.name && !s.editingName);
  const focused = document.activeElement as HTMLElement | null;
  const focusKey = focused?.dataset.focus;
  const focusLabel = focused?.getAttribute("aria-label");
  app.replaceChildren(
    s.help ? helpScreen(store)
      : s.editingName && !board ? nameScreen(store, s)
      : !s.token || !s.view ? homeScreen(store, s)
      : board ? boardScreen(store, s, s.view)
      : s.view.status === "lobby" ? lobbyScreen(store, s, s.view, video)
      : s.view.status === "running" ? tableScreen(store, s, s.view, video)
      : endScreen(store, s, s.view),
  );
  if (focusKey || focusLabel) {
    const replacement = [...app.querySelectorAll<HTMLElement>("button, input, select")].find((el) => focusKey ? el.dataset.focus === focusKey : el.getAttribute("aria-label") === focusLabel);
    replacement?.focus({ preventScroll: true });
  }
  // How to play: the table keeps it in its header; every other screen has it in this corner.
  if (!board && !s.help && !atTable) app.append(h("button", { class: "bulb", title: L("how_to_play"), "aria-label": L("how_to_play"), onClick: () => { play("click"); store.set({ help: true }); } }, icon("bulb", 26)));
  if (!board && s.token && localStorage.getItem("beginner") === null) {
    const choose = (beginner: boolean) => {
      localStorage.setItem("beginner", String(beginner));
      localStorage.setItem("handPanel", beginner ? "open" : "closed");
      store.set({ handPanel: beginner });
    };
    app.append(h("div", { class: "modal" }, h("div", { class: "panel" },
      h("h2", {}, L("beginner_title")),
      h("button", { class: "btn block", onClick: () => choose(true) }, L("beginner_yes")),
      h("button", { class: "btn block ghost", onClick: () => choose(false) }, L("beginner_no")),
    )));
  }
}

store.resume();
void availableUpdate(import.meta.env.VITE_APP_VERSION ?? "0.0.0-dev", desktop ? null : { platform: "web", channel: "web", origins: [location.origin], allowLoopback: import.meta.env.DEV }).then(update => {
  if (update) {
    const link = h("a", { href: update.url, rel: "noopener", target: "_blank" }, L("update_available", update.version));
    document.body.append(link);
  }
});
loadArtManifest(() => store.set({}));

// A hidden tab closes its connections, which tells the table it is away; shown again, it
// reconnects and the table sends its view at once.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    store.sleep();
  } else {
    store.wake();
    store.set({});
  }
});
window.addEventListener("pagehide", () => store.sleep());

startWebShell(desktop);
