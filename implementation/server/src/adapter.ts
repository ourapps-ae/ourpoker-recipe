// The game adapter realtime-rooms calls: the turn engine over this recipe's parts, answering in the
// poker wire view.
import { createGameAdapter } from "../../components/turn-engine/server/index";
export type { GameAdapter } from "../../components/turn-engine/server/index";
import { handRanking } from "../../components/poker-hand-ranking/server/index";
import { engineSettings, odds, parts, schedule } from "./parts";
import { toWireView, type LinkExtras, type WireDeps } from "./wire";
export { toWireView };

const wireDeps: WireDeps = {
  evaluate: (cards) => handRanking.evaluate(cards),
  shownCards: (hole, board, kickers) => odds.shownCards(hole, board, kickers),
  oddsRows: (hole, board) => odds.rows(hole, board),
  levelDurationMs: schedule.schedule.settings.levelSeconds * 1000,
};

export function pokerAdapter(links: LinkExtras) {
  const base = createGameAdapter(parts, engineSettings);
  return { ...base, view: (...args: Parameters<typeof base.view>) => toWireView(base.view(...args), links, wireDeps, args[2]) };
}
