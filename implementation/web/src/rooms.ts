// The two permanent rooms and how each looks: a theme from the theme component and a picture behind.
import themes from "../../components/theme/web/themes.json";
import { Background, type Scene } from "../../components/theme/web/background";
import { applyTheme, resolveTheme, type ThemeFile, type Tokens } from "../../components/theme/web/tokens";

type Look = { theme: string; scene: Scene };

export const LOOKS: Record<string, Look> = {
  casino: { theme: "night", scene: { back: "./art/scene-casino-back.jpg", front: "./art/scene-casino-front.png", anchor: 0.5, fronts: [{ at: "br", h: 0.68, maxW: 1 }] } },
  home: { theme: "lounge", scene: { back: "./art/scene-home-back.jpg", front: "./art/scene-home-front.png", anchor: 1, fronts: [{ at: "br", h: 0.6, maxW: 1 }] } },
};

export const tokensFor = (room: string): Tokens => resolveTheme(themes as ThemeFile, { themeName: (LOOKS[room] ?? LOOKS.casino).theme });

let shown = "";
export function showRoom(bg: Background, room: string) {
  const id = LOOKS[room] ? room : "casino";
  if (id === shown) return;
  shown = id;
  const tokens = tokensFor(id);
  bg.setTheme(tokens);
  bg.setScene(LOOKS[id].scene);
  applyTheme(tokens, document.documentElement);
}
