// The wire contract the four clients decode (contract.ts) built from the turn engine's view. The
// engine's view is generic (round, game, legal.game); this maps it to the poker view the web, Apple
// and Android clients already read, so the clients and the decoder fixtures stay as they are.
import type { View as EngineView } from "../../components/turn-engine/server/engine";
import { CONTRACT_VERSION, type ClockView, type HandResultView, type HandView, type Legal, type OddsCard, type OddsRow, type Phase, type PlayerView, type View } from "./contract";

export type LinkExtras = { inviteUrl: string | null; updateUrl: string | null };

// What the wire view needs besides the engine's view: the hand text and the odds the clients show, and the length of a level.
export type WireDeps = {
  evaluate(cards: string[]): { category: string; ranks: number[]; name: string };
  shownCards(hole: string[], board: string[], kickers: number): OddsCard[];
  oddsRows(hole: string[], board: string[]): OddsRow[];
  levelDurationMs: number;
};

const PHASE: Record<EngineView["phase"], Phase> = { lobby: "lobby", acting: "betting", auto: "runout", over: "handOver", offers: "rebuy", completed: "completed", cancelled: "cancelled" };

const NO_GAME: Pick<Legal, "fold" | "check" | "call" | "bet" | "show"> = { fold: false, check: false, call: null, bet: null, show: [] };

type PublicPlayer = Omit<PlayerView, "name" | "isBot" | "isHost" | "inHand" | "cards" | "status" | "place" | "connected" | "sittingOut" | "rebuysUsed" | "hand">;
type Outcome = { pots: { amount: number; winners: { playerId: string; amount: number; handName: string | null }[] }[]; showdown: HandResultView["showdown"]; voided: boolean };
type GamePart = { hand: HandView & { stage: string }; players: PublicPlayer[]; result: Outcome | null };

// The scheduler's description of the level in force, as the clients read it.
type LevelDescription = { level: number; values: { sb: number; bb: number }; next: { values: { sb: number; bb: number } } | null; msUntilNext: number | null };

function clockView(clock: unknown, levelDurationMs: number): ClockView | null {
  const c = clock as LevelDescription | null;
  if (!c) return null;
  const next = c.next ?? c;
  return { level: c.level, sb: c.values.sb, bb: c.values.bb, nextSb: next.values.sb, nextBb: next.values.bb, nextLevelInMs: c.msUntilNext ?? 0, levelDurationMs };
}

// holdem-rules' prompts name no one; the clients' prompts name the winner, so the result prompts are built here.
function promptOf(v: EngineView, result: Outcome | null, names: Map<string, string>): { key: string; text: string; args: (string | number)[] } {
  const plain = { key: v.promptKey, text: v.prompt, args: v.promptArgs };
  switch (v.promptKey) {
    case "dealingBoard": return { key: "runout", text: v.prompt, args: [] };
    case "facingBet": return { key: "yourTurnCall", text: v.prompt, args: v.promptArgs };
    case "checkOrBet": return { key: "yourTurn", text: v.prompt, args: [] };
    case "youWon": case "othersFolded": case "showdown": {
      if (!result) return plain;
      const winners = [...new Set(result.pots.flatMap((p) => p.winners.map((w) => w.playerId)))].map((id) => names.get(id) ?? id);
      const total = result.pots.reduce((n, p) => n + p.amount, 0);
      return winners.length === 1 ? { key: "handWon", text: `${winners[0]} wins ${total}.`, args: [winners[0], total] } : { key: "handSplit", text: `Split: ${winners.join(", ")}.`, args: [winners.join(", ")] };
    }
    default: return plain;
  }
}

export function toWireView(v: EngineView, links: LinkExtras, deps: WireDeps, options: Record<string, boolean> = {}): View {
  const game = v.game as GamePart | null;
  const names = new Map(v.players.map((p) => [p.id, p.name]));
  const board = game?.hand.board ?? [];
  const publicOf = new Map((game?.players ?? []).map((p) => [p.id, p]));
  const kickers = (game?.result ?? (v.lastResult as Outcome | null))?.showdown?.kickers ?? {};
  const players: PlayerView[] = v.players.map((p) => {
    const g = publicOf.get(p.id);
    const cards = ((p.game as { cards?: (string | null)[] } | null)?.cards ?? []) as (string | null)[];
    // Your own cards and any cards shown arrive as cards; the best five are worked out for whichever hand is face up.
    const faceUp = cards.length === 2 && cards.every((c): c is string => c !== null) && board.length >= 3;
    const ev = faceUp ? deps.evaluate([...(cards as string[]), ...board]) : null;
    return {
      id: p.id, name: p.name, seat: p.seat, isBot: p.isBot, isHost: p.isHost,
      // While a hand is live its own stack is the true one; the tournament's balance is updated when the hand ends.
      stack: g?.stack ?? p.stack,
      bet: g?.bet ?? 0, totalIn: g?.totalIn ?? 0,
      inHand: g !== undefined, folded: Boolean(g?.folded), allIn: Boolean(g?.allIn),
      cards,
      status: p.status, place: p.place, connected: p.connected, sittingOut: p.sittingOut, rebuysUsed: p.rebuysUsed,
      lastAction: g?.lastAction ?? null,
      hand: ev ? { category: ev.category, ranks: ev.ranks, name: ev.name, best: deps.shownCards(cards as string[], board, kickers[p.id] ?? 0) } : null,
    };
  });
  let hand: HandView | null = null;
  if (game && v.round) {
    const { stage: _stage, ...rest } = game.hand;
    hand = { ...rest, remainingMs: v.round.remainingMs, settleMs: v.round.settleMs };
  }
  const me = players.find((p) => p.id === v.you);
  const myCards = me && me.cards.length === 2 && me.cards.every((c) => c !== null) ? (me.cards as string[]) : null;
  const odds = options.odds && game && me && !me.folded && myCards && game.hand.stage !== "over" ? deps.oddsRows(myCards, board) : null;
  const legalGame = (v.legal.game ?? NO_GAME) as typeof NO_GAME;
  const legal: Legal = {
    start: v.legal.start, addBot: v.legal.addBot, kick: v.legal.kick, leave: v.legal.leave, sitOut: v.legal.sitOut, return: v.legal.return,
    fold: legalGame.fold, check: legalGame.check, call: legalGame.call, bet: legalGame.bet, rebuy: v.legal.rebuy, show: legalGame.show,
    pause: v.legal.pause, resume: v.legal.resume, cancel: v.legal.cancel, newGame: v.legal.newGame,
  };
  const last = v.lastResult as (Outcome & Omit<HandResultView, "pots">) | null;
  const lastResult: HandResultView | null = last ? { no: last.no, board: last.board, pots: last.pots.map((p) => ({ amount: p.amount, winners: p.winners })), uncontested: last.uncontested, voided: last.voided, showdown: last.showdown, holdMs: last.holdMs } : null;
  const prompt = promptOf(v, game?.result ?? null, names);
  return {
    contractVersion: CONTRACT_VERSION, version: v.version, gameNumber: v.gameNumber, roomId: v.roomId, you: v.you, holds: v.holds, display: v.display,
    status: v.status, phase: PHASE[v.phase], pauseReasons: v.pauseReasons as View["pauseReasons"], hostId: v.hostId, players, hand,
    lastResult, clock: clockView(v.clock, deps.levelDurationMs), rebuyOffers: v.rebuyOffers, winnerId: v.winnerId,
    history: v.history as unknown as View["history"], odds, legal,
    prompt: prompt.text, promptKey: prompt.key, promptArgs: prompt.args,
    inviteUrl: links.inviteUrl, updateUrl: links.updateUrl,
  };
}
