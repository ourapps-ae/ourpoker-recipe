// Client state: saved name and seat, the live connections, actions, and a simple subscribe.
import { ApiError, api, SERVER, type JoinResponse, type RoomInfo, type View } from "./api";
import { guideOpen } from "./guide";
import { Live } from "../../components/realtime-rooms/web/live";
import { displayCapabilities } from "../../components/display-mode/web/mode";
import { createIdentityStore } from "../../components/guest-identity/web/identity-store";
import { watchRooms, type RoomWatcher } from "../../components/room-directory/web/directory-client";
import { accept } from "../../components/private-views/web/views";
import { betIsAllIn, callIsAllIn } from "../../components/holdem-rules/web/betting";
import { play, type SoundName } from "./sound";
import { publishMode, type SessionMode } from "./mode";

// The name a guest typed and the seat token of each way of taking part (a player, a table viewer),
// kept on this device under the keys this game always used.
const identity = createIdentityStore(localStorage, { nameMinLength: 1, nameMaxLength: 20, tokenRotationSeconds: 0 });
const slotOf = (mode: SessionMode) => (mode === "board" ? "display" : "player");
const savedMode = (): SessionMode => (localStorage.getItem("sessionMode") === "board" ? "board" : "player");

// What each of your own actions sounds like, played as you tap.
const ACTION_SOUND: Record<string, SoundName> = {
  fold: "fold", check: "check", call: "chips", bet: "chips", rebuy: "chips", show: "flip",
  start: "start", newGame: "start", cancel: "end", addBot: "bot_add", kick: "bot_remove", leave: "exit",
  return: "click", sitOut: "click", pause: "click", resume: "click",
};

export type UiError = { code: string | null; message: string | null };

export type State = {
  mode: SessionMode;
  roomDown: boolean;
  name: string;
  token: string | null;
  roomId: string | null;
  view: View | null;
  // When the view arrived, so countdowns and the settle can run from its remaining times.
  viewAt: number;
  rooms: RoomInfo[] | null;
  // The last room list request failed: the server cannot be reached.
  roomsDown: boolean;
  error: UiError | null;
  busy: boolean;
  previewRoom: string;
  help: boolean;
  editingName: boolean;
  video: JoinResponse["video"];
  // Bet slider value while choosing an amount; null when the bar is closed.
  betTo: number | null;
  showHistory: boolean;
  // The possible-hands panel under the table; remembered on this device, open by default.
  handPanel: boolean;
};

type Listener = (s: State) => void;

export class Store {
  state: State = {
    mode: savedMode(),
    roomDown: false,
    name: identity.name(),
    token: identity.session(slotOf(savedMode()))?.token ?? null,
    roomId: identity.session(slotOf(savedMode()))?.roomId ?? null,
    view: null,
    viewAt: 0,
    rooms: null,
    roomsDown: false,
    error: null,
    busy: false,
    previewRoom: identity.session(slotOf(savedMode()))?.roomId ?? "casino",
    help: false,
    editingName: false,
    video: null,
    betTo: null,
    showHistory: false,
    handPanel: localStorage.getItem("handPanel") !== "closed",
  };
  private listeners: Listener[] = [];
  // The room's live connection while seated, and the home list's while the home screen shows.
  private live: Live | null = null;
  private home: RoomWatcher | null = null;
  // The play clock this device holds for everyone: while cards are looked at large at the end
  // of a hand, or a guide is open at the table.
  private hold: "look" | "learn" | null = null;
  private looking = false;
  private generation = 0;

  selectMode(mode: SessionMode) {
    if (mode === this.state.mode) return;
    const { mode: oldMode, token, roomId } = this.state;
    this.generation++;
    this.live?.close();
    this.live = null;
    this.hold = null;
    this.looking = false;
    if (oldMode === "board" && token && roomId) {
      void api.displayLeave(roomId, token).catch(() => {});
      identity.clearSession("display");
    }
    localStorage.setItem("sessionMode", mode);
    publishMode(mode);
    this.set({ mode, token: null, roomId: null, view: null, video: null, busy: false, error: null, betTo: null, showHistory: false, help: false, editingName: false, roomDown: false });
  }

  subscribe(fn: Listener) {
    this.listeners.push(fn);
    fn(this.state);
  }

  set(patch: Partial<State>) {
    if (patch.view !== undefined && patch.view !== this.state.view) patch = { ...patch, viewAt: Date.now() };
    // The bet bar closes once betting is no longer open to you.
    if (patch.view !== undefined && !patch.view?.legal.bet) patch = { ...patch, betTo: null };
    this.state = { ...this.state, ...patch };
    if (patch.view !== undefined) this.updateHold();
    for (const l of this.listeners) l(this.state);
  }

  // Cards are being looked at large (zoomed).
  setLooking(on: boolean) {
    this.looking = on;
    this.updateHold();
  }

  updateHold() {
    const v = this.state.view;
    const want = this.state.mode === "board" || !v || v.status !== "running" || v.display ? null : guideOpen() ? "learn" : this.looking && v.phase === "handOver" ? "look" : null;
    if (want === this.hold) return;
    this.hold = want;
    this.live?.send(JSON.stringify({ type: "hold", kind: want }));
  }

  // The home list, live while the home screen shows. Only a changed list re-renders, so a tap
  // is not lost to a rebuilt button. A failed connection says the server cannot be reached.
  watchRooms(on: boolean) {
    if (on && !this.home) {
      this.home = watchRooms(
        (path, hello, onMessage, onDown) => new Live(SERVER, path, hello, onMessage, onDown),
        ({ rooms, down }) => this.set({ rooms: rooms as RoomInfo[] | null, roomsDown: down }),
      );
    } else if (!on && this.home) {
      this.home.stop();
      this.home = null;
    }
  }

  // The possible hands come with every view while the panel is open; the room is told at once.
  toggleHandPanel() {
    if (this.state.mode !== "player") return;
    const open = !this.state.handPanel;
    localStorage.setItem("handPanel", open ? "open" : "closed");
    this.set({ handPanel: open });
    this.live?.send(JSON.stringify({ type: "odds", on: open }));
  }

  setName(name: string) {
    const saved = identity.setName(name);
    if (saved !== null) this.set({ name: saved, editingName: false });
  }

  // The seat token this device holds for a room, or null: the only way back to a seat.
  seatToken(roomId: string): string | null {
    const session = identity.session("player");
    return session && session.roomId === roomId ? session.token : null;
  }

  // Joining, and rejoining on a reload with the seat token kept: one call gives the seat token, the view and the video grant.
  async join(roomId: string) {
    if (this.state.mode === "board") return this.joinBoard(roomId);
    if (!this.state.name) return this.set({ editingName: true });
    const generation = this.beginJoin(roomId);
    play("enter");
    try {
      const r = await api.join(roomId, this.state.name, this.seatToken(roomId) ?? undefined);
      if (generation !== this.generation) return;
      identity.saveSession("player", { token: r.token, roomId });
      this.set({ token: r.token, roomId, view: r.view, video: r.video, busy: false, betTo: null });
      this.openRoom();
    } catch (e) {
      if (generation !== this.generation) return;
      this.set({ busy: false, error: toError(e) });
    }
  }

  async resume() {
    publishMode(this.state.mode);
    if (this.state.mode === "board") {
      if (this.state.roomId) {
        if (this.state.token) this.openRoom();
        else await this.joinBoard(this.state.roomId);
      }
      return;
    }
    if (this.state.token && this.state.roomId && this.state.name) await this.join(this.state.roomId);
  }

  private beginJoin(roomId: string) {
    const generation = ++this.generation;
    const old = this.state;
    this.live?.close();
    this.live = null;
    this.hold = null;
    this.looking = false;
    if (old.mode === "board" && old.token && old.roomId) void api.displayLeave(old.roomId, old.token).catch(() => {});
    this.set({ token: null, roomId, previewRoom: roomId, view: null, video: null, busy: true, error: null, betTo: null, showHistory: false, help: false, roomDown: false });
    return generation;
  }

  async joinBoard(roomId: string) {
    this.selectMode("board");
    const generation = this.beginJoin(roomId);
    identity.clearSession("display");
    try {
      const r = await api.display(roomId);
      if (generation !== this.generation) {
        void api.displayLeave(roomId, r.token).catch(() => {});
        return;
      }
      if (!r.view.display) throw new Error("Expected a public table view");
      identity.saveSession("display", { token: r.token, roomId });
      this.set({ token: r.token, roomId, view: r.view, video: null, busy: false });
      this.openRoom();
    } catch (e) {
      if (generation === this.generation) this.set({ busy: false, error: toError(e), roomDown: true });
    }
  }

  async leave() {
    const { mode, token, roomId } = this.state;
    if (mode === "board") {
      this.signOut();
      if (token && roomId) await api.displayLeave(roomId, token).catch(() => {});
      return;
    }
    const generation = this.generation;
    await this.act("leave");
    if (generation === this.generation) this.signOut();
  }

  async act(type: string, fields: Record<string, unknown> = {}) {
    if (!displayCapabilities(this.state.mode === "board").canAct) return;
    const generation = this.generation;
    const { token, roomId, view } = this.state;
    if (!token || !roomId || !view) return;
    const me = view.players.find((p) => p.id === view.you);
    const allIn = !!me && ((type === "call" && callIsAllIn(view.legal.call ?? 0, me.stack)) || (type === "bet" && betIsAllIn(Number(fields.to), me.stack, me.bet)));
    const sound = allIn ? "allin" : ACTION_SOUND[type];
    if (sound) play(sound);
    // Leaving ends the room's connection first, so its goodbye is not taken for a reset table.
    if (type === "leave") { this.live?.close(); this.live = null; }
    this.set({ busy: true, error: null, betTo: null });
    try {
      const v = await api.action(roomId, token, view.version, type, fields, this.state.handPanel);
      if (generation !== this.generation) return;
      this.set({ view: newer(v, this.state.view), busy: false });
    } catch (e) {
      if (generation !== this.generation) return;
      if (e instanceof ApiError && e.status === 401) return this.signOut({ code: "tableReset", message: null });
      if (e instanceof ApiError && e.code === "staleVersion") return this.set({ busy: false, view: newer(e.view ?? view, this.state.view) });
      this.set({ busy: false, error: toError(e) });
    }
  }

  // Hidden tab: close the connections, which tells the table we are away. Shown again:
  // reconnect; the table sends its view at once.
  sleep() {
    this.live?.close();
    this.home?.sleep();
  }
  wake() {
    if (this.state.token && this.state.roomId) (this.live ?? this.openRoom())?.open();
    this.home?.wake();
  }

  signOut(error: UiError | null = null) {
    this.generation++;
    this.live?.close();
    this.live = null;
    identity.clearSession(slotOf(this.state.mode));
    this.hold = null;
    this.looking = false;
    this.set({ token: null, roomId: null, view: null, video: null, error, busy: false, betTo: null, showHistory: false, roomDown: false });
  }

  // The room's live connection: it says who we are (and whether the possible hands are wanted),
  // then every change arrives as a view.
  private openRoom(): Live | null {
    this.live?.close();
    const { token, roomId, mode } = this.state;
    const generation = this.generation;
    if (!token || !roomId) return (this.live = null);
    this.live = new Live(SERVER, `/r/${roomId}/ws`, () => JSON.stringify({ type: "hello", token, odds: mode === "player" && this.state.handPanel, hold: mode === "player" ? this.hold : null }), (m) => {
      if (generation !== this.generation) return;
      if (m.type === "error") {
        if (mode === "board") { void this.joinBoard(roomId); return; }
        return this.signOut({ code: "tableReset", message: null });
      }
      if (m.type !== "view") return;
      const shown = accept(m.view as View, this.state.view, mode === "board" ? "display" : "player");
      if (shown !== this.state.view) this.set({ view: shown });
    }, (roomDown) => { if (generation === this.generation && roomDown !== this.state.roomDown) this.set({ roomDown }); });
    this.live.open();
    return this.live;
  }
}

// A view only replaces one from the same room and game with a lower version: an action's reply
// and the pushed view can arrive in either order.
function newer(v: View, current: View | null): View {
  return accept(v, current, v.display ? "display" : "player") ?? (current as View);
}

function toError(e: unknown): UiError {
  if (e instanceof ApiError) return { code: e.code, message: e.message };
  return { code: "network", message: e instanceof Error ? e.message : null };
}
