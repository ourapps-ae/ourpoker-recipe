import assert from "node:assert/strict";
import { test } from "node:test";
const saved = new Map();
globalThis.localStorage = { getItem: (key) => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
globalThis.document = Object.assign(new EventTarget(), { documentElement: { dataset: {} }, baseURI: "http://localhost/" });
globalThis.window = new EventTarget();
let contexts = 0, fetches = 0, sources = 0, starts = 0, stops = 0;
let resolveFetch;
globalThis.fetch = async () => {
  fetches++;
  await new Promise((done) => { resolveFetch = done; });
  return { arrayBuffer: async () => new ArrayBuffer(1) };
};
globalThis.AudioContext = class {
  state = "running";
  constructor() { contexts++; }
  decodeAudioData() { return {}; }
  createBufferSource() { sources++; return { connect() {}, start() { starts++; }, stop() { stops++; } }; }
};
const { publishMode } = await import("../src/mode.ts");
const { play, setSound, soundOn } = await import("../src/sound.ts");

test("Board does not initialize, request or play sounds, including delayed loads", async () => {
  publishMode("board");
  document.dispatchEvent(new Event("pointerdown"));
  play("deal");
  assert.equal(contexts, 0);
  assert.equal(fetches, 0);
  publishMode("player");
  document.dispatchEvent(new Event("pointerdown"));
  play("deal", 500);
  assert.equal(fetches, 1);
  publishMode("board");
  resolveFetch();
  await new Promise(setImmediate);
  assert.equal(sources, 0);
  assert.equal(starts, 0);
  play("deal");
  assert.equal(fetches, 1);
});

test("Board entry stops already scheduled Player sounds", async () => {
  publishMode("player");
  play("deal", 500);
  await new Promise(setImmediate);
  assert.equal(starts, 1);
  publishMode("board");
  assert.equal(stops, 1);
});

test("sounds off is remembered, stops what is playing and keeps play() silent", async () => {
  publishMode("player");
  assert.equal(soundOn(), true);
  play("deal", 500);
  await new Promise(setImmediate);
  const started = starts;
  const stopped = stops;
  setSound(false);
  assert.equal(saved.get("sound"), "off");
  assert.equal(soundOn(), false);
  assert.equal(stops, stopped + 1);
  play("deal");
  await new Promise(setImmediate);
  assert.equal(starts, started);
  setSound(true);
  assert.equal(saved.get("sound"), "on");
  play("deal");
  await new Promise(setImmediate);
  assert.equal(starts, started + 1);
});
