import { expect, it } from "vitest";
import { pokerAdapter } from "../src/adapter";
import { settings } from "../src/settings";

// A server hand without a network: two people sit and the host starts (with fill-empty the computers take the other seats);
// the people fold whenever it is their turn and the computers play when their time comes, until the hand is over with every
// chip accounted for.
const adapter = pokerAdapter({ inviteUrl: null, updateUrl: null });
let seed = 7;
let time = 1_700_000_000_000;
const deps = { now: () => time, rng: () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000), newId: () => "x" };
const must = <T>(r: { ok: true; value: T } | { ok: false; error?: unknown }): T => { if (!r.ok) throw new Error(JSON.stringify(r)); return r.value; };
const context = { version: 1, roomId: "casino" };
const people = ["a", "b"];

it("plays a hand to its end", () => {
  let s = adapter.create(deps.now());
  s = must(adapter.join(s, "a", "Ann", false, deps)).state;
  s = must(adapter.join(s, "b", "Bob", false, deps)).state;
  s = must(adapter.apply(s, { id: "a", role: "player" }, must(adapter.parseAction({ type: "start" })).action, deps));
  const before = adapter.view(s, { id: "a", role: "player" }, { odds: false }, context);
  expect(before.status).toBe("running");
  expect(before.players.length).toBe(settings.computerPlayers === "fill-empty" ? settings.maximumPlayers : 2);
  expect(before.hand!.sb).toBe(25);
  expect(before.hand!.bb).toBe(50);
  for (let step = 0; step < 500; step++) {
    const v = adapter.view(s, { id: "a", role: "player" }, { odds: false }, context);
    if (v.phase === "handOver") break;
    const actor = v.hand?.actorId ?? null;
    for (const id of people) s = adapter.presence(s, { type: "request-seen", id }, deps).state;
    if (actor && people.includes(actor) && v.phase === "betting") s = must(adapter.apply(s, { id: actor, role: "player" }, must(adapter.parseAction({ type: "fold" })).action, deps));
    else { time += 1_000; s = adapter.advance(s, deps).state; }
  }
  const after = adapter.view(s, { id: "a", role: "player" }, { odds: false }, context);
  expect(after.phase).toBe("handOver");
  expect(after.lastResult).toMatchObject({ voided: false });
  expect(after.players.reduce((n, p) => n + p.stack + p.bet, 0)).toBe(after.players.length * settings.startingStack);
  expect(["handWon", "handSplit"]).toContain(after.promptKey);
});
