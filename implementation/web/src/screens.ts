import { DEFAULT_SERVER, SERVER, type RoomInfo, type View } from "./api";
import { addBotIcon, cardEl, chips, h, icon, type IconName } from "./ui";
import { resetGuides, want } from "./guide";
import { seatRows, canTakeSeat } from "../../components/seating/web/lobby";
import { headingKey, resultRows } from "../../components/tournament/web/results";
import { L, LANGUAGES, currentLanguage, pickLanguage, pickedLanguage, promptText, roomName } from "./i18n";
import { play, setSound, soundOn } from "./sound";
import type { State, Store } from "./store";
import { renderTable, showCardsButton } from "./table";
import type { Video } from "./video";

const LOGO = () => h("div", { class: "logo" }, cardEl("As", 44), cardEl("Kh", 44));

export function errorText(e: State["error"]): string | null {
  if (!e) return null;
  const key = e.code === "tableReset" ? "table_reset" : e.code === "network" ? "network_error" : e.code ? `err_${e.code}` : "";
  const text = key ? L(key) : "";
  return text && text !== key ? text : e.message;
}

export function nameScreen(store: Store, s: State): HTMLElement {
  const input = h("input", { placeholder: L("your_name"), maxlength: 20, value: s.name, autocomplete: "off" }) as HTMLInputElement;
  const save = () => input.value.trim() && store.setName(input.value);
  input.addEventListener("keydown", (e) => e.key === "Enter" && save());
  return h("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", paddingTop: "15vh" } },
    LOGO(), h("h1", {}, L("app_name")),
    h("div", { class: "panel", style: { width: "100%" } },
      h("div", { class: "title" }, L(s.name ? "change_name" : "first_run_title")),
      h("p", { class: "center" }, L("first_run_body")),
      input,
      h("div", { class: "row", style: { justifyContent: "flex-end", marginTop: "12px" } },
        h("button", { class: "btn link", onClick: () => store.set({ editingName: false }) }, L("cancel")),
        h("button", { class: "btn", onClick: save }, L("save")),
      ),
    ),
  );
}

const MAX_SEATS = 9;

// Set by the release build; local builds show dev.
const APP_VERSION: string = import.meta.env.VITE_APP_VERSION ?? "dev";

export function homeScreen(store: Store, s: State): HTMLElement {
  const rooms = s.rooms;
  if (rooms && s.mode === "player" && s.name) want("home");
  const selected = rooms ? rooms.find((r) => r.id === s.previewRoom) ?? rooms[0] ?? null : null;
  return h("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", paddingTop: "16px" } },
    LOGO(), h("h1", {}, L("app_name")), h("div", { class: "muted" }, L("tagline")),
    h("div", { class: "row mode-picker", role: "group", "aria-label": L("join_how") },
      h("button", { class: `btn ${s.mode === "player" ? "" : "ghost"}`, "aria-pressed": String(s.mode === "player"), "data-focus": "player", onClick: () => store.selectMode("player") }, modeLabel("player")),
      h("button", { class: `btn ${s.mode === "board" ? "" : "ghost"}`, "aria-pressed": String(s.mode === "board"), "data-focus": "board", onClick: () => store.selectMode("board") }, modeLabel("board"))),
    s.mode === "player" ? h("div", { class: "row" }, h("span", {}, s.name ? L("playing_as", s.name) : L("your_name")),
      h("button", { class: "icbtn plain", "data-guide": "editName", title: L("change_name"), "aria-label": L("change_name"), onClick: () => { play("click"); store.set({ editingName: true }); } }, icon("edit", 20)))
      : null,
    // Tap a room to select it (and preview its look); the button in the title bar enters it.
    h("div", { class: "panel", "data-guide": "rooms", style: { width: "100%" } },
      h("div", { class: "row spread", style: { marginBottom: "6px", gap: "8px" } }, h("div", { class: "title", style: { margin: "0" } }, L("select_room")), enterButton(store, s, selected)),
      rooms
        ? h("div", { class: "list" }, ...rooms.map((r, i) => {
            const inGame = r.status !== "lobby";
            return h("button", { type: "button", "aria-pressed": String(r.id === selected?.id), "data-focus": `room-${r.id}`, class: `item room${r.id === selected?.id ? " selected" : ""}`, ...(i === 0 ? { "data-guide": "roomName" } : {}), onClick: () => { if (s.previewRoom !== r.id) play("click"); store.set({ previewRoom: r.id }); } },
              h("div", { class: "grow" },
                h("div", { class: "roomname" }, roomName(r.id)),
                h("div", { class: "muted" }, r.playerCount === 0 ? L("room_empty") : inGame ? L("room_in_game", r.names.join(", ")) : L("room_lobby", r.names.join(", "))),
              ),
            );
          }))
        : h("div", { class: "muted" }, L(s.roomsDown ? "unreachable" : "looking")),
      rooms && s.roomsDown ? h("div", { class: "muted", style: { marginTop: "8px" } }, L("unreachable")) : null,
      s.roomsDown && SERVER !== DEFAULT_SERVER ? h("div", { class: "muted", style: { fontSize: "11px" } }, SERVER) : null,
      errorText(s.error) ? h("div", { class: "error", style: { marginTop: "8px" } }, errorText(s.error)) : null,
    ),
    h("div", { class: "row", style: { gap: "10px", justifyContent: "center", flexWrap: "wrap" } },
      languageButton(store),
      s.mode === "player" ? h("button", { class: "pill", onClick: () => { play("click"); resetGuides(); want("home"); } }, icon("replay", 18), L("reset_hints")) : null,
    ),
    h("div", { class: "muted center", style: { fontSize: "11px", opacity: "0.6" } }, `OurPoker ${APP_VERSION}`),
  );
}

export function modeLabel(mode: State["mode"]) {
  const key = `mode_${mode}`;
  const text = L(key);
  return text === key ? (mode === "player" ? "Player" : "Board") : text;
}

// Enter the selected room: sit down, go back to this device's seat, or watch a game under way; a lock while it is full or
// while the name is someone else's there (a seat goes back only to the device holding its token).
function enterButton(store: Store, s: State, r: RoomInfo | null): HTMLElement {
  const inGame = r ? r.status !== "lobby" : false;
  const named = Boolean(r?.names.includes(s.name));
  const mine = Boolean(r && store.seatToken(r.id));
  const seated = named && mine;
  const taken = s.mode === "player" && named && !mine;
  const full = s.mode === "player" && r ? !canTakeSeat(r.names, r.playerCount, MAX_SEATS, seated ? s.name : "", inGame) && !seated && !inGame : false;
  const label = L(s.mode === "board" ? "join_as_viewer" : seated ? "room_rejoin" : taken ? "room_name_taken" : full ? "room_full" : inGame ? "room_watch" : "room_join");
  return h("button", { class: "icbtn gold", "data-guide": "roomJoin", title: label, "aria-label": label, disabled: !r || full || taken || s.busy, onClick: () => { if (r) store.join(r.id); } }, icon(full || taken ? "lock" : "login"));
}

// The language in use, opening the list of languages; a native list, laid invisibly over the pill.
function languageButton(store: Store): HTMLElement {
  const list = h("select", { "aria-label": L("language"), title: L("language") },
    h("option", { value: "" }, L("lang_device")),
    ...LANGUAGES.map(([code, name]) => h("option", { value: code }, name)),
  ) as HTMLSelectElement;
  list.value = pickedLanguage() ?? "";
  list.addEventListener("change", () => { play("click"); pickLanguage(list.value || null); store.set({}); });
  return h("label", { class: "pill" }, icon("language", 18), LANGUAGES.find(([code]) => code === currentLanguage())?.[1] ?? "English", list);
}

// Going back up a level: the leave icon turned to point left. Back is always on the left and
// going deeper in on the right.
export function backIcon(): SVGSVGElement {
  const el = icon("logout", 24);
  el.style.transform = "rotate(180deg)";
  return el;
}

export function lobbyScreen(store: Store, s: State, view: View, video: Video): HTMLElement {
  const me = view.players.find((p) => p.id === view.you);
  want("lobby");
  if (view.players.some((p) => p.isBot)) want("bots");
  const actions = h("div", { class: "row spread" },
    h("div", { class: "row", style: { gap: "6px" } },
      view.legal.leave ? h("button", { class: "icbtn ghost", "data-guide": "leave", title: L("leave"), "aria-label": L("leave"), disabled: s.busy, onClick: () => leave(store) }, backIcon()) : null,
      view.legal.addBot ? h("button", { class: "icbtn ghost", "data-guide": "addBot", title: L("add_computer"), "aria-label": L("add_computer"), disabled: s.busy, onClick: () => store.act("addBot") }, addBotIcon(22)) : null,
    ),
    me && !me.isBot ? h("button", { class: `icbtn gold${view.legal.start && !s.busy ? " glow" : ""}`, "data-guide": "start", title: view.legal.start ? L("start_game") : promptText(view), "aria-label": L("start_game"), disabled: !view.legal.start || s.busy, onClick: () => store.act("start") }, icon("play")) : h("span"),
  );
  return h("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } },
    h("div", { class: "row", style: { padding: "0 4px", minHeight: "40px" } }, h("h2", {}, roomName(view.roomId))),
    h("div", { class: "banner" }, h("span", { class: "text" }, promptText(view))),
    h("div", { class: "panel" },
      actions,
      h("div", { class: "list", "data-guide": "players", style: { marginTop: "8px" } }, ...seatRows(view.players, view.you, "computers").map((r) => h("div", { class: "item" },
        h("div", { class: "seatno" }, String(r.seatNumber)),
        h("span", { class: "grow" }, `${r.name}${r.isYou ? " " + L("you_suffix") : ""}`),
        r.isComputer ? h("span", { class: "botmark", ...(r.firstComputer ? { "data-guide": "botMark" } : {}), title: L("computer"), "aria-label": L("computer") }, icon("robot", 20)) : null,
        view.legal.kick && r.canRemove ? h("button", { class: "icbtn plain", ...(r.firstComputer ? { "data-guide": "botRemove" } : {}), title: L("remove"), "aria-label": L("remove"), disabled: s.busy, onClick: () => store.act("kick", { playerId: r.id }) }, icon("removeCircle", 24)) : null,
      ))),
    ),
    video.connected || video.stalled ? videoPanel(store, view, video) : null,
    errorText(s.error) ? h("div", { class: "error" }, errorText(s.error)) : null,
  );
}

// Leaving a lobby or a finished game gives the seat up; leaving a running game sits out with the
// seat kept. Either way the client goes home; rejoining by name finds the seat again. When the
// last person leaves a lobby the room is emptied at once.
export function leave(store: Store) {
  void store.leave();
}

function videoPanel(store: Store, view: View, video: Video): HTMLElement {
  return h("div", { class: "panel" },
    h("div", { class: "title" }, L("video_title")),
    video.connected
      ? h("div", {},
          h("div", { class: "vrow" }, ...view.players.filter((p) => video.hasVideo(p.id, p.id === view.you)).map((p) => video.monitor(p.id, p.id === view.you, p.name, 96))),
          h("div", { class: "toggles", style: { marginTop: "8px" } }, ...toggles(video, store), soundToggle(video, store)),
        )
      : h("div", { class: "toggles" }, ...toggles(video, store), soundToggle(video, store)),
  );
}

function toggle(name: IconName, on: boolean, label: string, onClick: () => void, disabled = false): HTMLElement {
  return h("button", { class: `toggle ${on ? "on" : "off"}`, title: label, "aria-label": label, disabled, onClick }, icon(name, 22));
}

// Microphone and camera; one reconnect button while the video is paused or has failed.
export function toggles(video: Video, store: Store): HTMLElement[] {
  if (video.stalled) return [toggle("refresh", false, L("video_reconnect"), () => { video.resume(); store.set({}); })];
  return [
    toggle(video.micOn ? "mic" : "micOff", video.micOn, L(video.micOn ? "mic_on" : "mic_off"), () => { video.setMic(!video.micOn); store.set({}); }),
    video.camUsable
      ? toggle(video.camOn ? "videocam" : "videocamOff", video.camOn, L(video.camOn ? "cam_on" : "cam_off"), () => { video.setCam(!video.camOn); store.set({}); })
      : toggle("videocamOff", false, L("camera_unavailable"), () => {}, true),
  ];
}

export function soundToggle(video: Video, store: Store): HTMLElement {
  const on = soundOn();
  return toggle(on ? "volumeUp" : "volumeOff", on, L(on ? "sound_on" : "sound_off"), () => { setSound(!on); video.setSpeaker(!on); if (!on) play("click"); store.set({}); });
}

export function helpScreen(store: Store): HTMLElement {
  const sections = ["idea", "join", "play", "rebuy", "pause", "video"];
  return h("div", { class: "panel help" },
    h("div", { class: "row spread" }, h("h2", {}, L("how_to_play")), h("button", { class: "iconbtn", title: L("done"), "aria-label": L("done"), onClick: () => { play("click"); store.set({ help: false }); } }, "\u2715")),
    ...sections.flatMap((k) => [h("h3", {}, L(`help_${k}_t`)), h("p", {}, L(`help_${k}`))]),
    h("div", { class: "muted" }, L("help_footer")),
  );
}

export function tableScreen(store: Store, s: State, view: View, video: Video): HTMLElement {
  return renderTable(store, s, view, video);
}

// Final standings after a completed or cancelled tournament.
export function endScreen(store: Store, s: State, view: View): HTMLElement {
  const me = view.players.find((p) => p.id === view.you);
  const ranked = [...view.players].filter((p) => p.place !== null).sort((a, b) => (a.place ?? 99) - (b.place ?? 99));
  const unranked = view.players.filter((p) => p.place === null);
  return h("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } },
    showCardsButton(store, s, view),
    h("div", { class: "row", style: { padding: "0 4px", minHeight: "40px" } }, h("h2", {}, roomName(view.roomId))),
    h("div", { class: "banner" }, h("span", { class: "text" }, promptText(view))),
    h("div", { class: "panel" },
      h("div", { class: "row spread", style: { marginBottom: "10px" } },
        h("button", { class: "icbtn ghost", title: L("leave"), "aria-label": L("leave"), disabled: s.busy, onClick: () => leave(store) }, backIcon()),
        me && view.legal.newGame ? h("button", { class: `icbtn gold${s.busy ? "" : " glow"}`, title: L("new_game"), "aria-label": L("new_game"), disabled: s.busy, onClick: () => store.act("newGame") }, icon("login")) : h("span"),
      ),
      h("div", { class: "title" }, L(headingKey(view.status))),
      view.status === "cancelled" ? h("p", { class: "muted" }, L("cancelled_body")) : null,
      h("div", { class: "list" },
        ...resultRows(view.players, view.you).map((r) => {
          const p = view.players.find((q) => q.id === r.id)!;
          const shown = p.cards.flatMap((c, i) => c && (!r.isYou || !view.legal.show.includes(i)) ? [cardEl(c, 32)] : []);
          return h("div", { class: "item" },
            h("div", { class: "seatno" }, r.place === null ? "-" : String(r.place)),
            h("span", { class: "grow" }, `${r.name}${r.isYou ? " " + L("you_suffix") : ""}`),
            // The robot before the amount, so the amounts line up on the right.
            ...(r.showStack ? [r.isComputer ? h("span", { class: "botmark" }, icon("robot", 20)) : null, ...shown, h("span", { class: "muted" }, chips(r.stack))] : [...shown, r.isComputer ? h("span", { class: "botmark" }, icon("robot", 20)) : null, r.rebought ? h("span", { class: "muted" }, L("rebought")) : null]));
        }),
      ),
    ),
    errorText(s.error) ? h("div", { class: "error" }, errorText(s.error)) : null,
  );
}
