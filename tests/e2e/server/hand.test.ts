import { expect, it } from "vitest";
import { pokerAdapter } from "../src/adapter";

// A server hand without a network: two people sit, the host starts, the player to act folds, and
// the hand is over with every chip accounted for.
const adapter = pokerAdapter({ inviteUrl: null, updateUrl: null });
let seed = 7;
const deps = { now: () => 1_700_000_000_000, rng: () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000), newId: () => "x" };
const must = <T>(r: { ok: true; value: T } | { ok: false; error?: unknown }): T => { if (!r.ok) throw new Error(JSON.stringify(r)); return r.value; };
const context = { version: 1, roomId: "casino" };

it("plays a hand to its end when the player to act folds", () => {
  let s = adapter.create(deps.now());
  s = must(adapter.join(s, "a", "Ann", false, deps)).state;
  s = must(adapter.join(s, "b", "Bob", false, deps)).state;
  s = must(adapter.apply(s, { id: "a", role: "player" }, must(adapter.parseAction({ type: "start" })).action, deps));
  const before = adapter.view(s, { id: "a", role: "player" }, { odds: false }, context);
  expect(before.status).toBe("running");
  expect(before.hand!.sb).toBe(25);
  expect(before.hand!.bb).toBe(50);
  const actor = before.hand!.actorId!;
  s = must(adapter.apply(s, { id: actor, role: "player" }, must(adapter.parseAction({ type: "fold" })).action, deps));
  const after = adapter.view(s, { id: "a", role: "player" }, { odds: false }, context);
  expect(after.phase).toBe("handOver");
  expect(after.lastResult).toMatchObject({ uncontested: true, voided: false });
  expect(after.players.reduce((n, p) => n + p.stack + p.bet, 0)).toBe(10_000);
  expect(after.promptKey).toBe("handWon");
  expect(after.prompt).toMatch(/Ann|Bob/);
});
