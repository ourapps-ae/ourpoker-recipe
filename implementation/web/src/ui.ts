// The recipe's one door to the shared interface parts: the controls, card and chip graphics, number
// formats and the room artwork, in the shapes the screens were written against.
import { h } from "../../components/controls/web/dom";
import { badgedIcon, icon, type IconName } from "../../components/controls/web/icons";
import { formatCount, mmss } from "../../components/controls/web/format";
import { cardEl as drawCard } from "../../components/card-graphics/web/cards";
import { pileEl as drawPile } from "../../components/chip-graphics/web/chips";
import { PLACED } from "../../components/table-layout/web/placed-seats";
import { clockwiseTarget, relativeSeat, ringPoint, seatAngle, tableCardWidth } from "../../components/table-layout/web/layout";
import { L } from "./i18n";
import { look } from "./configuration";

export { h, icon, mmss, PLACED, clockwiseTarget, relativeSeat, ringPoint, seatAngle, tableCardWidth };
export type { IconName };

// The computer-player icon with a small plus in the corner.
export const addBotIcon = (size = 24) => badgedIcon("robot", "plus", size);

export const chips = formatCount;

// Card artwork per room: a back and the court cards, for the files that shipped. `art/manifest.json`
// lists them; nothing is probed.
let cardTheme = "casino";
let artFiles = new Set<string>();

export function setCardTheme(theme: string) {
  cardTheme = theme;
}

export async function loadArtManifest(onReady: () => void) {
  try {
    const r = await fetch("./art/manifest.json");
    if (r.ok) artFiles = new Set((await r.json()) as string[]);
  } catch {
    // No manifest: every card is drawn in code.
  }
  onReady();
}

const artFor = (name: string) => (artFiles.has(name) ? `./art/${name}` : null);
const rankText = (rank: string) => L(`rank_${rank}`);

// A playing card at `width` px: null is face down.
export function cardEl(code: string | null, width: number, opts: { dim?: boolean; onClick?: () => void; tappable?: boolean } = {}): HTMLElement {
  return drawCard(code, { width, theme: cardTheme, artFor, rankLabel: rankText, settings: { backStyle: look.cardBack }, ...opts });
}

// A pile of chips for an amount; `size` is the chip diameter in px.
export function pileEl(amount: number, size = 14, label = true): HTMLElement {
  return drawPile(amount, { size, label, format: formatCount });
}
