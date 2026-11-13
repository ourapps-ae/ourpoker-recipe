// The shared display: the public table for a television or any shared screen. It shows the board, the
// pots, every seat and the standings; it never shows private cards and never acts.
import { formatClock } from "../../components/game-clock/web/index";
import type { View } from "./api";
import { cardEl, chips, h } from "./ui";
import { actionText, L, promptText, roomName } from "./i18n";
import { errorText, modeLabel } from "./screens";
import type { State, Store } from "./store";

function countdown(ms: number, s: State, frozen: boolean) {
  const remaining = Math.max(0, ms - (frozen ? 0 : Date.now() - s.viewAt));
  return h("span", frozen ? {} : { "data-board-deadline": String(s.viewAt + ms) }, formatClock(remaining));
}

setInterval(() => {
  document.querySelectorAll<HTMLElement>("[data-board-deadline]").forEach((el) => {
    el.textContent = formatClock(Math.max(0, Number(el.dataset.boardDeadline) - Date.now()));
  });
}, 250);

export function boardScreen(store: Store, s: State, view: View): HTMLElement {
  if (!view.display || view.you || view.odds) return h("div", { class: "error" }, L("table_reset"));
  const hand = view.hand;
  const frozen = view.pauseReasons.length > 0 || Boolean(view.holds?.length);
  const result = view.lastResult;
  const results = view.phase === "handOver" || view.status === "completed";
  const board = hand?.board.length ? hand.board : results ? result?.board ?? [] : [];
  const potTotal = results && result ? result.pots.reduce((sum, pot) => sum + pot.amount, 0) : hand?.potTotal ?? 0;
  const players = [...view.players].sort((a, b) => results && a.place !== null && b.place !== null ? a.place - b.place : a.seat - b.seat);
  return h("section", { class: "board-screen", "aria-label": modeLabel("board") },
    h("header", { class: "row spread" },
      h("h2", {}, `${roomName(view.roomId)} · ${modeLabel("board")}`),
      h("button", { class: "btn ghost", "data-focus": "board-exit", onClick: () => { void store.leave(); } }, L("viewer_stop"))),
    h("div", { class: "banner", role: "status" }, h("span", { class: "text" }, promptText(view)),
      hand?.remainingMs != null ? countdown(hand.remainingMs, s, frozen) : null),
    h("div", { class: "muted", role: "status" }, s.roomDown ? L("unreachable") : L("join_as_viewer")),
    view.clock ? h("div", { class: "levelcard" },
      L("level", view.clock.level), " · ", L("blinds", chips(view.clock.sb), chips(view.clock.bb)), " · ",
      countdown(view.clock.nextLevelInMs, s, frozen || view.phase === "rebuy")) : null,
    h("div", { class: "board-community panel" },
      h("div", { class: "board-cards" }, ...Array.from({ length: 5 }, (_, i) => board[i]
        ? cardEl(board[i], 56)
        : h("div", { class: "card slot", style: { width: "56px", height: "78px" } }))),
      h("div", { class: "board-pot" }, `${L("pot")} ${chips(potTotal)}`),
      ...(hand?.pots ?? []).map((pot, i) => h("div", { class: "muted" }, `${L("pot")} ${i + 1}: ${chips(pot.amount)}`)),
      results && result ? h("div", { class: "board-results" }, ...result.pots.flatMap((pot) => pot.winners.map((winner) =>
        h("div", {}, L("wins_amount", view.players.find((p) => p.id === winner.playerId)?.name ?? "", chips(winner.amount)))))) : null),
    view.status === "completed" || view.status === "cancelled" ? h("h2", {}, L(view.status === "cancelled" ? "cancelled_title" : "standings")) : null,
    players.length ? h("div", { class: "board-seats" }, ...players.map((p) => {
      const actor = hand?.actorId === p.id;
      const status = p.status === "out" ? L("out") : p.sittingOut ? L("sitting_out") : !p.connected && !p.isBot ? L("away") : p.folded ? L("folded") : p.allIn ? L("all_in_mark") : "";
      return h("article", { class: `board-seat panel${actor ? " active" : ""}`, "data-player": p.id },
        h("div", { class: "row spread" }, h("strong", {}, `${p.place ?? p.seat + 1}. ${p.name}`),
          h("span", { class: "muted" }, hand?.button === p.seat ? "D" : "")),
        h("div", { class: "board-stack" }, chips(p.stack)),
        h("div", { class: "muted" }, status),
        h("div", { class: "board-cards" }, ...p.cards.map((card) => cardEl(card, 44))),
        p.hand?.best?.length ? h("div", { class: "board-best" }, ...p.hand.best.map((card) => cardEl(card.code, 30))) : null,
        p.bet ? h("div", {}, actionText({ kind: "bet", amount: p.bet, auto: false })) : null,
        p.lastAction ? h("div", { class: "muted" }, actionText(p.lastAction)) : null,
        actor && hand?.remainingMs != null ? countdown(hand.remainingMs, s, frozen) : null,
        ...view.rebuyOffers.filter((offer) => offer.playerId === p.id).map((offer) => h("div", {}, L("rebought"), " ", countdown(offer.remainingMs, s, frozen))));
    })) : h("div", { class: "panel center" }, L("room_empty")),
    errorText(s.error) ? h("div", { class: "error" }, errorText(s.error)) : null);
}
