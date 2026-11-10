import { expect, it } from "vitest";
import { pokerAdapter } from "../src/adapter";
const adapter = pokerAdapter({ inviteUrl: null, updateUrl: null });
const deps = { now: () => 1000, rng: () => 0.42, newId: () => "test" };
function value<T>(r: { ok: true; value: T } | { ok: false }): T { if (!r.ok) throw new Error("Unexpected failure"); return r.value; }

it("rejects persisted states of another version and restores a saved one exactly", () => {
  expect(() => adapter.restore({}, 1)).toThrow();
  expect(() => adapter.restore(adapter.create(1000), 2)).toThrow();
  const s = adapter.create(1000);
  expect(adapter.restore(JSON.parse(JSON.stringify(s)), 1)).toEqual(s);
});

it("deals through the adapter while redacting opponents, watchers and displays", () => {
  let s = adapter.create(1000);
  s = value(adapter.join(s, "a", "Ann", false, deps)).state;
  s = value(adapter.join(s, "b", "Bob", false, deps)).state;
  s = value(adapter.apply(s, { id: "a", role: "player" }, value(adapter.parseAction({ type: "start" })).action, deps));
  const context = { version: 3, roomId: "casino" };
  const own = adapter.view(s, { id: "a", role: "player" }, { odds: false }, context);
  expect(own.contractVersion).toBe(1);
  expect(own.phase).toBe("betting");
  expect(own.players.find(p => p.id === "a")!.cards.every(Boolean)).toBe(true);
  expect(own.players.find(p => p.id === "b")!.cards).toEqual([null, null]);
  for (const actor of [null, { id: "watch", role: "spectator" as const }]) {
    expect(adapter.view(s, actor, { odds: true }, context).players.every(p => p.cards.every(c => c === null))).toBe(true);
  }
  expect(adapter.apply(s, { id: "display", role: "display" }, value(adapter.parseAction({ type: "cancel" })).action, deps).ok).toBe(false);
  expect(adapter.parseAction({ type: "leave" })).toMatchObject({ ok: true, value: { requiresVersion: false, leaves: true } });
});

it("accepts every betting action and refuses an unknown one", () => {
  for (const body of [{ type: "fold" }, { type: "check" }, { type: "call" }, { type: "bet", to: 100 }, { type: "show", cards: [0] }]) expect(adapter.parseAction(body).ok).toBe(true);
  expect(adapter.parseAction({ type: "bet" }).ok).toBe(false);
  expect(adapter.parseAction({ type: "nope" }).ok).toBe(false);
});
