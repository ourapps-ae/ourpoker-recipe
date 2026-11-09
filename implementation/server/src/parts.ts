// Composition: selects the components that fill each of the turn engine's parts, each through its own interface, and
// gives them the numbers from the house rules (rules.ts). The components know nothing of each other.
import type { EngineSettings } from "../../components/turn-engine/server/engine";
import type { Parts } from "../../components/turn-engine/server/parts";
import { advance, create as createClock, elapsed, reset, wallAt } from "../../components/game-clock/server/clock";
import { redact } from "../../components/private-views/server/private-views";
import { createPresenceApi } from "../../components/presence/server/presence";
import { createHistoryApi } from "../../components/round-history/server/history";
import { awardPot, buildPots, commit, createLedgerApi, displayPots, endRound, fold, nextHand, returnUncalled, setSeats, settle, stakeOf, validateSettings, voidHand } from "../../components/chip-ledger/server/ledger";
import { createScheduleApi, scheduleFromRules } from "../../components/level-schedule/server/levels";
import { createShuffledDeck } from "../../components/card-deck/server/deck";
import { createSeating, type SeatingSettings } from "../../components/seating/server/seating";
import { createIdentityApi } from "../../components/guest-identity/server/identity";
import { createTournament } from "../../components/tournament/server/tournament";
import { createGameRules } from "../../components/holdem-rules/server/index";
import { handRanking } from "../../components/poker-hand-ranking/server/index";
import { createOdds } from "../../components/poker-odds/server/index";
import { house, rules } from "./rules";
import { createComputerPlayers } from "./computers";

export const odds = createOdds(handRanking);

// level-schedule: the blind table, the level length and the doubling after the last level all come from the rules file.
export const schedule = createScheduleApi(scheduleFromRules(house));

// chip-ledger: one ledger for the whole tournament; hands move chips through it. `setSeats` lets the tournament tell it
// where each person sits, so the odd chip of a split pot goes clockwise from the button.
const ledger = {
  ...createLedgerApi({
    startingStack: house.chips.starting_stack, minimumUnit: house.chips.minimum_unit, sidePots: house.betting.side_pots,
    oddChipRule: "clockwise-after-button", seats: house.players.maximum,
  }),
  setSeats,
};

// holdem-rules over card-deck, chip-ledger, level-schedule, hand ranking and the rules reader. The application offers
// the odds panel as an option, which the clients switch on and off.
const holdem = createGameRules({
  ranking: handRanking,
  ledger: { validateSettings, stakeOf, commit, fold, endRound, returnUncalled, buildPots, displayPots, awardPot, settle, voidHand, nextHand },
  deck: { createShuffledDeck },
  schedule,
  rules,
});
const pokerRules: Parts["rules"] = { ...holdem, optionNames: ["odds"] };

// guest-identity owns names and tokens: seating checks names with it and realtime-rooms (room.ts) claims and authenticates through it.
export const identity = createIdentityApi();

const seating = createSeating(
  {
    minimumPlayers: house.players.minimum, maximumPlayers: house.players.maximum, seating: house.players.seating as SeatingSettings["seating"],
    returnToStack: house.players.return_to_existing_stack_allowed, hostRemovesPeople: false,
  },
  identity,
);

const tournament = createTournament(
  {
    startingStack: house.chips.starting_stack, rebuysPerPlayer: house.rebuy.maximum_per_player, rebuyStack: house.rebuy.stack_awarded,
    lastRebuyLevel: house.rebuy.eligibility.maximum_level, rebuyDecisionSeconds: house.rebuy.decision_seconds, tiebreak: "stackAtDeal",
  },
  { ledger, schedule, seating },
);

// Computer players: computers.ts (computer-players over poker-strategy), at human pace.
const computers = createComputerPlayers({ odds, clock: { elapsed, wallAt }, seating });

export const parts: Parts = {
  rules: pokerRules, seating, clock: { create: createClock, advance, reset, elapsed, wallAt }, views: { redact },
  presence: createPresenceApi(), tournament, computers, history: createHistoryApi(), settings: rules,
};

// decisionSeconds stays null so the engine reads timing.decision_seconds from the house rules.
export const engineSettings: Partial<EngineSettings> = { decisionSeconds: null, settleMs: 4000, staleMinutes: 30, standingsSeconds: 20, lobbyDropSeconds: 60 };
