// The two permanent rooms and how each looks: a theme from the theme component. The recipe ships no scene pictures; a picture
// added as web/public/art/scene-<room>-back.jpg or -front.png and named in a room's scene here is drawn behind or in front.
import themes from "../../components/theme/web/themes.json";
import { Background, type Scene } from "../../components/theme/web/background";
import { applyTheme, resolveTheme, type ThemeFile, type Tokens } from "../../components/theme/web/tokens";

type Look = { theme: string; scene: Scene };

export const LOOKS: Record<string, Look> = {
  casino: { theme: "night", scene: { anchor: 0.5, fronts: [] } },
  home: { theme: "lounge", scene: { anchor: 1, fronts: [] } },
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
