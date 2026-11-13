// The betting controls: your chips (tap to bet or raise), the pill for Call or the opening bet, fold
// and check, and the bet bar while choosing an amount. What the quick amounts and the confirm button
// mean comes from the holdem-rules component (web/betting.ts); this draws them.
import type { PlayerView, View } from "./api";
import { betKind, canSlide, presets, stepFor } from "../../components/holdem-rules/web/index";
import { L } from "./i18n";
import { play } from "./sound";
import type { State, Store } from "./store";
import { chips, h, pileEl } from "./ui";

export type PlayControls = { callPill: HTMLElement; stack: HTMLElement; bar: HTMLElement | null };

export function playControls(store: Store, s: State, view: View, me: PlayerView, canAct: boolean): PlayControls {
  const legal = view.legal;
  const hand = view.hand;
  const range = legal.bet;
  const stack = h("div", {},
    canAct && range && !range.opening ? h("button", { class: "callpill", onClick: () => store.set({ betTo: range.min }) }, L("move_raise")) : null,
    h("div", { class: `mystack${canAct && range ? " live glow" : ""}`, title: L("your_chips"), onClick: () => { if (canAct && range) { play("click"); store.set({ betTo: range.min }); } } }, pileEl(me.stack, 12)));
  const callPill = canAct && legal.call !== null
    ? h("button", { class: "callpill glow", onClick: () => store.act("call") }, legal.call >= me.stack ? L("all_in") : L("call", chips(legal.call)))
    : canAct && range && range.opening
      ? h("button", { class: "callpill glow", onClick: () => store.act("bet", { to: range.min }) }, range.min >= me.stack + me.bet ? L("all_in") : L("bet_to", chips(range.min)))
      : h("div", { class: "callpill hint" });
  let bar: HTMLElement | null = null;
  if (legal.fold && range && s.betTo !== null) {
    const step = stepFor(hand?.sb);
    const quick = presets({ range, pot: hand?.potTotal ?? 0, toCall: legal.call, currentBet: hand?.currentBet ?? 0, smallBlind: hand?.sb });
    const kind = betKind(s.betTo, range);
    bar = h("div", { class: "betbar" },
      h("div", { class: "row spread" },
        h("span", { class: "amount" }, chips(s.betTo)),
        h("div", { class: "row", style: { gap: "4px" } },
          h("button", { class: "chipbtn", onClick: () => store.set({ betTo: quick.min }) }, L("min")),
          h("button", { class: "chipbtn", onClick: () => store.set({ betTo: quick.halfPot }) }, L("half_pot")),
          h("button", { class: "chipbtn", onClick: () => store.set({ betTo: quick.pot }) }, L("pot")),
          h("button", { class: "chipbtn", onClick: () => store.set({ betTo: quick.allIn }) }, L("all_in")),
        ),
      ),
      canSlide(range, step) ? h("input", { type: "range", min: range.min, max: range.max, step, value: s.betTo, class: "slider", onInput: (e: Event) => store.set({ betTo: Number((e.target as HTMLInputElement).value) }) }) : null,
      h("div", { class: "row", style: { gap: "8px" } },
        h("button", { class: "btn ghost grow", onClick: () => store.set({ betTo: null }) }, L("cancel")),
        h("button", { class: "btn grow", disabled: !canAct, onClick: () => store.act("bet", { to: s.betTo }) },
          kind === "allIn" ? L("all_in") : L(kind === "bet" ? "bet_to" : "raise_to", chips(s.betTo))),
      ),
    );
  }
  const choices = h("div", { class: "movechoices" },
    canAct ? h("button", { class: "callpill", onClick: () => store.act("fold") }, L("move_fold")) : null,
    canAct && legal.check ? h("button", { class: "callpill", onClick: () => store.act("check") }, L("move_check")) : null,
    callPill);
  return { callPill: choices, stack, bar };
}

// Over your cards on your turn: a double tap checks (when you may), a flick up folds.
export function hintsEl(legal: View["legal"], dots: () => HTMLElement): HTMLElement {
  return h("div", { class: "hints" },
    legal.check ? h("span", { class: "hint" }, dots(), L("check")) : null,
    h("span", { class: "hint" }, "\u2191 ", L("fold")));
}

// A tap, a double tap and a flick up, told apart: with a double-tap action a single tap waits until a
// second tap is ruled out. Pointer events, so it works with a mouse too.
export function taps(el: HTMLElement, on: { single: () => void; double?: () => void; flick?: () => void }) {
  let down: { x: number; y: number; t: number } | null = null;
  let pending = 0;
  el.addEventListener("pointerdown", (e) => {
    down = { x: e.clientX, y: e.clientY, t: Date.now() };
    try { el.setPointerCapture(e.pointerId); } catch { /* a pointer the browser no longer tracks */ }
  });
  el.addEventListener("pointerup", (e) => {
    if (!down) return;
    const dy = e.clientY - down.y;
    const dx = Math.abs(e.clientX - down.x);
    const dt = Date.now() - down.t;
    down = null;
    if (on.flick && dy < -40 && dx < 80 && dt < 600) {
      clearTimeout(pending);
      pending = 0;
      on.flick();
      return;
    }
    if (Math.abs(dy) >= 12 || dx >= 12) return;
    if (!on.double) return on.single();
    if (pending) {
      clearTimeout(pending);
      pending = 0;
      on.double();
    } else pending = window.setTimeout(() => { pending = 0; on.single(); }, 300);
  });
  el.addEventListener("pointercancel", () => { down = null; });
}
