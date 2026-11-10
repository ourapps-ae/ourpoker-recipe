// Wire types shared by every client. Change only with a CONTRACT_VERSION bump.

export const CONTRACT_VERSION = 1;

// The two permanent rooms.
export const ROOM_IDS = ["casino", "home"] as const;
export type RoomId = (typeof ROOM_IDS)[number];

// Two characters: rank 2-9, T, J, Q, K, A then suit c, d, h, s. Example "As", "Td".
export type Card = string;

export type Status = "lobby" | "running" | "completed" | "cancelled";

export type Street = "preflop" | "flop" | "turn" | "river";

// What the table is doing right now. `running` splits into betting, runout (everyone left is
// all-in, board being dealt), handOver (result on show) and rebuy (offers pending).
export type Phase = "lobby" | "betting" | "runout" | "handOver" | "rebuy" | "completed" | "cancelled";

export type PauseReason = "hostAbsent" | "allOffline" | "manual";

export type Action =
  | { type: "start" }
  | { type: "addBot" }
  | { type: "kick"; playerId: string }
  | { type: "leave" }
  | { type: "sitOut" }
  | { type: "return" }
  | { type: "fold" }
  | { type: "check" }
  | { type: "call" }
  | { type: "bet"; to: number }
  | { type: "rebuy"; accept: boolean }
  | { type: "show"; cards: number[] }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "cancel" }
  | { type: "newGame" };

export type ActionType = Action["type"];

export type ErrorCode =
  | "badName"
  | "roomFull"
  | "badToken"
  | "staleVersion"
  | "badRequest"
  | "notYourTurn"
  | "wrongPhase"
  | "notEnoughPlayers"
  | "badAmount"
  | "badTarget"
  | "notAllowed"
  | "paused";

export type PlayerStatus = "in" | "out";

export type PlayerView = {
  id: string;
  name: string;
  seat: number;
  isBot: boolean;
  isHost: boolean;
  stack: number;
  // Chips in front of the player this street, and in total this hand.
  bet: number;
  totalIn: number;
  inHand: boolean;
  folded: boolean;
  allIn: boolean;
  // null entries are face down; your own cards and shown cards carry the card.
  cards: (Card | null)[];
  status: PlayerStatus;
  place: number | null;
  connected: boolean;
  sittingOut: boolean;
  rebuysUsed: number;
  lastAction: LastAction | null;
  // Best five-card hand, present once the cards are shown; `name` is English, clients may
  // build their own text from category and ranks (0 is a two, 12 an ace). `best` is the
  // combination's cards in reading order, from the hand or the board, then (marked spare) the
  // kickers that decided the showdown.
  hand: { category: string; ranks: number[]; name: string; best: OddsCard[] } | null;
};

export type LastAction = {
  kind: "blind" | "fold" | "check" | "call" | "bet" | "raise" | "allIn";
  amount: number | null;
  // True when the server acted for an absent or timed-out player.
  auto: boolean;
};

export type PotView = { amount: number; eligible: string[] };

export type HandView = {
  no: number;
  level: number;
  sb: number;
  bb: number;
  button: number;
  sbSeat: number;
  bbSeat: number;
  street: Street;
  board: Card[];
  pots: PotView[];
  // Chips wagered this hand that are not yet in a pot, for display as the live pot.
  potTotal: number;
  currentBet: number;
  actorId: string | null;
  // Milliseconds left on a human actor's decision clock (including the settle before it starts),
  // the next runout card or the result pause; frozen while paused. null for a computer player
  // or a player being skipped.
  remainingMs: number | null;
  // Milliseconds of the settle still to run before the actor's clock starts, null outside betting.
  settleMs: number | null;
  // What the table is settling on: the deal, a new street or the last action by lastActorId.
  event: "deal" | "flop" | "turn" | "river" | "action" | null;
  lastActorId: string | null;
};

export type WinnerView = { playerId: string; amount: number; handName: string | null };

export type HistoryEntry = {
  no: number;
  level: number;
  winners: { playerId: string; amount: number }[];
  voided: boolean;
};

// How the main pot was won when cards were shown: on the combination, on a kicker (a card
// outside the combination decided it), or a draw (the pot shared). `kickers` per hand: how many
// of its kickers its shown cards (`hand.best`) include after the combination.
export type ShowdownView = { kind: "combination" | "kicker" | "draw"; winners: string[]; kickers: Record<string, number> };

export type HandResultView = {
  no: number;
  board: Card[];
  pots: { amount: number; winners: WinnerView[] }[];
  uncontested: boolean;
  voided: boolean;
  showdown: ShowdownView | null;
  // How long the result stays up, from the end of the hand.
  holdMs: number;
};

export type ClockView = {
  level: number;
  sb: number;
  bb: number;
  nextSb: number;
  nextBb: number;
  // Unpaused milliseconds until the next level.
  nextLevelInMs: number;
  levelDurationMs: number;
};

export type RebuyOfferView = { playerId: string; remainingMs: number };

// A card of a possible hand, in reading order: a known card (`code`) from the viewer's hand or
// the board, or one still to come (`from: "needed"`, code null) known by rank, suit, both or
// neither. Spare cards are the kickers that fill the five without being part of the pattern.
export type OddsCard = { code: Card | null; rank: string | null; suit: string | null; from: "hole" | "board" | "needed"; spare: boolean };

// One way the viewer's hand can finish: the chance its needed cards turn up by the river (1 for
// the hand already made), how it ranks (1 is a royal flush) and its cards in reading order (a
// straight low to high, otherwise the pattern's groups as ranked, then the kickers). A category
// with several ways (a full house by either pair) has one row per way.
export type OddsRow = {
  category: string;
  rank: number;
  probability: number;
  cards: OddsCard[];
  // poker-odds' flag for a row that groups rarer ways and shows no cards.
  more: boolean;
};

export type Legal = {
  start: boolean;
  addBot: boolean;
  kick: boolean;
  leave: boolean;
  sitOut: boolean;
  return: boolean;
  fold: boolean;
  check: boolean;
  // Chips to call, or null when calling is not possible. May be less than the current bet
  // when the player is short and would be all-in.
  call: number | null;
  // Allowed range for a bet or raise given as the total for the street; max is all-in.
  bet: { min: number; max: number; opening: boolean } | null;
  rebuy: boolean;
  show: number[];
  pause: boolean;
  resume: boolean;
  cancel: boolean;
  newGame: boolean;
};

export type View = {
  contractVersion: number;
  version: number;
  gameNumber: number;
  roomId: string;
  // The viewer's player id; "" for a display, which shows the table to everyone sitting round it.
  you: string;
  // Players holding the play clock: looking at the cards at the end of a hand ("look") or
  // reading a guide ("learn"). While any hold is on, every countdown stands still.
  holds: { playerId: string; kind: "look" | "learn" }[];
  display: boolean;
  status: Status;
  phase: Phase;
  pauseReasons: PauseReason[];
  hostId: string | null;
  players: PlayerView[];
  hand: HandView | null;
  lastResult: HandResultView | null;
  clock: ClockView | null;
  rebuyOffers: RebuyOfferView[];
  winnerId: string | null;
  history: HistoryEntry[];
  // Only when asked for (`odds=1`) and the viewer holds cards in a live hand.
  odds: OddsRow[] | null;
  legal: Legal;
  prompt: string;
  promptKey: string;
  promptArgs: (string | number)[];
  inviteUrl: string | null;
  updateUrl: string | null;
};

// Public summary of a room for the home screen, no token needed.
export type RoomInfo = {
  id: string;
  status: Status;
  playerCount: number;
  names: string[];
};

// Response of the store's /latest route, relayed by GET /update for the apps.
export type UpdateInfo = {
  name: string;
  version: string;
  // Opens TestFlight on an iPhone or iPad; null until the app is on TestFlight.
  testflightUrl: string | null;
  // The newest build Apple has approved on TestFlight: what an iPhone or iPad can update to.
  testflightVersion: string | null;
  android: { apkUrl: string } | null;
};

export type ErrorBody = { error: ErrorCode; message: string; view?: View };

// Video room access, present when the server has LiveKit configured.
export type VideoGrant = { url: string; token: string; room: string } | null;

export type JoinResponse = { token: string; playerId: string; spectator: boolean; view: View; video: VideoGrant };
// POST /r/<room>/display: a token for GET /state (the display view) and POST /display/leave.
export type DisplayJoinResponse = { token: string; view: View };
