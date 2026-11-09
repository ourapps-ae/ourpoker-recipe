// The poker table: seats around an oval, board and pot in the middle, your cards and the action bar
// below. Rebuilt from the view on every change; countdowns tick on their own. Seat positions come from
// the table-layout component, cards, chips and controls from theirs; what stays here is what only
// poker needs: the hand's moves, sounds and lessons, the showdown, the zoomed cards and the rebuy offer.
import { dealRounds } from "../../components/card-graphics/web/card-model";
import { ALL_IN_MS, FLY_MS } from "../../components/chip-graphics/web/chip-model";
import type { PlayerView, View } from "./api";
import { hintsEl, playControls, taps } from "./betting";
import { boardSpot, burnSpot, cardsSpot, deckSpot, distanceFrom, mySeatOf, potSpot, seatCount, seatIndex, seatSpot, shownSpot, betSpot, YOUR_HAND, type Point } from "./geometry";
import { doubleTapDots, want } from "./guide";
import { L, actionText, eventText, promptText, roomName } from "./i18n";
import { handPanel } from "./odds-panel";
import { backIcon, errorText, leave, soundToggle, toggles } from "./screens";
import { challengeEl, challengeLayout, challengeParts, isUncontested, showLayout, showOffsets, shownEl, showcaseEl, showdownOf, uncontestedEl, wonBy, type Showdown, type Spot } from "./showdown";
import { play } from "./sound";
import type { State, Store } from "./store";
import { armTimers, resetTurnWarning, rich, timer } from "./timers";
import { cardEl, chips, h, icon, mmss, pileEl, tableCardWidth as tableCardSize } from "./ui";
import type { Video } from "./video";

// Only computer players besides you: no video needed.
export function soloGame(view: View): boolean {
  return view.status !== "lobby" && view.players.filter((p) => !p.isBot).length <= 1;
}

// Sounds for what others did and what the table did; your own actions sound as you tap them.
let lastActionKey = "";
function eventSounds(prev: View | null, view: View) {
  const hand = view.hand;
  if (!prev || !hand || prev.gameNumber !== view.gameNumber || prev.roomId !== view.roomId) return;
  const ph = prev.hand;
  const sameHand = !!ph && ph.no === hand.no;
  if (!sameHand) play("deal");
  else if (hand.board.length > ph!.board.length) {
    play("burn");
    play("flip", 300);
  }
  if (hand.event === "action" && hand.lastActorId && hand.lastActorId !== view.you) {
    const p = view.players.find((x) => x.id === hand.lastActorId);
    const a = p?.lastAction;
    const key = `${hand.no}|${hand.street}|${p?.id}|${a?.kind}|${p?.bet}|${p?.totalIn}`;
    if (p && a && key !== lastActionKey) {
      lastActionKey = key;
      play(a.kind === "check" ? "check" : a.kind === "fold" ? "fold" : a.kind === "allIn" ? "allin" : "chips");
    }
  }
  if (view.phase === "handOver" && prev.phase !== "handOver") play("win", 500);
  const mine = view.phase === "betting" && hand.actorId === view.you;
  const wasMine = sameHand && prev.phase === "betting" && ph!.actorId === view.you;
  if (mine && !wasMine) play("turn");
}

// Lessons for the table, and for each thing the first time it happens.
function tableGuides(view: View) {
  if (view.display || view.status !== "running") return;
  want("table");
  const hand = view.hand;
  if (!hand) return;
  if (hand.event === "deal") want("blinds");
  const kind = hand.event === "action" ? view.players.find((p) => p.id === hand.lastActorId)?.lastAction?.kind : undefined;
  if (kind === "call") want("call");
  if (kind === "bet" || kind === "raise" || kind === "allIn") want("bet");
  if (hand.pots.some((p) => p.amount > 0)) want("pot");
  if (hand.board.length === 3) want("flop");
  if (hand.board.length === 4) want("turn");
  if (hand.board.length === 5) want("river");
}

// The turn light's angle, unwrapped so each move is clockwise; kept between hands.
let lightAngle: number | null = null;
const TWO_PI = Math.PI * 2;
const angleOf = (k: number, n: number) => Math.PI / 2 + (TWO_PI * k) / n;

// A point on the ring of seats at any angle, for the light gliding between them.
function ringPos(a: number): Point {
  const lift = Math.max(0, Math.sin(a)) ** 8 * 6;
  return { x: 50 + 43 * Math.cos(a), y: 50 + (44 - lift) * Math.sin(a) };
}

function turnLight(view: View, n: number): HTMLElement | null {
  const hand = view.hand;
  if (!hand || view.phase !== "betting" || !hand.actorId) return null;
  const p = view.players.find((x) => x.id === hand.actorId);
  if (!p) return null;
  const a = angleOf(seatIndex(p, view), n);
  const from = lightAngle;
  const target = from === null ? a : from + (((a - from) % TWO_PI) + TWO_PI) % TWO_PI;
  lightAngle = target;
  const end = ringPos(target);
  const el = h("div", { class: "light", style: { left: `${end.x}%`, top: `${end.y}%` } });
  if (from !== null && target - from > 1e-6) {
    const steps = 12;
    const frames = Array.from({ length: steps + 1 }, (_, i) => {
      const q = ringPos(from + ((target - from) * i) / steps);
      return { left: `${q.x}%`, top: `${q.y}%` };
    });
    requestAnimationFrame(() => el.animate(frames, { duration: 600, easing: "ease-in-out" }));
  }
  return el;
}

// Things in motion between two spots: a pile of chips or a face-down card. Destinations stay hidden
// until the flight lands. A face-up card flies with its code at `size` px; dx and dy shift the
// destination by pixels.
type Flight = { from: Point; to: Point; delay: number; lands: string; ms: number; amount?: number; card?: true; pair?: true; allIn?: boolean; text?: string; code?: string; dx?: number; dy?: number; size?: number };
const CALLOUT_MS = 2200;
let prevView: View | null = null;
const landing = new Map<string, number>();

function isLanding(key: string): boolean {
  return (landing.get(key) ?? 0) > Date.now();
}

function flightsBetween(prev: View | null, view: View): Flight[] {
  const out: Flight[] = [];
  const hand = view.hand;
  if (!prev || !hand || prev.gameNumber !== view.gameNumber || prev.roomId !== view.roomId) return out;
  const n = seatCount(view);
  const k = (p: PlayerView) => seatIndex(p, view);
  const POT = potSpot(n), DECK = deckSpot(n), BURN = burnSpot(n);
  const prevHand = prev.hand;
  const sameHand = prevHand && prevHand.no === hand.no;
  let delay = 0;
  // A new hand: two rounds of cards from the deck, clockwise from the seat after the button.
  if (!sameHand) {
    const dealt = view.players.filter((p) => p.inHand).sort((a, b) => distanceFrom(a.seat, hand.button) - distanceFrom(b.seat, hand.button));
    const steps = dealRounds(dealt.map((_, i) => i), 2);
    for (const step of steps) {
      const p = dealt[step.seat];
      out.push({ from: DECK, to: cardsSpot(k(p), n), delay: step.delayMs, lands: `cards:${p.id}`, ms: step.durationMs, card: true });
    }
    delay = (steps[steps.length - 1]?.endMs ?? 0);
  }
  // Bets of the finished street (or the finished hand) sweep into the pot.
  const sweep = sameHand && (prevHand.street !== hand.street || (view.phase === "handOver" && prev.phase !== "handOver"));
  if (sweep) {
    let any = false;
    for (const q of prev.players) {
      if (q.bet <= 0) continue;
      const p = view.players.find((x) => x.id === q.id) ?? q;
      out.push({ from: betSpot(k(p), n), to: POT, amount: q.bet, delay, lands: "pot", ms: FLY_MS });
      any = true;
    }
    if (any) delay += FLY_MS;
  }
  // New board cards: burn one to the pile, then deal the street from the deck.
  const newBoard = sameHand ? hand.board.length - prevHand.board.length : hand.board.length;
  if (newBoard > 0 && view.phase !== "handOver") {
    const plan = dealRounds([0], newBoard + 1, { startMs: delay });
    out.push({ from: DECK, to: BURN, delay: plan[0].delayMs, lands: "burn", ms: plan[0].durationMs, card: true });
    for (let i = 0; i < newBoard; i++) {
      const at = hand.board.length - newBoard + i;
      out.push({ from: DECK, to: boardSpot(n, at), delay: plan[i + 1].delayMs, lands: `board:${at}`, ms: plan[i + 1].durationMs, card: true });
    }
    delay = plan[plan.length - 1].endMs;
  }
  if (view.phase === "handOver" && prev.phase !== "handOver" && view.lastResult) {
    for (const [id, amount] of wonBy(view)) {
      const p = view.players.find((x) => x.id === id);
      if (p) out.push({ from: POT, to: seatSpot(k(p), n), amount, delay, lands: `stack:${id}`, ms: FLY_MS });
    }
    // A showdown: each winner's cards that make the hand fly over the pot ring, then the board cards
    // that complete it slide in, each to its place in reading order; a draw, row by row.
    const sd = showdownOf(view);
    if (sd) {
      const lay = showLayout(sd);
      let t = 0;
      sd.winners.forEach((w, r) => {
        const best = w.hand?.best ?? [];
        const xs = showOffsets(best, lay.size);
        const from = k(w) === 0 ? YOUR_HAND : shownSpot(k(w), n);
        best.forEach((c, i) => {
          if (c.from === "hole" && c.code) out.push({ from, to: POT, dx: xs[i], dy: lay.cardDy(r, false), delay: t, lands: `show:${r}:${i}`, ms: 600, code: c.code, size: lay.size });
        });
        t += 650;
        best.forEach((c, i) => {
          const b = c.code ? hand.board.indexOf(c.code) : -1;
          if (c.from === "board" && b >= 0) {
            out.push({ from: boardSpot(n, b), to: POT, dx: xs[i], dy: lay.cardDy(r, true), delay: t, lands: `show:${r}:${i}`, ms: 500, code: c.code!, size: lay.size });
            t += 180;
          }
        });
        t += 200;
      });
    }
    return out;
  }
  for (const p of view.players) {
    const q = sameHand ? prev.players.find((x) => x.id === p.id) : undefined;
    // A fold: the chips in front of the player go into the pot and the cards land where they were.
    if (sameHand && q && !q.folded && p.folded) {
      if (q.bet > 0) out.push({ from: betSpot(k(p), n), to: POT, amount: q.bet, delay, lands: "pot", ms: FLY_MS });
      const from = k(p) === 0 ? YOUR_HAND : cardsSpot(k(p), n);
      out.push({ from, to: betSpot(k(p), n), delay: delay + 200, lands: `fold:${p.id}`, ms: k(p) === 0 ? FLY_MS + 150 : FLY_MS, pair: true });
      continue;
    }
    // A check: nothing moves, so a word pops up at the seat.
    const checked = hand.event === "action" && hand.lastActorId === p.id && p.lastAction?.kind === "check";
    const shown = prevHand && prevHand.event === "action" && prevHand.lastActorId === p.id && q?.lastAction?.kind === "check";
    if (checked && !shown) out.push({ from: cardsSpot(k(p), n), to: cardsSpot(k(p), n), delay, lands: `callout:${p.id}:${view.version}`, ms: CALLOUT_MS, text: L("check") });
    // Chips a player just put in front of them: a bet, call, raise or blind, or the whole stack.
    const before = q && !sweep ? q.bet : 0;
    if (p.bet > before) {
      const allIn = p.allIn && !(q?.allIn ?? false);
      out.push({ from: seatSpot(k(p), n), to: betSpot(k(p), n), amount: p.bet - before, delay, allIn, lands: `bet:${p.id}`, ms: allIn ? ALL_IN_MS : FLY_MS });
    }
  }
  return out;
}

// Flights live in an overlay on the page, not in the table, so the table being rebuilt by the next
// view does not cut them short. Destinations remember when they may show; a re-render at the last
// landing reveals them.
let overlay: HTMLElement | null = null;
let presentationGeneration = 0;

// Called before the table is built, so the destinations render hidden from the start.
function markLandings(flights: Flight[]): number {
  const now = Date.now();
  let last = 0;
  for (const f of flights) {
    const until = now + f.delay + f.ms;
    landing.set(f.lands, Math.max(landing.get(f.lands) ?? 0, until));
    last = Math.max(last, until);
  }
  return last;
}

function launch(table: HTMLElement, flights: Flight[], store: Store, last: number) {
  const now = Date.now();
  const generation = presentationGeneration;
  requestAnimationFrame(() => {
    if (generation !== presentationGeneration || store.state.mode !== "player") return;
    const box = (table.isConnected ? table : document.querySelector<HTMLElement>(".table"))?.getBoundingClientRect();
    if (!box) return;
    if (!overlay) document.body.append((overlay = h("div", { class: "fx" })));
    const px = (p: Point, dx = 0, dy = 0) => ({ left: `${box.left + (box.width * p.x) / 100 + dx}px`, top: `${box.top + (box.height * p.y) / 100 + dy}px` });
    for (const f of flights) {
      const el = h("div", { class: `flight${f.allIn ? " allin" : ""}`, style: { ...px(f.from), transitionDuration: `${f.ms}ms` } },
        f.text ? h("span", { class: "callout" }, f.text)
          : f.code ? cardEl(f.code, f.size ?? 40)
          : f.pair ? h("div", { class: "holepair" }, cardEl(null, 24), cardEl(null, 24))
          : f.card ? cardEl(null, 20)
          : pileEl(f.amount ?? 0, 12, false),
        f.allIn ? h("span", { class: "tag" }, L("all_in")) : null);
      el.style.visibility = f.delay ? "hidden" : "visible";
      overlay!.append(el);
      const go = () => {
        if (generation !== presentationGeneration || store.state.mode !== "player") return;
        el.style.visibility = "visible";
        requestAnimationFrame(() => Object.assign(el.style, px(f.to, f.dx, f.dy)));
      };
      if (f.delay) setTimeout(go, f.delay); else requestAnimationFrame(go);
      setTimeout(() => el.remove(), f.delay + f.ms + 40);
    }
  });
  // Redraw as each lands, so destinations appear one by one.
  const ends = new Set(flights.map((f) => Math.round((f.delay + f.ms) / 50) * 50));
  if (last) ends.add(last - now);
  for (const t of ends) setTimeout(() => store.set({}), t + 60);
}

let settleTimer = 0;
function scheduleSettle(store: Store, at: number) {
  clearTimeout(settleTimer);
  settleTimer = window.setTimeout(() => store.set({}), at - Date.now() + 30);
}

export function renderTable(store: Store, s: State, view: View, video: Video): HTMLElement {
  if (view.phase !== "betting" || view.hand?.actorId !== view.you) resetTurnWarning();
  const me = view.players.find((p) => p.id === view.you);
  const hand = view.hand;
  const n = seatCount(view);
  const mySeat = mySeatOf(view);
  const paused = view.pauseReasons.length > 0;
  // Someone holds the play clock (looking at cards, reading a lesson): every countdown stands still.
  const held = (view.holds ?? []).length > 0;
  const flights = prevView === view ? [] : flightsBetween(prevView, view);
  if (prevView !== view) {
    eventSounds(prevView, view);
    tableGuides(view);
  }
  prevView = view;
  const lastLanding = markLandings(flights);
  refreshZoom(store, view);
  // The settle after a deal or an action: the event is announced and nobody's clock runs; the
  // controls appear when it ends.
  const settleEnd = hand && hand.settleMs ? s.viewAt + hand.settleMs : 0;
  const settling = settleEnd > Date.now();
  if (settling) scheduleSettle(store, settleEnd);

  const sd = showdownOf(view);
  const uncontested = isUncontested(view);
  // Where every shown hand goes, clear of each other and of the winning cards. The table is as wide
  // as the page column inside its padding, and 1.3 times as tall.
  const available = (document.getElementById("app")?.clientWidth ?? Math.min(window.innerWidth, 480)) - 24;
  const tableW = window.innerWidth >= 900 ? Math.min(560, (available - 24) * 0.56) : available;
  const challenges = challengeLayout(view, sd, n, mySeat, tableW, tableW * 1.3);
  const seats = view.players.map((p) => seatEl(store, view, p, n, video, paused, sd, challenges.get(p.id)));

  const pot = potSpot(n), deck = deckSpot(n), burnAt = burnSpot(n);
  // The pot: one pile per pot with its amount, hidden while chips are still on their way, and gone
  // once the hand is over (the chips have flown to the winners).
  const potBox = hand && view.phase !== "handOver" && hand.pots.length
    ? h("div", { class: `potbox${isLanding("pot") ? " arriving" : ""}` }, h("div", { class: "pots" }, ...hand.pots.map((p) => pileEl(p.amount, 12))))
    : null;
  // The board: tap it to see the community cards large. Every place underlined gold, the legend's
  // colour for the community cards.
  const board = h("div", { class: "board", "data-guide": "board", onClick: () => hand?.board.length && openZoom(store, "board") }, ...[0, 1, 2, 3, 4].map((i) => h("div", { class: "lined gold" },
    hand?.board[i] && !isLanding(`board:${i}`) ? cardEl(hand.board[i], 40) : h("div", { class: "card slot", style: { width: "40px", height: "56px" } }))));
  const centre = h("div", { class: "centre" }, board);
  // The countdown to the next hand sits under the pot ring, or under the winning combination.
  const nextHand = hand && hand.remainingMs !== null && (view.phase === "runout" || view.phase === "handOver") && !paused ? timer(hand.remainingMs, view.phase === "runout" ? 1500 : view.lastResult?.holdMs || (view.lastResult?.uncontested ? 6000 : 22000), "small", held) : null;
  const potMark = h("div", { class: "spot potspot", style: { left: `${pot.x}%`, top: `${pot.y}%` } },
    h("div", { class: "potring", "data-guide": "pot" }, h("span", { class: "potlabel" }, L("pot")), potBox),
    sd || uncontested ? null : nextHand,
  );
  const showcase = sd ? showcaseEl(sd, n, nextHand, () => openZoom(store, "showcase"), isLanding) : uncontested ? uncontestedEl(view, n, nextHand) : null;

  // The deck and the burn pile, above the board.
  const deckEl = h("div", { class: "spot deck", style: { left: `${deck.x}%`, top: `${deck.y}%` } }, ...[0, 1, 2].map((i) => h("div", { class: "deckcard", style: { transform: `translate(${i}px, ${-i * 1.5}px)` } }, cardEl(null, 20))));
  const burns = hand ? Math.max(0, (hand.board.length >= 3 ? 1 : 0) + (hand.board.length >= 4 ? 1 : 0) + (hand.board.length >= 5 ? 1 : 0) - (isLanding("burn") ? 1 : 0)) : 0;
  const burn = h("div", { class: "spot burn", style: { left: `${burnAt.x}%`, top: `${burnAt.y}%` } }, ...Array.from({ length: burns }, (_, i) => h("div", { class: "deckcard", style: { transform: `translate(${i * 3}px, ${i * 2}px) rotate(${(i - 1) * 7}deg)` } }, cardEl(null, 20))));

  // End game: the gold circle with a cross in the table's corner.
  const endGame = view.legal.cancel
    ? h("button", { class: "icbtn gold endgame", title: L("end_game"), "aria-label": L("end_game"), disabled: s.busy, onClick: () => { if (confirm(L("end_game_confirm"))) store.act("cancel"); } }, icon("close", 22))
    : null;
  // Back up a level from the table's top left: leave the table (a running game keeps your seat,
  // sitting out, until you come back).
  const stepOut = view.legal.leave
    ? h("button", { class: "icbtn ghost stepout", title: L("leave"), "aria-label": L("leave"), disabled: s.busy, onClick: () => leave(store) }, backIcon())
    : null;
  const table = h("div", { class: "table" }, h("div", { class: "felt" }), turnLight(view, n), centre, potMark, deckEl, burn, ...seats, showcase, stepOut, endGame);
  if (flights.length) launch(table, flights, store, lastLanding);

  const clock = view.clock;
  // Microphone and camera for a seated player with a video grant in a game with other people, then
  // sound, then how to play.
  const header = h("div", { class: "row spread", style: { padding: "0 4px" } },
    h("h2", {}, roomName(view.roomId)),
    h("div", { class: "row headtools" },
      ...(me && !soloGame(view) && video.granted ? toggles(video, store) : []),
      soundToggle(video, store),
      h("button", { class: "icbtn plain", title: L("how_to_play"), "aria-label": L("how_to_play"), onClick: () => { play("click"); store.set({ help: true }); } }, icon("bulb", 24))),
  );
  // The level, the blinds and the time to the next level, in a card above the prompt; the blinds and
  // the time in bold. Under it, who holds the play clock.
  const levelStill = paused || held || view.phase === "rebuy";
  const holdNotes = (view.holds ?? []).filter((x) => x.playerId !== view.you)
    .map((x) => L(x.kind === "look" ? "hold_look" : "hold_learn", view.players.find((p) => p.id === x.playerId)?.name ?? ""));
  const levelCard = clock ? h("div", { class: "levelcard", "data-guide": "level" },
    h("div", {}, L("level", clock.level), " \u00B7 ",
      ...rich("blinds", { text: chips(clock.sb), bold: true }, { text: chips(clock.bb), bold: true }), " \u00B7 ",
      ...rich("next_level", { text: chips(clock.nextSb) }, { text: chips(clock.nextBb) }, { text: mmss(clock.nextLevelInMs), bold: true, attrs: levelStill ? {} : { "data-level-deadline": String(Date.now() + clock.nextLevelInMs) } })),
    ...holdNotes.map((t) => h("div", { class: "holdnote" }, t))) : null;
  armTimers();

  const banner = h("div", { class: `banner${paused ? " paused" : ""}` }, h("span", { class: "text" }, (settling && !paused ? eventText(view) : null) ?? promptText(view)),
    hand && hand.actorId && hand.remainingMs !== null && view.phase === "betting" && !paused ? timer(hand.remainingMs, 30000, "inline", held) : null);

  return h("div", { class: `player-screen${s.betTo !== null && view.legal.bet ? " betting" : ""}` },
    header,
    levelCard,
    banner,
    showCardsButton(store, s, view),
    h("div", { class: "player-layout" },
      h("div", { class: "player-stage" }, table),
      h("div", { class: "player-sidebar" },
        me ? myArea(store, s, view, me) : null,
        me ? handPanel(store, s, view, me) : null,
        resultPanel(view),
        controls(store, s, view))),
    view.legal.rebuy ? rebuyModal(store, s, view) : null,
    errorText(s.error) ? h("div", { class: "error" }, errorText(s.error)) : null,
  );
}

// Seat on the ring, its monitor centred there and the text below; yours at the bottom.
function seatEl(store: Store, view: View, p: PlayerView, n: number, video: Video, paused: boolean, sd: Showdown | null, spot?: Spot): HTMLElement {
  const k = seatIndex(p, view);
  const me = p.id === view.you;
  const hole = cardsSpot(k, n);
  const shown = p.cards.length > 0 && p.cards.every((c) => c !== null);
  const front = shownSpot(k, n);
  const hand = view.hand;
  const isActor = hand?.actorId === p.id && view.phase === "betting";
  const bp = betSpot(k, n);
  const open = (kind: "showcase" | "hand", id?: string) => openZoom(store, kind, id);
  // At a showdown every shown hand is laid out as its challenge; yours sits above your seat.
  if (sd?.players.some((q) => q.id === p.id)) {
    const row = spot ? challengeEl(p, k, n, sd.winners.some((w) => w.id === p.id), spot, open) : null;
    return h("div", { class: "seatwrap" }, seatBody(view, p, k, n, video), row);
  }
  // Cards shown face up at the end of a hand lie in front of the player.
  if (spot) return h("div", { class: "seatwrap" }, seatBody(view, p, k, n, video), shownEl(p, spot, open));
  // Live cards sit by the seat; folded ones lie face down where the bet was, and leave the table while
  // the result is up, clear of the winning hands.
  const cards = p.inHand && p.folded
    ? (isLanding(`fold:${p.id}`) || view.phase === "handOver" ? null : me ? peekableFold(store, p, bp) : h("div", { class: "holecards folded", style: { left: `${bp.x}%`, top: `${bp.y}%` } }, cardEl(null, 24), cardEl(null, 24)))
    : p.inHand && !me && !isLanding(`cards:${p.id}`)
      ? shown
        ? h("div", { class: "holecards shown", style: { left: `${front.x}%`, top: `${front.y}%` } }, ...p.cards.map((c) => cardEl(c, tableCardSize(n, true))))
        : h("div", { class: "holecards", style: { left: `${hole.x}%`, top: `${hole.y}%` } }, ...p.cards.map(() => cardEl(null, tableCardSize(n, false))))
      : null;
  const bet = p.bet > 0 ? h("div", { class: `spot${isLanding(`bet:${p.id}`) ? " arriving" : ""}`, style: { left: `${bp.x}%`, top: `${bp.y}%` } }, pileEl(p.bet, 12)) : null;
  // The actor's clock, under their cards: fills green, turns orange, then flashes red.
  const clock = isActor && !me && hand && hand.remainingMs !== null && !paused && !p.isBot
    ? h("div", { class: "spot clockspot", style: { left: `${hole.x}%`, top: `calc(${hole.y}% + 26px)` } }, timer(hand.remainingMs, 30000, "fills seatclock", (view.holds ?? []).length > 0))
    : null;
  return h("div", { class: "seatwrap" }, seatBody(view, p, k, n, video), cards, bet, clock);
}

// The seat itself: monitor, dealer button, name, stack and status.
function seatBody(view: View, p: PlayerView, k: number, n: number, video: Video): HTMLElement {
  const me = p.id === view.you;
  const { x, y } = seatSpot(k, n);
  const hand = view.hand;
  const isActor = hand?.actorId === p.id && view.phase === "betting";
  const cls = ["seat", p.status === "out" ? "out" : "", p.folded ? "folded" : "", isActor ? "turn" : ""].filter(Boolean).join(" ");
  const status = p.status === "out" ? L("out") : p.sittingOut ? L("sitting_out") : !p.connected && !p.isBot ? L("away") : p.allIn ? L("all_in_mark") : p.folded ? L("folded") : null;
  const button = hand && hand.button === p.seat ? h("div", { class: "dealer" }, L("dealer")) : null;
  const shownName = p.hand && p.cards.length && p.cards.every((c) => c !== null) ? p.hand.name : null;
  return h("div", { class: cls, style: { left: `${x}%`, top: `${y}%` } },
    h("div", { class: "monitorbox" },
      video.hasVideo(p.id, me) ? video.monitor(p.id, me, p.name, 56) : h("div", { class: "avatar" }, p.isBot ? icon("robot", 22) : p.name.slice(0, 1)),
      button,
    ),
    h("div", { class: `name${isActor ? " turn" : ""}` }, p.name + (p.isHost ? " \u2605" : "")),
    h("div", { class: "stack" }, chips(p.stack)),
    // Once the cards are shown, the hand's name takes the place of the last action.
    shownName ? h("div", { class: "status handname" }, shownName) : status ? h("div", { class: "status" }, status) : p.lastAction && hand ? h("div", { class: "status act" }, actionText(p.lastAction)) : null,
  );
}

// Cards large over the whole screen until tapped away: the board in rows of three, one row per
// winning hand (named when the pot is split), one player's shown hand, or your own cards. Your live
// cards keep their gestures there (a double tap checks, a flick up folds) and the call, bet and chips
// stay to hand below them. Rebuilt from each new view. At the end of a hand, looking holds the play
// clock for everyone.
type ZoomKind = "board" | "showcase" | "mine" | "folded" | "hand";
// A row keeps where each card came from (community cards sit higher in a hand's combination), where
// gaps go (before the kickers and before cards a hand does not use) and from which card on the cards
// are dimmed (those not used).
type ZoomRow = { name?: string; cards: (string | null)[]; from?: string[]; gaps?: number[]; dimFrom?: number };
let zoomEl: HTMLElement | null = null;
let zoomKind: ZoomKind | null = null;
let zoomPlayer = "";
let zoomKey = "";
let zoomHand: number | null = null;
let zoomStore: Store | null = null;

function zoomRows(view: View, kind: ZoomKind): ZoomRow[] {
  if (kind === "board") {
    const b = view.hand?.board ?? [];
    const rows: ZoomRow[] = [];
    for (let i = 0; i < b.length; i += 3) rows.push({ cards: b.slice(i, i + 3), from: b.slice(i, i + 3).map(() => "board") });
    return rows;
  }
  const sd = showdownOf(view);
  if (kind === "showcase") {
    if (!sd) return [];
    return sd.winners.map((w) => {
      const best = w.hand?.best ?? [];
      return { name: sd.kind === "draw" ? w.name : undefined, cards: best.map((c) => c.code), from: best.map((c) => c.from), gaps: [best.findIndex((c) => c.spare)] };
    });
  }
  if (kind === "hand") {
    const p = view.players.find((x) => x.id === zoomPlayer);
    if (!p || !p.cards.length || p.cards.some((c) => c === null)) return [];
    if (sd?.players.some((q) => q.id === p.id) && !sd.winners.some((w) => w.id === p.id)) {
      const { best, unused } = challengeParts(p, false);
      return [{ name: p.name, cards: [...best.map((c) => c.code), ...unused], from: [...best.map((c) => c.from), ...unused.map(() => "hole")],
        gaps: [best.findIndex((c) => c.spare), unused.length ? best.length : -1], dimFrom: best.length }];
    }
    return [{ name: p.name, cards: p.cards, from: p.cards.map(() => "hole") }];
  }
  const me = view.players.find((p) => p.id === view.you);
  return me?.cards.length ? [{ cards: me.cards, from: me.cards.map(() => "hole") }] : [];
}

export function closeZoom() {
  zoomEl?.remove();
  zoomEl = null;
  zoomKind = null;
  zoomKey = "";
  zoomStore?.setLooking(false);
}

export function resetTablePresentation() {
  presentationGeneration++;
  closeZoom();
  zoomStore = null;
  prevView = null;
  landing.clear();
  overlay?.remove();
  overlay = null;
  clearTimeout(settleTimer);
}

function openZoom(store: Store, kind: ZoomKind, playerId = "") {
  const view = store.state.view;
  if (!view) return;
  zoomKind = kind;
  zoomPlayer = playerId;
  zoomHand = view.hand?.no ?? null;
  zoomKey = "";
  zoomStore = store;
  store.setLooking(true);
  refreshZoom(store, view);
}

// Your live cards can be played as soon as it is your move and they have landed.
function canPlay(store: Store, view: View): boolean {
  return view.legal.fold && !store.state.busy && !isLanding(`cards:${view.you}`);
}

function refreshZoom(store: Store, view: View) {
  if (!zoomKind) return;
  const rows = zoomRows(view, zoomKind);
  if (!rows.length || (view.hand?.no ?? null) !== zoomHand) return closeZoom();
  const s = store.state;
  const key = JSON.stringify([rows, zoomKind === "mine" ? [view.version, s.betTo, s.busy, view.legal] : 0]);
  if (key === zoomKey && zoomEl) return;
  zoomKey = key;
  zoomEl?.remove();
  const most = Math.max(...rows.map((r) => r.cards.length));
  const width = Math.min(Math.floor(window.innerWidth * (most > 3 ? 0.17 : most > 2 ? 0.29 : 0.42)), most > 3 ? 150 : 300);
  // As on the table, every card underlined: green from a hand, gold from the community; in a hand's
  // combination the community cards higher.
  const raise = zoomKind === "showcase" || zoomKind === "hand" ? Math.round(width * 1.4 * 0.2) : 0;
  const cardsBox = h("div", { class: "zoombox" }, ...rows.map((r) => h("div", { class: "zoomrow" },
    r.name ? h("div", { class: "zoomname" }, r.name) : null,
    h("div", { class: "zoomcards", style: { gap: most > 3 ? "8px" : "12px" } }, ...r.cards.map((c, i) => {
      const from = r.from?.[i] ?? "hole";
      return h("div", { class: "zoomslot", style: { marginTop: from !== "board" ? `${raise}px` : "0", marginLeft: i > 0 && r.gaps?.includes(i) ? `${Math.round(width * 0.2)}px` : "0", opacity: r.dimFrom !== undefined && i >= r.dimFrom ? "0.85" : "1" } },
        cardEl(c, width), h("div", { class: `bar ${from}`, style: { width: `${width}px` } }));
    })))));
  const me = view.players.find((p) => p.id === view.you);
  if (zoomKind === "mine" && me) {
    const canAct = canPlay(store, view);
    const { callPill, stack, bar } = playControls(store, s, view, me, canAct);
    const hand = view.hand;
    const myTurn = hand && hand.actorId === me.id && view.phase === "betting" && hand.remainingMs !== null && !view.pauseReasons.length;
    zoomEl = h("div", { class: "zoom" }, canAct ? hintsEl(view.legal, doubleTapDots) : null, cardsBox,
      myTurn ? timer(hand.remainingMs!, 30000, "fills myclock", (view.holds ?? []).length > 0) : null,
      canAct ? h("div", { class: "zoomplay" }, callPill, stack) : null, bar);
    taps(cardsBox, {
      single: closeZoom,
      double: () => { const v = store.state.view; if (v && canPlay(store, v) && v.legal.check) store.act("check"); },
      flick: () => { const v = store.state.view; if (v && canPlay(store, v)) { store.act("fold"); closeZoom(); } },
    });
    zoomEl.addEventListener("click", (e) => { if (e.target === zoomEl) closeZoom(); });
  } else {
    zoomEl = h("div", { class: "zoom" }, cardsBox);
    zoomEl.addEventListener("click", closeZoom);
  }
  document.body.append(zoomEl);
}

// Your folded cards, face down on the table: tap them to see them large.
function peekableFold(store: Store, me: PlayerView, bp: Point): HTMLElement {
  return h("div", { class: "holecards folded mine", style: { left: `${bp.x}%`, top: `${bp.y}%` }, onClick: () => openZoom(store, "folded") }, ...me.cards.map(() => cardEl(null, 20)));
}

// Your cards are the controls: double-tap to check, flick toward the table to fold; tap your chips to
// bet or raise; tap Call to call.
function myArea(store: Store, s: State, view: View, me: PlayerView): HTMLElement {
  const legal = view.legal;
  const hand = view.hand;
  // Your move as soon as it is your turn and your cards have landed.
  const canAct = legal.fold && !s.busy && !isLanding(`cards:${me.id}`);
  // Folded cards lie on the table; the hand is empty until the next deal.
  const cards = me.cards.length && !me.folded && !isLanding(`cards:${me.id}`)
    // Your cards, each underlined green, the legend's colour for them; on your turn framed, with what a
    // double tap and a flick do.
    ? h("div", { class: `mycards${canAct ? " live glow" : ""}`, "data-guide": "hand" }, canAct ? hintsEl(legal, doubleTapDots) : null, h("div", { class: "handrow" }, ...me.cards.map((c, i) => h("div", { class: "handcard" }, cardEl(c, 72, {
        tappable: legal.show.includes(i) && !s.busy,
        onClick: legal.show.includes(i) ? () => store.act("show", { cards: [i] }) : undefined,
      }), h("div", { class: "line green" })))))
    : me.folded ? h("div", { class: "mycards empty" }) : null;
  if (cards && !me.folded) {
    const g = canAct ? legal : { ...legal, fold: false, check: false };
    taps(cards, {
      single: () => openZoom(store, "mine"),
      double: () => { if (g.check) store.act("check"); },
      flick: () => { if (g.fold) store.act("fold"); },
    });
  }
  const { callPill, stack, bar } = playControls(store, s, view, me, canAct);
  // Pinned to the bottom of the screen, so it shows without scrolling.
  bar?.classList.add("pinned");
  const myTurn = hand && hand.actorId === me.id && view.phase === "betting" && hand.remainingMs !== null && !view.pauseReasons.length;
  const myClock = myTurn ? timer(hand.remainingMs!, 30000, "fills myclock", (view.holds ?? []).length > 0) : null;
  // Back into play after sitting out, right of your cards: going deeper in, so on the right.
  const backIn = legal.return ? h("button", { class: `icbtn gold backin${s.busy ? "" : " glow"}`, title: L("back_in"), "aria-label": L("back_in"), disabled: s.busy, onClick: () => store.act("return") }, icon("play")) : h("span");
  return h("div", { class: "myarea" }, h("div", { class: "mycontrols" }, h("div", { class: "mystackcol", "data-guide": "stack" }, callPill, stack), h("div", { class: "cardscol" }, cards, myClock), backIn), bar);
}

export function showCardsButton(store: Store, s: State, view: View): HTMLElement | null {
  return view.legal.show.length ? h("button", { class: "btn block", disabled: s.busy, onClick: () => store.act("show", { cards: view.legal.show }) }, L("show_cards")) : null;
}

// Who won what, while the result is on show; voided hands say so.
function resultPanel(view: View): HTMLElement | null {
  if (view.phase !== "handOver" || !view.lastResult) return null;
  const r = view.lastResult;
  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? "";
  return h("div", { class: "panel result" },
    r.voided ? h("div", { class: "muted" }, L("voided")) : null,
    ...r.pots.map((p, i) => h("div", { class: "row spread" },
      h("span", { class: "muted" }, i === 0 ? L("pot_label", chips(p.amount)) : L("side_pot", chips(p.amount))),
      h("span", {}, p.winners.map((w) => `${name(w.playerId)} +${chips(w.amount)}${w.handName ? ` (${w.handName})` : ""}`).join(", ")),
    )));
}

function controls(store: Store, s: State, view: View): HTMLElement {
  const legal = view.legal;
  return h("div", { class: "row spread controls" },
    h("div", { class: "row", style: { gap: "6px" } },
      legal.pause ? h("button", { class: "btn link", disabled: s.busy, onClick: () => store.act("pause") }, L("pause")) : null,
      legal.resume ? h("button", { class: "btn link", disabled: s.busy, onClick: () => store.act("resume") }, L("resume")) : null,
    ),
  );
}

function rebuyModal(store: Store, s: State, view: View): HTMLElement {
  const offer = view.rebuyOffers.find((o) => o.playerId === view.you);
  const left = offer ? offer.remainingMs : 0;
  return h("div", { class: "modal" }, h("div", { class: "panel" },
    h("div", { class: "title" }, L("rebuy_title")),
    h("p", {}, L("rebuy_body", Math.ceil(left / 1000))),
    timer(left, 30000),
    h("div", { class: "row", style: { gap: "8px", marginTop: "12px" } },
      h("button", { class: "btn ghost grow", disabled: s.busy, onClick: () => store.act("rebuy", { accept: false }) }, L("rebuy_no")),
      h("button", { class: "btn grow", disabled: s.busy, onClick: () => store.act("rebuy", { accept: true }) }, L("rebuy_yes")),
    ),
  ));
}
