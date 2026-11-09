import assert from "node:assert/strict";
import { test } from "node:test";

class Storage extends Map {
  getItem(key) { return this.get(key) ?? null; }
  setItem(key, value) { this.set(key, String(value)); }
  removeItem(key) { this.delete(key); }
}
const events = new EventTarget();
globalThis.localStorage = new Storage();
globalThis.window = Object.assign(events, { setTimeout, setInterval });
globalThis.document = { documentElement: { dataset: {} }, addEventListener() {} };
globalThis.cancelAnimationFrame = () => {};
class Socket {
  static OPEN = 1;
  static all = [];
  readyState = 1;
  messages = [];
  constructor(url) { this.url = url; Socket.all.push(this); }
  send(text) { this.messages.push(JSON.parse(text)); }
  close() { this.onclose?.(); }
  message(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
}
globalThis.WebSocket = Socket;
const { Store } = await import("../src/store.ts");
const { api, ApiError } = await import("../src/api.ts");
const { sessionMode } = await import("../src/mode.ts");
const { want, guideOpen } = await import("../src/guide.ts");
const { play } = await import("../src/sound.ts");

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const view = (display, version = 1, roomId = "home") => ({ display, you: display ? "" : "private-player", odds: display ? null : [{ category: "private" }], roomId, version, status: "lobby", players: [], legal: {} });
let playerJoins, displayJoins, actions, leaves;
function setup() {
  localStorage.clear();
  localStorage.setItem("name", "Alice");
  Socket.all.length = 0;
  playerJoins = 0; displayJoins = 0; actions = 0; leaves = [];
  api.join = async (room) => { playerJoins++; return { token: "private-token", view: view(false, 1, room), video: { token: "private-video" } }; };
  api.display = async (room) => { displayJoins++; return { token: `board-${displayJoins}`, view: view(true, 1, room) }; };
  api.displayLeave = async (room, token) => { leaves.push([room, token]); return { ok: true }; };
  api.action = async () => { actions++; return view(false, 2); };
  return new Store();
}

test("Board joins without a name, does not subscribe odds/holds and cannot act", async () => {
  const store = setup();
  store.setName("");
  store.selectMode("board");
  await store.join("home");
  const ws = Socket.all.at(-1);
  ws.onopen();
  assert.equal(playerJoins, 0);
  assert.equal(store.state.video, null);
  assert.equal(store.state.view.you, "");
  assert.equal(store.state.view.odds, null);
  assert.deepEqual(ws.messages, [{ type: "hello", token: "board-1", odds: false, hold: null }]);
  store.toggleHandPanel(); store.setLooking(true); await store.act("start");
  assert.equal(actions, 0);
  assert.equal(ws.messages.length, 1);
  localStorage.setItem("beginner", "true");
  want("table"); play("deal");
  assert.equal(guideOpen(), false);
  store.signOut();
});

test("delayed Player join cannot overwrite Board or saved credentials", async () => {
  const store = setup();
  const pending = deferred();
  api.join = () => { playerJoins++; return pending.promise; };
  const joining = store.join("casino");
  store.selectMode("board");
  assert.equal(store.state.view, null);
  await store.joinBoard("home");
  pending.resolve({ token: "leaked-token", view: view(false), video: { token: "leaked-video" } });
  await joining;
  assert.equal(store.state.mode, "board");
  assert.equal(store.state.token, "board-1");
  assert.equal(localStorage.getItem("token"), null);
  assert.equal(store.state.video, null);
  store.signOut();
});

test("a failed old Player join cannot replace the Board error or session", async () => {
  const store = setup();
  const pending = deferred();
  api.join = () => pending.promise;
  const joining = store.join("home");
  await store.joinBoard("casino");
  pending.reject(new ApiError(401, "badToken", "Old Player request"));
  await joining;
  assert.equal(store.state.mode, "board");
  assert.equal(store.state.token, "board-1");
  assert.equal(store.state.error, null);
  store.signOut();
});

test("Board restoration without its token never falls back to saved Player credentials", async () => {
  setup();
  localStorage.setItem("sessionMode", "board");
  localStorage.setItem("boardRoomId", "casino");
  localStorage.setItem("token", "saved-player-token");
  localStorage.setItem("roomId", "home");
  const store = new Store();
  await store.resume();
  assert.equal(playerJoins, 0);
  assert.equal(displayJoins, 1);
  assert.equal(store.state.view.display, true);
  assert.equal(localStorage.getItem("token"), "saved-player-token");
  const ws = Socket.all.at(-1);
  ws.message({ type: "view", view: view(false, 999) });
  assert.equal(store.state.view.display, true);
  store.signOut();
});

test("an old Board join failure cannot alter a new Player session", async () => {
  const store = setup();
  const pending = deferred();
  api.display = () => pending.promise;
  const joining = store.joinBoard("casino");
  store.selectMode("player");
  await store.join("home");
  pending.reject(new Error("Old Board request"));
  await joining;
  assert.equal(store.state.mode, "player");
  assert.equal(store.state.view.display, false);
  assert.equal(store.state.error, null);
  store.signOut();
});

test("delayed action and closed socket cannot restore private cards after mode switch", async () => {
  const store = setup();
  await store.join("home");
  const old = Socket.all.at(-1);
  old.onopen();
  const pending = deferred();
  api.action = () => pending.promise;
  const acting = store.act("check");
  store.selectMode("board");
  assert.equal(store.state.view, null);
  assert.equal(store.state.video, null);
  assert.equal(store.state.betTo, null);
  await store.joinBoard("casino");
  old.message({ type: "view", view: view(false, 99) });
  pending.resolve(view(false, 100));
  await acting;
  assert.equal(store.state.view.display, true);
  assert.equal(store.state.roomId, "casino");
  assert.equal(store.state.view.odds, null);
  store.signOut();
});

test("Board restores credentials, recovers an expired token only through display and preserves Player seat", async () => {
  const first = setup();
  await first.join("home");
  first.selectMode("board");
  await first.joinBoard("casino");
  first.sleep();
  const restored = new Store();
  await restored.resume();
  assert.equal(playerJoins, 1);
  assert.equal(displayJoins, 1);
  const ws = Socket.all.at(-1);
  ws.onopen();
  assert.equal(ws.messages[0].token, "board-1");
  ws.message({ type: "error", error: "badToken" });
  await new Promise(setImmediate);
  assert.equal(displayJoins, 2);
  assert.equal(playerJoins, 1);
  await restored.leave();
  assert.equal(localStorage.getItem("token"), "private-token");
  assert.equal(localStorage.getItem("boardToken"), null);
  assert.equal(actions, 0);
  assert.ok(leaves.some(([, token]) => token === "board-2"));
  first.signOut();
});

test("overlapping Board rooms discard and release a delayed token", async () => {
  const store = setup();
  const pending = deferred();
  const normal = api.display;
  api.display = (room) => room === "home" ? pending.promise : normal(room);
  const older = store.joinBoard("home");
  await store.joinBoard("casino");
  pending.resolve({ token: "discarded-board", view: view(true) });
  await older;
  assert.equal(store.state.roomId, "casino");
  assert.ok(leaves.some(([, token]) => token === "discarded-board"));
  store.signOut();
});

test("a failed stale action cannot sign out a new Board session", async () => {
  const store = setup();
  await store.join("home");
  const pending = deferred();
  api.action = () => pending.promise;
  const action = store.act("leave");
  await store.joinBoard("casino");
  pending.reject(new Error("old connection failed"));
  await action;
  assert.equal(store.state.mode, "board");
  assert.equal(store.state.error, null);
  assert.equal(sessionMode(), "board");
  store.signOut();
});

test("Player odds and ordinary action behavior remains available", async () => {
  const store = setup();
  store.selectMode("board");
  store.selectMode("player");
  await store.join("home");
  const ws = Socket.all.at(-1);
  ws.onopen();
  assert.equal(ws.messages[0].odds, true);
  store.toggleHandPanel();
  assert.deepEqual(ws.messages.at(-1), { type: "odds", on: false });
  await store.act("check");
  assert.equal(actions, 1);
  assert.equal(store.state.view.version, 2);
  store.signOut();
});

test("the bet amount closes when a view no longer offers a bet", async () => {
  const store = setup();
  await store.join("home");
  const ws = Socket.all.at(-1);
  try {
    ws.message({ type: "view", view: { ...view(false, 2), legal: { bet: { min: 20, max: 100 } } } });
    store.set({ betTo: 40 });
    assert.equal(store.state.betTo, 40);
    ws.message({ type: "view", view: view(false, 3) });
    assert.equal(store.state.betTo, null);
  } finally {
    store.signOut();
  }
});
