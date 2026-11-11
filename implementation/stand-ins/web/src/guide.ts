// Installed in place of the guides when the design leaves out guided-tour (no lessons): nothing is ever shown or held.
import { h } from "../../components/controls/web/dom";
import { L } from "./i18n";

export type GuideId = "home" | "lobby" | "bots" | "table" | "blinds" | "call" | "bet" | "pot" | "flop" | "turn" | "river";

const dots = () => h("span", { class: "gdots" }, h("i"), h("i"));

export const seen = (_id: GuideId): boolean => true;
export function resetGuides() {}
export function want(_id: GuideId) {}
export const guideOpen = (): boolean => false;
export function onGuideChange(_fn: () => void) {}
export function onScreen(_screen: "home" | "lobby" | "table" | "other") {}
export const guidance = (): boolean | null => false;
export const setGuidance = (_on: boolean) => {};

export { dots as doubleTapDots, L };
