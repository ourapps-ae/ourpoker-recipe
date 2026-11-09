import assert from "node:assert/strict";
import { test } from "node:test";
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.document = Object.assign(new EventTarget(), { documentElement: { dataset: {} }, body: { append() {} } });
globalThis.window = Object.assign(new EventTarget(), { setTimeout, setInterval });
const { Video: ComponentVideo } = await import("../../components/video-calls/web/video.ts");
const { publishMode, canCapture, modeEvent } = await import("../src/mode.ts");
const { soundOn } = await import("../src/sound.ts");
class Video extends ComponentVideo {
  constructor(changed) { super(changed, { canCapture, modeEvent, soundOn }); }
}
const { Room, RoomEvent, Track } = await import("./fake-livekit.mjs");
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { resolve, promise }; };

test("a delayed media connection cannot subscribe or capture after Board entry", async () => {
  publishMode("player");
  const pending = deferred();
  Room.connecting = pending.promise;
  const video = new Video(() => {});
  const connecting = video.connect("url", "token", "room");
  const room = Room.all.at(-1);
  publishMode("board");
  pending.resolve();
  await connecting;
  assert.equal(video.room, null);
  assert.equal(video.connected, false);
  assert.deepEqual(room.microphoneCalls, []);
  assert.deepEqual(room.cameraCalls, []);
  let attached = false;
  room.handlers.get(RoomEvent.TrackSubscribed)({ kind: Track.Kind.Audio, attach() { attached = true; }, detach() { return []; } }, {}, { identity: "other" });
  assert.equal(attached, false);
  video.resume();
  assert.equal(Room.all.at(-1), room);
});

test("a delayed microphone permission stops before camera after Board entry", async () => {
  publishMode("player");
  Room.connecting = null;
  const pending = deferred();
  Room.microphone = pending.promise;
  const video = new Video(() => {});
  const connecting = video.connect("url", "token", "room");
  await new Promise(setImmediate);
  const room = Room.all.at(-1);
  assert.deepEqual(room.microphoneCalls, [true]);
  publishMode("board");
  pending.resolve();
  await connecting;
  assert.ok(room.stopped > 0);
  assert.ok(room.disconnected >= 2);
  assert.deepEqual(room.cameraCalls, []);
  assert.equal(video.room, null);
  await video.setMic(true);
  await video.setCam(true);
  assert.deepEqual(room.microphoneCalls, [true]);
  assert.deepEqual(room.cameraCalls, []);
  video.disconnect();
  Room.microphone = null;
});

test("a delayed camera permission cannot attach capture after Board entry", async () => {
  publishMode("player");
  const pending = deferred();
  Room.camera = pending.promise;
  const video = new Video(() => {});
  const connecting = video.connect("url", "token", "room");
  await new Promise(setImmediate);
  const room = Room.all.at(-1);
  assert.deepEqual(room.cameraCalls, [true]);
  publishMode("board");
  pending.resolve();
  await connecting;
  assert.equal(video.room, null);
  assert.equal(video.connected, false);
  assert.ok(room.disconnected >= 2);
  video.disconnect();
  Room.camera = null;
});

test("missing or denied Player capture devices do not block the media connection", async () => {
  publishMode("player");
  Room.denied = true;
  const video = new Video(() => {});
  await video.connect("url", "token", "room");
  assert.equal(video.connected, true);
  assert.equal(video.micOn, false);
  assert.equal(video.camOn, false);
  assert.equal(video.camUsable, false);
  video.disconnect();
  Room.denied = false;
});

const audioTrack = () => {
  const el = { muted: false, srcObject: null, pause() {}, remove() {} };
  return { el, track: { kind: Track.Kind.Audio, attach: () => el, detach: () => [el] } };
};

test("sounds off mutes other players' voices, including ones that arrive later", async () => {
  publishMode("player");
  const { setSound } = await import("../src/sound.ts");
  const video = new Video(() => {});
  await video.connect("url", "token", "room");
  const room = Room.all.at(-1);
  const first = audioTrack();
  room.emit(RoomEvent.TrackSubscribed, first.track, {}, { identity: "other" });
  assert.equal(first.el.muted, false);
  setSound(false);
  video.setSpeaker(false);
  assert.equal(first.el.muted, true);
  const later = audioTrack();
  room.emit(RoomEvent.TrackSubscribed, later.track, {}, { identity: "third" });
  assert.equal(later.el.muted, true);
  setSound(true);
  video.setSpeaker(true);
  assert.equal(first.el.muted, false);
  assert.equal(later.el.muted, false);
  assert.deepEqual(room.microphoneCalls, [true]);
  video.disconnect();
});

test("a failed connection keeps the grant and resume() retries it", async () => {
  publishMode("player");
  Room.failing = true;
  const warn = console.warn;
  console.warn = () => {};
  const video = new Video(() => {});
  await video.connect("url", "token", "room");
  console.warn = warn;
  assert.equal(video.connected, false);
  assert.equal(video.failed, true);
  assert.equal(video.granted, true);
  assert.equal(video.stalled, true);
  const before = Room.all.length;
  Room.failing = false;
  video.resume();
  await new Promise(setImmediate);
  assert.equal(Room.all.length, before + 1);
  assert.equal(video.connected, true);
  assert.equal(video.stalled, false);
  video.disconnect();
  assert.equal(video.granted, false);
  assert.equal(video.stalled, false);
});
