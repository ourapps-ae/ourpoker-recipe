// Guides: shown the first time something comes up, one part at a time, each part ringing the thing it
// is about. The guided-tour component runs them; this holds the game's lessons (locales/lessons.json),
// the choice to be guided (asked once) and what each moment of the game asks for. While one shows at
// the table the play clock is held for everyone.
import { createTour, parseLessons } from "../../components/guided-tour/web/tour-model";
import { mountTour } from "../../components/guided-tour/web/tour-view";
import * as controls from "../../components/controls/web/controls";
import { h } from "../../components/controls/web/dom";
import { L, lookupText } from "./i18n";
import lessons from "./lessons.json";
import { play } from "./sound";
import { sessionMode } from "./mode";

export type GuideId = "home" | "lobby" | "bots" | "table" | "blinds" | "call" | "bet" | "pot" | "flop" | "turn" | "river";

const dots = () => h("span", { class: "gdots" }, h("i"), h("i"));

const tour = createTour({
  lessons: parseLessons(JSON.stringify(lessons)),
  storage: localStorage,
  translate: lookupText,
  allowed: () => sessionMode() !== "board",
});
mountTour({
  tour,
  ui: controls,
  translate: lookupText,
  strings: { next: "guide_next", skip: "guide_skip", done: "got_it" },
  onAction: () => play("click"),
});

export function seen(id: GuideId): boolean {
  return !!localStorage.getItem(`tut.${id}`);
}

// Every guide shows again, each the next time its screen asks for it.
export function resetGuides() {
  tour.reset();
}

// Ask for a guide; shown once ever, after any already waiting. Nothing shows until the person has said they want guidance.
export function want(id: GuideId) {
  tour.want(id);
}

export const guideOpen = (): boolean => tour.holding();

// Told whenever a guide opens or the last one closes, for the hold.
export function onGuideChange(fn: () => void) {
  tour.onChange(() => fn());
}

// Moving to another screen drops guides for the screen left behind, even the one showing.
export function onScreen(screen: "home" | "lobby" | "table" | "other") {
  tour.screenChanged(screen);
}

// The person's answer to "are you a beginner?": null until asked.
export const guidance = (): boolean | null => tour.enabled();
export const setGuidance = (on: boolean) => tour.setEnabled(on);

export { dots as doubleTapDots, L };
