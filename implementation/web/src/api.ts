// Server contract (mirrors server/src/contract.ts) and the REST client.
export const DEFAULT_SERVER = "{{serverAddress}}";
export const SERVER = import.meta.env.VITE_SERVER ?? DEFAULT_SERVER;

export type Card = string;
export type Status = "lobby" | "running" | "completed" | "cancelled";
export type Phase = "lobby" | "betting" | "runout" | "handOver" | "rebuy" | "completed" | "cancelled";
export type PauseReason = "hostAbsent" | "allOffline" | "manual";
export type Street = "preflop" | "flop" | "turn" | "river";

export type LastAction = { kind: "blind" | "fold" | "check" | "call" | "bet" | "raise" | "allIn"; amount: number | null; auto: boolean };

export type PlayerView = {
  id: string; name: string; seat: number; isBot: boolean; isHost: boolean; stack: number; bet: number; totalIn: number;
  inHand: boolean; folded: boolean; allIn: boolean; cards: (Card | null)[]; status: "in" | "out"; place: number | null;
  connected: boolean; sittingOut: boolean; rebuysUsed: number; lastAction: LastAction | null;
  hand: { category: string; ranks: number[]; name: string; best?: OddsCard[] } | null;
};
export type HandView = {
  no: number; level: number; sb: number; bb: number; button: number; sbSeat: number; bbSeat: number; street: Street; board: Card[];
  pots: { amount: number; eligible: string[] }[]; potTotal: number; currentBet: number; actorId: string | null; remainingMs: number | null;
  settleMs: number | null; event: "deal" | "flop" | "turn" | "river" | "action" | null; lastActorId: string | null;
};
export type WinnerView = { playerId: string; amount: number; handName: string | null };
export type ShowdownView = { kind: "combination" | "kicker" | "draw"; winners: string[]; kickers: Record<string, number> };
export type HandResultView = {
  no: number; board: Card[]; pots: { amount: number; winners: WinnerView[] }[]; uncontested: boolean; voided: boolean;
  showdown?: ShowdownView | null; holdMs?: number;
};
export type ClockView = { level: number; sb: number; bb: number; nextSb: number; nextBb: number; nextLevelInMs: number; levelDurationMs: number };
export type OddsCard = { code: Card | null; rank: string | null; suit: string | null; from: "hole" | "board" | "needed"; spare: boolean };
export type OddsRow = { category: string; rank: number; probability: number; cards: OddsCard[]; more: boolean };
export type Legal = {
  start: boolean; addBot: boolean; kick: boolean; leave: boolean; sitOut: boolean; return: boolean; fold: boolean; check: boolean;
  call: number | null; bet: { min: number; max: number; opening: boolean } | null; rebuy: boolean; show: number[];
  pause: boolean; resume: boolean; cancel: boolean; newGame: boolean;
};
export type View = {
  contractVersion: number; version: number; gameNumber: number; roomId: string; you: string; display?: boolean; holds?: { playerId: string; kind: "look" | "learn" }[]; status: Status; phase: Phase;
  pauseReasons: PauseReason[]; hostId: string | null; players: PlayerView[]; hand: HandView | null; lastResult: HandResultView | null;
  clock: ClockView | null; rebuyOffers: { playerId: string; remainingMs: number }[]; winnerId: string | null;
  history: { no: number; level: number; winners: { playerId: string; amount: number }[]; voided: boolean }[];
  odds: OddsRow[] | null;
  legal: Legal; prompt: string; promptKey: string; promptArgs: (string | number)[]; inviteUrl: string | null; updateUrl: string | null;
};
export function playerName(view: View, id: string | null): string {
  return view.players.find((p) => p.id === id)?.name ?? "someone";
}

export type RoomInfo = { id: string; status: Status; playerCount: number; names: string[] };
export type JoinResponse = { token: string; playerId: string; spectator: boolean; view: View; video: { url: string; token: string; room: string } | null };
export type DisplayResponse = { token: string; view: View };

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly view?: View;
  constructor(status: number, code: string, message: string, view?: View) {
    super(message);
    this.status = status;
    this.code = code;
    this.view = view;
  }
}

async function send<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json", ...(init.headers as Record<string, string>) };
  if (token) headers.authorization = `Bearer ${token}`;
  const r = await fetch(SERVER + path, { ...init, headers });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, body.error ?? "http", body.message ?? `Server error ${r.status}`, body.view);
  return body as T;
}

export const api = {
  display: (roomId: string) => send<DisplayResponse>(`/r/${roomId}/display`, { method: "POST", body: "{}" }),
  displayLeave: (roomId: string, token: string) => send<{ ok: boolean }>(`/r/${roomId}/display/leave`, { method: "POST", body: "{}" }, token),
  join: (roomId: string, name: string) => send<JoinResponse>(`/r/${roomId}/join`, { method: "POST", body: JSON.stringify({ name }) }),
  action: (roomId: string, token: string, expectedVersion: number, type: string, fields: Record<string, unknown> = {}, odds = false) =>
    send<View>(`/r/${roomId}/action`, { method: "POST", body: JSON.stringify({ type, expectedVersion, odds, ...fields }) }, token),
};
