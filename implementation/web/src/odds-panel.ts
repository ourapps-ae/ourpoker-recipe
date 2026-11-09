// The possible hands for your cards, most likely first, each with its rank (1 is a royal flush) and
// the known cards that make it: yours underlined green, the community cards gold, the rest still to
// come red. Folds away with a tap; the choice is kept on this device. The numbers come from the
// poker-odds component on the server; this is how they are shown.
import type { OddsCard, PlayerView, View } from "./api";
import { L } from "./i18n";
import type { State, Store } from "./store";
import { h } from "./ui";

const SUIT_GLYPH: Record<string, string> = { c: "\u2663", d: "\u2666", h: "\u2665", s: "\u2660" };

function rankLabel(r: string): string {
  return "TJQKA".includes(r) ? L("rank_" + r) : r;
}

// A card as a small text token, red or black, bordered gold for yours and grey for the table's.
export function cardToken(code: string, cls: string): HTMLElement {
  const suit = code[1];
  const red = suit === "h" || suit === "d";
  return h("span", { class: `tok ${cls}${red ? " red" : ""}` }, rankLabel(code[0]) + SUIT_GLYPH[suit]);
}

// A card still to come that the hand needs, underlined red: "K?" for any king, "?" and a suit for any
// card of that suit, "K" and a suit for one card, "?" when the board must make it by itself.
function neededToken(nc: { rank: string | null; suit: string | null }): HTMLElement {
  const red = nc.suit === "h" || nc.suit === "d";
  const text = (nc.rank ? rankLabel(nc.rank) : "?") + (nc.suit ? SUIT_GLYPH[nc.suit] : nc.rank ? "?" : "");
  return h("span", { class: `tok needed${red ? " red" : ""}` }, text);
}

// Consecutive cards that make the hand (core) or are kickers.
function runs(cards: OddsCard[]): { core: boolean; cards: OddsCard[] }[] {
  const out: { core: boolean; cards: OddsCard[] }[] = [];
  for (const c of cards) {
    const last = out[out.length - 1];
    if (last && last.core === !c.spare) last.cards.push(c);
    else out.push({ core: !c.spare, cards: [c] });
  }
  return out;
}

const percentText = (p: number) => (p >= 0.1 ? `${Math.round(p * 100)}%` : p >= 0.0005 ? `${(p * 100).toFixed(1)}%` : "<0.1%");

export function handPanel(store: Store, s: State, view: View, me: PlayerView): HTMLElement | null {
  if (!me.inHand || me.folded || me.cards.length !== 2 || me.cards.some((c) => c === null) || view.phase === "handOver") return null;
  const open = s.handPanel;
  const rows = view.odds ?? [];
  return h("div", { class: `panel hands${open ? " open" : ""}`, "data-guide": "odds" },
    h("button", { class: "hands-head", onClick: () => store.toggleHandPanel() },
      h("span", { class: "title" }, L("hands_panel")),
      open ? h("span", { class: "legend" }, h("i", { class: "key mine" }), L("in_hand"), h("i", { class: "key board" }), L("on_table"), h("i", { class: "key needed" }), L("waiting_for")) : null,
      h("span", { class: "chev" }, open ? "\u25BE" : "\u25B4"),
    ),
    open
      ? h("div", { class: "hands-rows" }, ...(rows.length
          ? rows.map((r) => h("div", { class: "hands-row" },
              h("span", { class: "rankno" }, `#${r.rank}`),
              h("span", { class: "hname" }, L("hand_" + r.category) + (r.more ? ` (${L("other_ways")})` : "")),
              h("span", { class: "prob" }, percentText(r.probability)),
              // In reading order from the server: a straight low to high, pairs grouped, kickers last.
              h("span", { class: "hcards" }, ...runs(r.cards).map((run) => h("span", { class: run.core ? "run core" : "run" },
                ...run.cards.map((c) => (c.code ? cardToken(c.code, `${c.from === "hole" ? "mine" : "board"}${c.spare ? " spare" : ""}`) : neededToken(c)))))),
            ))
          : [h("div", { class: "muted" }, "\u2026")]))
      : null,
  );
}
