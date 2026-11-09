import { SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { JoinResponse, RoomInfo, View } from "../src/contract";
import { allowed } from "../src/index";
import { settings } from "../src/settings";

const BASE = "https://poker.test/r/casino";
const ROOT = "https://poker.test";

async function post(path: string, body: unknown, token?: string) {
  return SELF.fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

async function join(name: string): Promise<JoinResponse> {
  const r = await post("/join", { name });
  expect(r.status).toBe(200);
  return (await r.json()) as JoinResponse;
}

async function act(token: string, action: Record<string, unknown>, expectedVersion: number) {
  return post("/action", { ...action, expectedVersion }, token);
}

async function state(token: string, since?: number): Promise<View> {
  const r = await SELF.fetch(`${BASE}/state${since === undefined ? "" : `?since=${since}`}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(r.status).toBe(200);
  return (await r.json()) as View;
}

async function ok(token: string, action: Record<string, unknown>): Promise<View> {
  const v = await state(token);
  const r = await act(token, action, v.version);
  const body = (await r.json()) as View & { error?: string; message?: string };
  expect(r.status, `${action.type}: ${body.error} ${body.message}`).toBe(200);
  return body;
}

// Wipe the room's and the directory's storage and restart them so each test starts empty.
async function reset() {
  const { env, runInDurableObject } = await import("cloudflare:test");
  for (const stub of [env.ROOM.get(env.ROOM.idFromName("casino")), env.DIRECTORY.get(env.DIRECTORY.idFromName("home"))]) {
    await runInDurableObject(stub, async (_i, s) => {
      await s.storage.deleteAll();
      s.abort("reset");
    }).catch(() => undefined);
  }
}

describe("room", () => {
  beforeEach(reset);

  it("applies the configured update setting to invitations and the update route", async () => {
    const player = await join("Ann");
    const display = await (await post("/display", {})).json() as { view: View };
    if (settings.updatesEnabled) {
      expect(player.view.inviteUrl).toMatch(/^https?:\/\//);
      expect(player.view.updateUrl).toMatch(/\/latest$/);
      expect(display.view.inviteUrl).toBe(player.view.inviteUrl);
      expect(display.view.updateUrl).toBe(player.view.updateUrl);
    } else {
      expect(player.view.inviteUrl).toBeNull();
      expect(player.view.updateUrl).toBeNull();
      expect(display.view.inviteUrl).toBeNull();
      expect(display.view.updateUrl).toBeNull();
      expect((await SELF.fetch(ROOT + "/update")).status).toBe(404);
    }
  });

  it("lists the two rooms and tracks joins", async () => {
    const empty = (await (await SELF.fetch(ROOT + "/rooms")).json()) as RoomInfo[];
    expect(empty.map((t) => t.id)).toEqual(["casino", "home"]);
    expect(empty[0]).toEqual({ id: "casino", status: "lobby", playerCount: 0, names: [] });
    await join("Ann");
    const one = (await (await SELF.fetch(ROOT + "/rooms")).json()) as RoomInfo[];
    expect(one[0]).toEqual({ id: "casino", status: "lobby", playerCount: 1, names: ["Ann"] });
    expect((await SELF.fetch(ROOT + "/r/attic/state")).status).toBe(404);
    expect(await (await SELF.fetch(ROOT + "/health")).json()).toEqual({ ok: true, app: settings.applicationId });
  });

  it("seats players, starts a game and deals", async () => {
    const a = await join("Ann");
    const b = await join("Bob");
    expect(a.spectator).toBe(false);
    expect(a.view.legal.start).toBe(false);
    let v = await ok(a.token, { type: "addBot" });
    expect(v.players.map((p) => p.name)).toEqual(["Ann", "Bob", "Robin"]);
    v = await ok(a.token, { type: "start" });
    expect(v.status).toBe("running");
    expect(v.hostId).toBe(a.playerId);
    const me = v.players.find((p) => p.id === a.playerId)!;
    expect(me.cards.length).toBe(2);
    expect(me.cards.every((c) => c !== null)).toBe(true);
    const bv = await state(b.token);
    expect(bv.players.find((p) => p.id === a.playerId)!.cards).toEqual([null, null]);
    expect(bv.hand!.sb).toBe(25);
  });

  it("rejects stale versions, malformed bodies and rule breaks with the right codes", async () => {
    const a = await join("Ann");
    const v = await state(a.token);
    const stale = await act(a.token, { type: "addBot" }, v.version - 1);
    expect(stale.status).toBe(409);
    const body = (await stale.json()) as { error: string; view: View };
    expect(body.error).toBe("staleVersion");
    expect(body.view.you).toBe(a.playerId);
    expect((await act(a.token, { type: "bet" }, v.version)).status).toBe(400);
    const rule = await act(a.token, { type: "start" }, v.version);
    expect(rule.status).toBe(422);
    expect(((await rule.json()) as { error: string }).error).toBe("notEnoughPlayers");
    expect((await SELF.fetch(BASE + "/state", { headers: { authorization: "Bearer nope" } })).status).toBe(401);
  });

  it("re-issues the token on rejoin and makes late arrivals spectators", async () => {
    const a = await join("Ann");
    const b = await join("Bob");
    await ok(a.token, { type: "start" });
    const again = await join("Bob");
    expect(again.playerId).toBe(b.playerId);
    expect(again.spectator).toBe(false);
    expect((await SELF.fetch(BASE + "/state", { headers: { authorization: `Bearer ${b.token}` } })).status).toBe(401);
    const s = await join("Sam");
    expect(s.spectator).toBe(true);
    expect(s.view.promptKey).toBe("watching");
    expect(s.view.players.every((p) => p.cards.every((c) => c === null))).toBe(true);
    expect((await act(s.token, { type: "fold" }, s.view.version)).status).toBe(422);
    const v = await ok(s.token, { type: "leave" });
    expect(v.you).toBe(s.playerId);
    expect((await SELF.fetch(BASE + "/state", { headers: { authorization: `Bearer ${s.token}` } })).status).toBe(401);
  });

  it("answers a long poll that waited in vain with the clocks as they are now", async () => {
    const a = await join("Ann");
    await join("Bob");
    const v = await ok(a.token, { type: "start" });
    const h = v.hand!;
    expect(h.settleMs).toBeGreaterThan(1500);
    const t0 = Date.now();
    const w = await state(a.token, v.version);
    const waited = Date.now() - t0;
    expect(waited).toBeGreaterThanOrEqual(1400);
    expect(w.version).toBe(v.version);
    // Both countdowns moved on by the wait, not frozen at the moment the poll began.
    expect(w.hand!.settleMs!).toBeLessThanOrEqual(h.settleMs! - waited + 200);
    expect(w.hand!.remainingMs!).toBeLessThanOrEqual(h.remainingMs! - waited + 200);
  });

  it("lets a display read the table without a seat, a name or any say in the game", async () => {
    const r = await post("/display", {});
    expect(r.status).toBe(200);
    const d = (await r.json()) as { token: string; view: View };
    expect(d.view.display).toBe(true);
    expect(d.view.you).toBe("");
    expect(d.view.promptKey).toBe("lobbyWaiting");
    const a = await join("Ann");
    await join("Bob");
    expect(a.view.display).toBe(false);
    const rooms = (await (await SELF.fetch(ROOT + "/rooms")).json()) as RoomInfo[];
    expect(rooms[0].playerCount).toBe(2);
    await ok(a.token, { type: "start" });
    const v = await state(d.token);
    expect(v.status).toBe("running");
    expect(v.players.every((p) => p.cards.every((c) => c === null))).toBe(true);
    expect(Object.values(v.legal).every((x) => x === false || x === null || (Array.isArray(x) && x.length === 0))).toBe(true);
    expect(v.promptKey).toBe("waitingFor");
    expect((await act(d.token, { type: "cancel" }, v.version)).status).toBe(422);
    expect((await post("/away", {}, d.token)).status).toBe(200);
    expect((await state(a.token)).pauseReasons).toEqual([]);
    expect((await post("/display/leave", {}, d.token)).status).toBe(200);
    expect((await SELF.fetch(BASE + "/state", { headers: { authorization: `Bearer ${d.token}` } })).status).toBe(401);
    expect((await post("/display/leave", {}, d.token)).status).toBe(401);
  });

  it("keeps at most six displays, dropping the one unseen longest", async () => {
    const tokens: string[] = [];
    for (let i = 0; i < 7; i++) tokens.push(((await (await post("/display", {})).json()) as { token: string }).token);
    expect((await SELF.fetch(BASE + "/state", { headers: { authorization: `Bearer ${tokens[0]}` } })).status).toBe(401);
    for (const t of tokens.slice(1)) expect((await state(t, -1)).display).toBe(true);
  });

  it("pauses when the host reports going away and resumes on the next request", async () => {
    const a = await join("Ann");
    await join("Bob");
    const v = await ok(a.token, { type: "start" });
    expect(v.pauseReasons).toEqual([]);
    const r = await post("/away", {}, a.token);
    expect(r.status).toBe(200);
    const paused = await state(a.token);
    expect(paused.pauseReasons).toEqual([]);
  });

  it("pauses for the other player when the host is away", async () => {
    const a = await join("Ann");
    const b = await join("Bob");
    await ok(a.token, { type: "start" });
    await post("/away", {}, a.token);
    const bv = await state(b.token);
    expect(bv.pauseReasons).toEqual(["hostAbsent"]);
    expect(bv.promptKey).toBe("pausedHost");
    await state(a.token);
    expect((await state(b.token)).pauseReasons).toEqual([]);
  });

  it("long-polls until something changes", async () => {
    const a = await join("Ann");
    const b = await join("Bob");
    const v = await state(a.token);
    const waiting = state(a.token, v.version);
    await act(b.token, { type: "leave" }, v.version);
    const next = await waiting;
    expect(next.version).toBe(v.version + 1);
    expect(next.players.map((p) => p.name)).toEqual(["Ann"]);
  });

  it("a computer player acts from the alarm once its thinking time is up", async () => {
    const { env, runDurableObjectAlarm } = await import("cloudflare:test");
    const a = await join("Ann");
    await ok(a.token, { type: "addBot" });
    let v = await ok(a.token, { type: "start" });
    const stub = env.ROOM.get(env.ROOM.idFromName("casino"));
    const bot = v.players.find((p) => p.isBot)!;
    if (v.hand!.actorId === a.playerId) v = await ok(a.token, { type: "call" });
    expect(v.hand!.actorId).toBe(bot.id);
    // Settle, deal pace for two players and the bot's thinking time.
    await new Promise((r) => setTimeout(r, 7500));
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const after = await state(a.token);
    const moved = after.hand === null || after.hand.actorId !== bot.id || after.hand.street !== "preflop" || after.phase !== "betting";
    expect(moved).toBe(true);
  }, 15_000);

  it("every action type is accepted by the parser", async () => {
    const a = await join("Ann");
    const v = await state(a.token);
    for (const body of [
      { type: "fold" }, { type: "check" }, { type: "call" }, { type: "bet", to: 100 }, { type: "rebuy", accept: true },
      { type: "show", cards: [0] }, { type: "pause" }, { type: "resume" }, { type: "cancel" }, { type: "newGame" },
      { type: "kick", playerId: "x" }, { type: "addBot" }, { type: "start" }, { type: "sitOut" }, { type: "return" },
    ]) {
      const r = await act(a.token, body, (await state(a.token)).version);
      expect(r.status, body.type).not.toBe(400);
    }
    void v;
  });
});

describe("live connections", () => {
  beforeEach(reset);

  type Msg = { type: string; view?: View; error?: string; rooms?: RoomInfo[] } | "pong";

  async function connect(url: string, origin?: string) {
    const r = await SELF.fetch(url, { headers: { upgrade: "websocket", ...(origin ? { origin } : {}) } });
    expect(r.status).toBe(101);
    const ws = r.webSocket!;
    ws.accept();
    const queue: Msg[] = [];
    const waiting: ((m: Msg) => void)[] = [];
    ws.addEventListener("message", (e) => {
      const m: Msg = e.data === "pong" ? "pong" : JSON.parse(e.data as string);
      const w = waiting.shift();
      if (w) w(m); else queue.push(m);
    });
    const closed = new Promise<number>((res) => ws.addEventListener("close", (e) => res(e.code)));
    const next = () => new Promise<Msg>((res) => { const m = queue.shift(); if (m !== undefined) res(m); else waiting.push(res); });
    // The next view with a higher version than `after`: pushes can repeat a version already seen.
    const nextView = async (after: number): Promise<View> => {
      for (;;) {
        const m = await next();
        if (m !== "pong" && m.type === "view" && m.view!.version > after) return m.view!;
      }
    };
    return { ws, next, nextView, closed };
  }

  const hello = (token: string, odds = false) => JSON.stringify({ type: "hello", token, odds });

  it("sends the view on hello and after every change", async () => {
    const a = await join("Ann");
    const c = await connect(BASE + "/ws");
    c.ws.send(hello(a.token));
    const first = await c.nextView(-1);
    expect(first.you).toBe(a.playerId);
    expect(first.players.map((p) => p.name)).toEqual(["Ann"]);
    await join("Bob");
    const second = await c.nextView(first.version);
    expect(second.players.map((p) => p.name)).toEqual(["Ann", "Bob"]);
    c.ws.close();
  });

  it("answers pings without a view", async () => {
    const c = await connect(BASE + "/ws");
    c.ws.send("ping");
    expect(await c.next()).toBe("pong");
    c.ws.close();
  });

  it("turns away an unknown token", async () => {
    await join("Ann");
    const c = await connect(BASE + "/ws");
    c.ws.send(hello("nope"));
    expect(await c.next()).toEqual({ type: "error", error: "badToken" });
    expect(await c.closed).toBe(4001);
  });

  it("gives a player who leaves a last view without them, then closes", async () => {
    const a = await join("Ann");
    await join("Bob");
    const c = await connect(BASE + "/ws");
    c.ws.send(hello(a.token));
    const first = await c.nextView(-1);
    await act(a.token, { type: "leave" }, first.version);
    const last = await c.nextView(first.version);
    expect(last.players.map((p) => p.name)).toEqual(["Bob"]);
    expect(await c.closed).toBe(1000);
  });

  it("sends the odds only when asked, and turns them on and off", async () => {
    const a = await join("Ann");
    await join("Bob");
    await ok(a.token, { type: "start" });
    const c = await connect(BASE + "/ws");
    c.ws.send(hello(a.token, true));
    const v = await c.nextView(-1);
    expect(v.odds?.length).toBeGreaterThan(0);
    c.ws.send(JSON.stringify({ type: "odds", on: false }));
    const m = (await c.next()) as { view: View };
    expect(m.view.odds ?? []).toEqual([]);
    c.ws.close();
  });

  it("gives a display the table without hidden cards", async () => {
    const a = await join("Ann");
    await join("Bob");
    await ok(a.token, { type: "start" });
    const d = (await (await post("/display", {})).json()) as { token: string };
    const c = await connect(BASE + "/ws");
    c.ws.send(hello(d.token));
    const v = await c.nextView(-1);
    expect(v.display).toBe(true);
    expect(v.players.every((p) => p.cards.every((x) => x === null))).toBe(true);
    c.ws.close();
  });

  it("keeps a player with a connection present, and away once the app closes it", async () => {
    const a = await join("Ann");
    const b = await join("Bob");
    await ok(a.token, { type: "start" });
    const ca = await connect(BASE + "/ws");
    ca.ws.send(hello(a.token));
    await ca.nextView(-1);
    const cb = await connect(BASE + "/ws");
    cb.ws.send(hello(b.token));
    const before = await cb.nextView(-1);
    expect(before.players.find((p) => p.id === a.playerId)!.connected).toBe(true);
    // Ann's app goes to the background: her connection closes normally; Bob sees her away and
    // the game paused for the host.
    ca.ws.close(1000);
    for (;;) {
      const v = await cb.nextView(before.version);
      if (!v.players.find((p) => p.id === a.playerId)!.connected) {
        expect(v.pauseReasons).toContain("hostAbsent");
        break;
      }
    }
    // Anyone else's request afterwards leaves her away: a closed connection does not count.
    const later = await state(b.token);
    expect(later.players.find((p) => p.id === a.playerId)!.connected).toBe(false);
    // Back: a new connection and hello make her present again and lift the pause.
    const again = await connect(BASE + "/ws");
    again.ws.send(hello(a.token));
    const back = await again.nextView(-1);
    expect(back.players.find((p) => p.id === a.playerId)!.connected).toBe(true);
    expect(back.pauseReasons).toEqual([]);
    again.ws.close();
    cb.ws.close();
  });

  it("sends the room list on connect and after a change", async () => {
    const c = await connect(ROOT + "/rooms/ws");
    const first = (await c.next()) as { type: string; rooms: RoomInfo[] };
    expect(first.type).toBe("rooms");
    expect(first.rooms.map((r) => r.id)).toEqual(["casino", "home"]);
    await join("Ann");
    for (;;) {
      const m = (await c.next()) as { type: string; rooms: RoomInfo[] };
      if (m.rooms[0].names.includes("Ann")) break;
    }
    c.ws.close();
  });

  it("holds the clock for everyone while a player reads a guide, and lets go when the connection closes", async () => {
    const a = await join("Ann");
    const b = await join("Bob");
    await ok(a.token, { type: "start" });
    const ca = await connect(BASE + "/ws");
    ca.ws.send(hello(a.token));
    const first = await ca.nextView(-1);
    const cb = await connect(BASE + "/ws");
    cb.ws.send(hello(b.token));
    await cb.nextView(-1);
    ca.ws.send(JSON.stringify({ type: "hold", kind: "learn" }));
    const held = await cb.nextView(first.version);
    expect(held.holds).toEqual([{ playerId: a.playerId, kind: "learn" }]);
    // The countdown stands still while held.
    await new Promise((r) => setTimeout(r, 400));
    const later = await state(b.token);
    expect(later.hand!.remainingMs).toBe(held.hand!.remainingMs);
    expect(later.hand!.settleMs).toBe(held.hand!.settleMs);
    // A look is only for the end of a hand: ignored mid-hand.
    ca.ws.send(JSON.stringify({ type: "hold", kind: "look" }));
    ca.ws.close(1000);
    for (;;) {
      const v = await cb.nextView(held.version);
      if (v.holds.length === 0) break;
    }
    cb.ws.close();
  });

  it("empties the room at once when the last person leaves after closing the connection", async () => {
    const a = await join("Ann");
    await ok(a.token, { type: "addBot" });
    const c = await connect(BASE + "/ws");
    c.ws.send(hello(a.token));
    const seen = await c.nextView(-1);
    // The app closes its connection before leaving, with the version it last saw.
    c.ws.close(1000);
    await new Promise((r) => setTimeout(r, 200));
    const r = await act(a.token, { type: "leave" }, seen.version);
    expect(r.status).toBe(200);
    const rooms = (await (await SELF.fetch(ROOT + "/rooms")).json()) as RoomInfo[];
    expect(rooms[0]).toEqual({ id: "casino", status: "lobby", playerCount: 0, names: [] });
  });

  it("answers cross-origin requests from store link origins and localhost only", async () => {
    for (const ok of ["https://0123456789abcdef01234567.ourapps.app", "http://localhost:5175"]) {
      expect((await SELF.fetch(ROOT + "/rooms", { headers: { origin: ok } })).headers.get("access-control-allow-origin")).toBe(ok);
    }
    for (const bad of ["https://evil.example", "https://unapproved.example", "https://x.ourapps.app"]) {
      expect((await SELF.fetch(ROOT + "/rooms", { headers: { origin: bad } })).headers.get("access-control-allow-origin")).toBeNull();
    }
  });

  it("accepts the configured desktop origin for preflight, directory and authenticated room sockets", async () => {
    const origin = settings.allowedOrigins[1];
    expect(origin).toMatch(/^[a-z][a-z0-9-]*:\/\/app$/);
    expect(allowed(origin)).toBe(true);
    const preflight = await SELF.fetch(BASE + "/join", { method: "OPTIONS", headers: { origin, "access-control-request-method": "POST", "access-control-request-headers": "content-type, authorization" } });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe(origin);
    expect(preflight.headers.get("access-control-allow-headers")).toContain("authorization");
    const joined = await SELF.fetch(BASE + "/join", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ name: "Ann" }) });
    expect(joined.status).toBe(200);
    expect(joined.headers.get("access-control-allow-origin")).toBe(origin);
    const a = await joined.json() as JoinResponse;
    const current = await SELF.fetch(BASE + "/state", { headers: { origin, authorization: `Bearer ${a.token}` } });
    expect(current.status).toBe(200);
    expect(current.headers.get("access-control-allow-origin")).toBe(origin);
    expect((await current.json() as View).you).toBe(a.playerId);
    const room = await connect(BASE + "/ws", origin);
    room.ws.send(hello(a.token));
    expect((await room.nextView(-1)).you).toBe(a.playerId);
    room.ws.close(1000);
    const directory = await connect(ROOT + "/rooms/ws", origin);
    expect(await directory.next()).toMatchObject({ type: "rooms" });
    directory.ws.close(1000);
  });

  it("rejects lookalike desktop origins without permitting arbitrary custom schemes", async () => {
    const origin = settings.allowedOrigins[1];
    const scheme = origin.split(":")[0];
    for (const bad of [`${scheme}://other`, `${origin}.example`, `${origin}:1234`, `${origin}/`, `${scheme}-other://app`]) {
      expect(allowed(bad)).toBe(false);
      const preflight = await SELF.fetch(BASE + "/join", { method: "OPTIONS", headers: { origin: bad, "access-control-request-method": "POST" } });
      expect(preflight.headers.get("access-control-allow-origin")).toBeNull();
      expect((await SELF.fetch(ROOT + "/rooms", { headers: { origin: bad } })).headers.get("access-control-allow-origin")).toBeNull();
      for (const path of [BASE + "/ws", ROOT + "/rooms/ws"]) {
        expect((await SELF.fetch(path, { headers: { origin: bad, upgrade: "websocket" } })).status).toBe(403);
      }
    }
  });

  it("allows the web app's own origins from WEB_ORIGINS, exactly", () => {
    const web = "https://mcinpoker-web.example.workers.dev, https://poker.example";
    expect(allowed("https://mcinpoker-web.example.workers.dev", web)).toBe(true);
    expect(allowed("https://poker.example", web)).toBe(true);
    expect(allowed("https://mcinpoker-web.other.workers.dev", web)).toBe(false);
    expect(allowed("https://poker.example.evil", web)).toBe(false);
    expect(allowed("https://mcinpoker-web.example.workers.dev", "")).toBe(false);
    expect(allowed(null, web)).toBe(false);
  });

  it("refuses a browser connection from another site", async () => {
    const r = await SELF.fetch(BASE + "/ws", { headers: { upgrade: "websocket", origin: "https://evil.example" } });
    expect(r.status).toBe(403);
  });
});
