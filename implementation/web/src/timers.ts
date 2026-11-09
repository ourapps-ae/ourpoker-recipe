// Countdown bars: each element carries the wall-clock deadline and the total; one interval updates
// them all. A frozen bar (the play clock held) stands still at the value the server sent.
import { formatClock } from "../../components/game-clock/web/countdown";
import { h } from "./ui";
import { L } from "./i18n";
import { play } from "./sound";

let armed = false;
let warnedTurn = false;

// Your own clock sounds a double beep once, six seconds before it ends.
export const resetTurnWarning = () => { warnedTurn = false; };

export function armTimers() {
  if (armed) return;
  armed = true;
  setInterval(() => {
    const now = Date.now();
    document.querySelectorAll<HTMLElement>("[data-deadline]").forEach((el) => {
      const left = Math.max(0, Number(el.dataset.deadline) - now);
      const total = Number(el.dataset.total) || 1;
      if (el.classList.contains("myclock") && left > 0 && left <= 6000 && !warnedTurn) {
        warnedTurn = true;
        play("turn");
        setTimeout(() => play("turn"), 220);
      }
      // Before the countdown starts (the settle) the bar stays out of sight.
      el.style.visibility = left > total ? "hidden" : "";
      const used = Math.max(0, Math.min(1, 1 - left / total));
      const bar = el.querySelector<HTMLElement>(".fill");
      if (bar) bar.style.width = `${(el.classList.contains("fills") ? used : 1 - used) * 100}%`;
      const text = el.querySelector<HTMLElement>(".secs");
      if (text) text.textContent = String(Math.ceil(Math.min(left, total) / 1000));
      el.classList.toggle("urgent", left < 8000);
      el.classList.toggle("warn", used >= 0.5 && used < 0.8);
      el.classList.toggle("late", used >= 0.8);
      el.classList.toggle("flash", used >= 0.8 && Math.floor(now / 300) % 2 === 0);
    });
    document.querySelectorAll<HTMLElement>("[data-level-deadline]").forEach((el) => {
      el.textContent = formatClock(Math.max(0, Number(el.dataset.levelDeadline) - now));
    });
  }, 250);
}

// A countdown bar with the seconds left. "fills" grows green, orange, then flashing red; the others shrink.
export function timer(remainingMs: number, totalMs: number, cls = "", frozen = false): HTMLElement {
  armTimers();
  const deadline = Date.now() + remainingMs;
  const left = Math.min(1, Math.max(0, remainingMs / totalMs));
  const fills = cls.split(" ").includes("fills");
  const colour = !frozen ? "" : fills ? (1 - left >= 0.8 ? " late" : 1 - left >= 0.5 ? " warn" : "") : remainingMs < 8000 ? " urgent" : "";
  return h("div", { class: `timer ${cls}${colour}`, "data-deadline": frozen ? null : String(deadline), "data-total": String(totalMs), style: remainingMs > totalMs ? { visibility: "hidden" } : {} },
    h("div", { class: "fill", style: { width: `${(fills ? 1 - left : left) * 100}%` } }),
    h("span", { class: "secs" }, String(Math.ceil(Math.min(remainingMs, totalMs) / 1000))),
  );
}

// A translated string with some of its arguments in bold.
export function rich(key: string, ...args: { text: string; bold?: boolean; attrs?: Record<string, string> }[]): Node[] {
  const out: Node[] = [];
  L(key, ...args.map((_, i) => `\u0001${i}\u0002`)).split(/(\u0001\d+\u0002)/).forEach((part) => {
    const m = part.match(/^\u0001(\d+)\u0002$/);
    if (m) {
      const a = args[Number(m[1])];
      out.push(a.bold ? h("b", a.attrs ?? {}, a.text) : document.createTextNode(a.text));
    } else if (part) out.push(document.createTextNode(part));
  });
  return out;
}
