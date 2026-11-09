// The showdown display: how a hand was won (on the combination, on a kicker, or a draw), the winning
// hands over the pot ring, and every other shown hand laid out clear of them. Poker presentation only;
// the table geometry comes from the table-layout component (geometry.ts).
import type { OddsCard, PlayerView, View } from "./api";
import { betSpot, potSpot, seatSpot } from "./geometry";
import { L } from "./i18n";
import { cardToken } from "./odds-panel";
import { cardEl, chips, h } from "./ui";

export type Showdown = { kind: "combination" | "kicker" | "draw"; winners: PlayerView[]; players: PlayerView[]; won: Map<string, number> };
export type Spot = { x: number; y: number; w: number; h: number; named: boolean };
type Box = { l: number; t: number; r: number; b: number };
export type ZoomRequest = (kind: "showcase" | "hand", playerId?: string) => void;

// What each winner took, all pots together.
export function wonBy(view: View): Map<string, number> {
  const won = new Map<string, number>();
  for (const pot of view.lastResult?.pots ?? []) for (const w of pot.winners) won.set(w.playerId, (won.get(w.playerId) ?? 0) + w.amount);
  return won;
}

// A hand that ended in a showdown: the winners and every hand that was shown.
export function showdownOf(view: View): Showdown | null {
  const hand = view.hand;
  const r = view.lastResult;
  if (view.phase !== "handOver" || !hand || !r || r.uncontested || r.voided || r.no !== hand.no) return null;
  const players = view.players.filter((p) => p.inHand && !p.folded && p.hand?.best?.length);
  const ids = r.showdown?.winners ?? (r.pots[0]?.winners[0] ? [r.pots[0].winners[0].playerId] : []);
  const winners = ids.map((id) => players.find((p) => p.id === id)).filter((p): p is PlayerView => !!p);
  if (players.length < 2 || !winners.length) return null;
  return { kind: r.showdown?.kind ?? "combination", winners, players, won: wonBy(view) };
}

// A hand won with no cards shown.
export const isUncontested = (view: View): boolean => {
  const r = view.lastResult;
  return view.phase === "handOver" && !!view.hand && !!r && r.uncontested && !r.voided && r.no === view.hand.no;
};

// The showcase over the pot ring: one row per winner (several in a draw, with smaller cards, a title
// and each winner's name left of the row). Its top sits SHOW_TOP above the pot's centre; a third row
// on grows it upward, to stay clear of your seat.
const SHOW_TOP = 27;
export const SHOW_GAP = 4;
export const KICKER_GAP = 10;

export function showLayout(sd: Showdown) {
  const size = sd.winners.length > 2 ? 22 : sd.winners.length > 1 ? 26 : 34;
  const titleH = sd.kind === "draw" ? 18 : 0;
  const cardH = Math.round(size * 1.4);
  // Community cards sit a fifth of a card higher than the hand's own, toward the board they came from.
  const raise = Math.round(cardH * 0.2);
  const rowH = raise + cardH + 10;
  const top = SHOW_TOP + Math.max(0, sd.winners.length - 2) * rowH;
  return { size, titleH, raise, rowH, top, cardDy: (r: number, board: boolean) => -top + titleH + r * rowH + (board ? 0 : raise) + cardH / 2 };
}

// Each card's offset from the row's centre: the combination, then a wider gap before the kickers.
export function showOffsets(best: OddsCard[], size: number): number[] {
  const xs: number[] = [];
  let x = 0;
  best.forEach((c, i) => {
    if (i > 0) x += size + SHOW_GAP + (c.spare && !best[i - 1].spare ? KICKER_GAP : 0);
    xs.push(x);
  });
  const width = (xs[xs.length - 1] ?? 0) + size;
  return xs.map((v) => v + size / 2 - width / 2);
}

// The winning hands in reading order, each card underlined green (from the winner's hand) or gold (from
// the board); kickers after a gap. Left of each hand who won it and how much; under them the hand's
// name, and whether a kicker decided it. A draw is titled.
export function showcaseEl(sd: Showdown, n: number, countdown: HTMLElement | null, onTap: () => void, isLanding: (key: string) => boolean): HTMLElement {
  const lay = showLayout(sd);
  const pot = potSpot(n);
  return h("div", { class: "showcase tapzoom", onClick: onTap, style: { left: `${pot.x}%`, top: `${pot.y}%`, transform: `translate(-50%, -${lay.top}px)` } },
    sd.kind === "draw" ? h("div", { class: "showtitle" }, L("split_pot") + (sd.winners[0]?.hand ? ` \u00B7 ${sd.winners[0].hand.name}` : "")) : null,
    ...sd.winners.map((w, r) => {
      const best = w.hand?.best ?? [];
      return h("div", { class: "showrow", style: { height: `${lay.rowH}px` } },
        h("div", { class: "showname" }, h("div", { class: "who" }, w.name), h("div", { class: "amt" }, `+${chips(sd.won.get(w.id) ?? 0)}`)),
        h("div", { class: "cards" }, ...best.map((c, i) => h("div", {
          class: `slot${isLanding(`show:${r}:${i}`) ? " arriving" : ""}`,
          style: { marginTop: c.from === "board" ? "0" : `${lay.raise}px`, marginLeft: c.spare && i > 0 && !best[i - 1].spare ? `${KICKER_GAP}px` : "0" },
        }, cardEl(c.code, lay.size), h("div", { class: `bar ${c.from}` })))));
    }),
    sd.kind !== "draw" && sd.winners[0]?.hand ? h("div", { class: "showsub" }, sd.winners[0].hand.name + (sd.kind === "kicker" ? ` \u00B7 ${L("won_on_kicker")}` : "")) : null,
    countdown);
}

// Won with no cards shown: who won and why, where the winning cards would be.
export function uncontestedEl(view: View, n: number, countdown: HTMLElement | null): HTMLElement {
  const id = view.lastResult?.pots[0]?.winners[0]?.playerId ?? "";
  const name = view.players.find((p) => p.id === id)?.name ?? "";
  const pot = potSpot(n);
  return h("div", { class: "showcase uncontested", style: { left: `${pot.x}%`, top: `${pot.y}%` } },
    h("div", { class: "showtitle" }, L("wins_amount", name, chips(wonBy(view).get(id) ?? 0))),
    h("div", { class: "showsub" }, L("everyone_folded")),
    countdown);
}

// A shown hand's row: its combination (none for a winner, whose hand is over the pot) and the cards
// from its hand that the combination does not use.
export function challengeParts(p: PlayerView, winner: boolean): { best: OddsCard[]; unused: string[] } {
  const best = p.hand?.best ?? [];
  const used = new Set(best.map((c) => c.code));
  return { best: winner ? [] : best, unused: p.cards.filter((c): c is string => !!c && !used.has(c)) };
}

// A shown hand by its seat: the combination in reading order, cards from the hand nudged toward the
// table's edge and underlined green, the board's nudged toward the middle and underlined gold, then
// any deciding kickers; after a gap, the hand's cards it does not use, greyed.
export function challengeEl(p: PlayerView, k: number, n: number, winner: boolean, spot: Spot, open: ZoomRequest): HTMLElement | null {
  const { best, unused } = challengeParts(p, winner);
  const seat = seatSpot(k, n);
  // A seat level with the middle counts as lower.
  const upper = seat.y < 49.5;
  const out = k !== 0 && upper ? -1 : 1;
  const combo = best.map((c, i) => {
    const t = cardToken(c.code ?? "", c.from === "hole" ? "mine" : "board");
    t.style.transform = `translateY(${(c.from === "hole" ? out : -out) * 4}px)`;
    if (c.spare && i > 0 && !best[i - 1].spare) t.style.marginLeft = "6px";
    return t;
  });
  const rest = unused.map((c) => cardToken(c, "mine spare"));
  if (!combo.length && !rest.length) return null;
  // Tap it to see the hand large; a winner's row shows every winning hand.
  return h("div", { class: "challenge", style: { left: `${spot.x}px`, top: `${spot.y}px` }, onClick: () => (winner ? open("showcase") : open("hand", p.id)) },
    spot.named ? h("div", { class: "cname" }, p.name) : null,
    h("div", { class: "ctoks" }, ...combo, combo.length && rest.length ? h("span", { class: "gap" }) : null, ...rest));
}

// Players whose cards are face up at the end of a hand outside the showdown's rows: a winner nobody
// contested, or anyone who chose to show.
export function shownPlayers(view: View, sd: Showdown | null): PlayerView[] {
  if (view.phase !== "handOver") return [];
  return view.players.filter((p) => p.inHand && p.cards.length === 2 && p.cards.every((c) => c !== null) && !sd?.players.some((q) => q.id === p.id));
}

// Cards shown face up in front of a player: community-card size, underlined green; tap to see them large.
export function shownEl(p: PlayerView, spot: Spot, open: ZoomRequest): HTMLElement {
  return h("div", { class: "shownhand", style: { left: `${spot.x}px`, top: `${spot.y}px` }, onClick: () => open("hand", p.id) },
    spot.named ? h("div", { class: "cname" }, p.name) : null,
    h("div", { class: "shownrow" }, ...p.cards.map((c) => h("div", { class: "handcard" }, cardEl(c, 40), h("div", { class: "line green" })))));
}

// Where each shown hand goes at the end of a hand, in pixels of the table box: the rows of a showdown,
// and cards shown face up in front of a player. Each takes the free spot nearest its usual place (a
// row above or below its seat, yours above your seat; shown cards in front of the seat), clear of the
// board, the winning hands or the note of an uncontested win, the seats of the players showing and
// everything already placed; a folded player's seat counts against a spot but does not rule it out.
// One that has to go far from its seat says whose it is.
const ROW = { h: 42, name: 13, pitch: 28, step: 10, far: 100, folded: 200, touch: 4 };
const SHOWN = { w: 2 * 40 + 6 + 12, h: 56 + 8 + 12 };

export function challengeLayout(view: View, sd: Showdown | null, n: number, mySeat: number, W: number, H: number): Map<string, Spot> {
  const k = (p: PlayerView) => (((p.seat - mySeat) % n) + n) % n;
  const box = (cx: number, cy: number, w: number, h: number): Box => ({ l: cx - w / 2, t: cy - h / 2, r: cx + w / 2, b: cy + h / 2 });
  const hits = (a: Box, b: Box) => a.l < b.r - ROW.touch && b.l < a.r - ROW.touch && a.t < b.b - ROW.touch && b.t < a.b - ROW.touch;
  const seatBox = (kk: number): Box => { const s = seatSpot(kk, n); return { l: (W * s.x) / 100 - 43, t: (H * s.y) / 100 - 21, r: (W * s.x) / 100 + 43, b: (H * s.y) / 100 + 65 }; };
  const shown = shownPlayers(view, sd);
  const showing = new Set([...(sd?.players ?? []), ...shown].map(k));
  const pot = potSpot(n);
  const cx = (W * pot.x) / 100;
  const fixed: Box[] = [{ l: W / 2 - 108, t: H / 2 - 28, r: W / 2 + 108, b: H / 2 + 35 }, ...[...showing].map(seatBox)];
  if (sd) {
    const lay = showLayout(sd);
    const rowWidth = 5 * lay.size + 4 * SHOW_GAP + KICKER_GAP;
    const top = (H * pot.y) / 100 - lay.top;
    fixed.push({ l: cx - rowWidth / 2 - 72, t: top, r: cx + rowWidth / 2, b: top + lay.titleH + sd.winners.length * lay.rowH + (sd.kind === "draw" ? 0 : 14) + 7 });
  } else if (shown.length) {
    fixed.push(box(cx, (H * pot.y) / 100, 200, 76));
  }
  const folded = Array.from({ length: n }, (_, i) => i).filter((i) => !showing.has(i)).map(seatBox);
  type Item = { p: PlayerView; size: (named: boolean) => { w: number; h: number }; anchor: (h: number) => { x: number; y: number } };
  const items: Item[] = [];
  for (const p of sd?.players ?? []) {
    const { best, unused } = challengeParts(p, sd!.winners.some((w) => w.id === p.id));
    if (!best.length && !unused.length) continue;
    const kicker = best.some((c, i) => c.spare && i > 0 && !best[i - 1].spare);
    const w = (best.length + unused.length) * ROW.pitch - 3 + (best.length && unused.length ? 8 : 0) + (kicker ? 6 : 0) + 12;
    const s = seatSpot(k(p), n);
    const above = (s.y > 15 && s.y < 49.5) || s.y > 80;
    items.push({ p, size: (named) => ({ w, h: ROW.h + (named ? ROW.name : 0) }),
      anchor: (hh) => (k(p) === 0 ? { x: W / 2, y: H * 0.79 } : { x: (W * s.x) / 100, y: above ? (H * s.y) / 100 - 21 - hh / 2 - 2 : (H * s.y) / 100 + 65 + hh / 2 + 2 }) });
  }
  for (const p of shown) {
    const b = betSpot(k(p), n);
    items.push({ p, size: (named) => ({ w: SHOWN.w, h: SHOWN.h + (named ? ROW.name : 0) }), anchor: () => ({ x: (W * b.x) / 100, y: (H * b.y) / 100 }) });
  }
  items.sort((a, b) => (k(a.p) === 0 ? 0 : 1) - (k(b.p) === 0 ? 0 : 1) || Math.abs(seatSpot(k(a.p), n).y - 50) - Math.abs(seatSpot(k(b.p), n).y - 50));
  const placed: Box[] = [];
  const out = new Map<string, Spot>();
  for (const it of items) {
    let chosen: Spot | null = null;
    for (const named of [false, true]) {
      const { w, h: hh } = it.size(named);
      const a = it.anchor(hh);
      let best: { cost: number; x: number; y: number; d: number } | null = null;
      for (let y = hh / 2; y <= H - hh / 2; y += ROW.step) {
        for (let x = w / 2; x <= Math.max(w / 2, W - w / 2); x += ROW.step) {
          const r = box(x, y, w, hh);
          if (fixed.some((o) => hits(r, o)) || placed.some((o) => hits(r, o))) continue;
          const d = Math.hypot(x - a.x, y - a.y);
          const cost = d + ROW.folded * folded.filter((o) => hits(r, o)).length;
          if (!best || cost < best.cost) best = { cost, x, y, d };
        }
      }
      chosen = { x: best?.x ?? Math.min(Math.max(a.x, w / 2), W - w / 2), y: best?.y ?? Math.min(Math.max(a.y, hh / 2), H - hh / 2), w, h: hh, named };
      if ((best?.d ?? 0) <= ROW.far) break;
    }
    out.set(it.p.id, chosen!);
    placed.push(box(chosen!.x, chosen!.y, chosen!.w, chosen!.h));
  }
  return out;
}
