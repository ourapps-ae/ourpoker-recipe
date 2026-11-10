#!/usr/bin/env python3.12
"""Write SOURCE.md: each implementation file, where it came from in OurPoker/recipe, what moved, what stayed behind."""
import sys
from pathlib import Path

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parent.parent


def lines(path):
    return len((ROOT / path).read_text(encoding="utf-8", errors="ignore").splitlines())


S = "server/src/"
W = "web/src/"
A = "ios/OurPoker/Sources/"
K = "android/app/src/main/java/app/ourapps/ourpoker/"

server = {
    "adapter.ts": (S + "adapter.ts 1-109", "The room's lobby, join, apply, advance and view moved to turn-engine; the rest wraps its view in the poker wire view and gives it the hand text and odds."),
    "contract.ts": (S + "contract.ts 1-257", "Wire types the four clients decode."),
    "directory.ts": (S + "directory.ts 1-3", "The room list class, over room-directory's createDirectoryClass."),
    "host-settings": ("not present", "Not in this package: aepm renders components/server-host/server/host-settings.ts from server-host's settings, and index.ts imports it."),
    "index.ts": (S + "index.ts 1-28", "Worker entry over server-host and realtime-rooms; with the update and video routes."),
    "parts.ts": (S + "engine.ts 9-38, 209-250, 980-1005; bot.ts 1-60", "Selects the component for each turn-engine part through its own interface (game-clock, private-views, presence, round-history, chip-ledger, level-schedule, holdem-rules, tournament, computer-players, poker-strategy) and builds each from the house rules."),
    "room.ts": (S + "room.ts 1-20", "The room class with the invitation links added to its view; it takes guest-identity's identity as `services.identity`."),
    "rules.ts": (S + "rules.ts 1-29", "Loads the house rules file, writes the design's answers over six of its values, checks it with the rules-settings checker and gives rules-settings' reader."),
    "update-links.ts": (S + "services.ts 1-8, index.ts 12-19", "Store invitation and update links, and the `/update` route; the only server module that imports store-update."),
    "settings.ts": (S + "settings.ts 1-6", "Template: the design's answers, including the six that change the house rules (the computer players answer is the component's `mode`)."),
    "video.ts": (S + "video.ts 1-6, services.ts 9-16, index.ts 20", "Video grant, the room's `videoGrant` service and the `/video-rooms` route over video-calls; the only server module that imports it."),
    "computers.ts": (S + "engine.ts 980-1005; bot.ts 1-60", "Computer players over poker-strategy; the only server module that imports computer-players and poker-strategy."),
    "wire.ts": (S + "view.ts 10-55, 143-222", "Maps the engine's generic view to the poker wire view: players, best hands, odds, clock, the winner prompts."),
}

web = {
    "api.ts": (W + "api.ts 1-75", "Server address templated."),
    "betting.ts": (W + "table.ts 891-1012", "Gestures, hints and the move buttons; amounts from holdem-rules."),
    "board.ts": (W + "board.ts 1-67", "The table viewer's screen."),
    "configuration.ts": ("new", "The display-mode and video-calls configuration documents, passed in code."),
    "geometry.ts": (W + "table.ts 133-212", "Seat, bet and card spots over table-layout."),
    "guide-style.ts": ("new", "Imports the guided tour's styles; the only web module besides guide.ts that imports guided-tour."),
    "guide.ts": (W + "guide.ts 1-159", "Which lesson each moment asks for; the lessons are data in locales/lessons.json."),
    "i18n.ts": (W + "i18n.ts 1-69", "Typed accessors over translations."),
    "main.ts": (W + "main.ts 1-121", "Entry; shell and styles from the components."),
    "mode.ts": (W + "mode.ts 1-9", "Over display-mode."),
    "odds-panel.ts": (W + "table.ts 1023-1081", "The possible-hands panel."),
    "poker.css": ("web/src/style.css 1-359", "Rules only poker needs; the rest moved to theme, controls, card-graphics, chip-graphics, table-layout and guided-tour."),
    "rooms.ts": (W + "background.ts 1-181", "The two room looks; the drawing moved to theme."),
    "screens.ts": (W + "screens.ts 1-230", "Home, name, lobby, end and help screens."),
    "shell.ts": (W + "main.ts 118-121", "Starts the installable shell; the only web module that imports web-host."),
    "showdown.ts": (W + "table.ts 327-523", "Showdown display and where shown hands go."),
    "sound.ts": (W + "sound.ts 1-62", "Names the game's sounds over sound-cues."),
    "store-response.ts": (W + "store-response.ts 1-73", "Update response normalising."),
    "store.ts": (W + "store.ts 1-308", "Client state: join, act, live connection, rooms."),
    "table.ts": (W + "table.ts 1-1116", "The poker table screen; seats, cards and chips come from table-layout, card-graphics and chip-graphics."),
    "timers.ts": (W + "table.ts 23-88", "Countdown helpers."),
    "ui.ts": (W + "dom.ts 1-95, icons.ts 1-50, chips.ts 1-54, layout.ts 1-11", "Thin names over controls, card-graphics and chip-graphics."),
    "update.ts": (W + "update.ts 1-18", "Update check over store-update."),
    "video.ts": ("new", "Re-exports the video session; the only web module that imports video-calls."),
}

apple = {
    "Bridge.swift": ("ios/OurPoker/Sources/Sound.swift 1-75, Layout.swift 1-35, Platform.swift 1-41", "Names over the sound-cues player, preferences, apple-host platform rules and table-layout spots."),
    "DisplayScreen.swift": ("DisplayScreen.swift 1-628", "The table viewer for a television or shared screen."),
    "EndScreen.swift": ("EndScreen.swift 1-57", ""),
    "Guides.swift": ("Guide.swift 1-189", "Which lesson each moment asks for; the overlay moved to guided-tour."),
    "HelpScreen.swift": ("HelpScreen.swift 1-29", ""),
    "HomeScreen.swift": ("HomeScreen.swift 1-174", ""),
    "LiveMessage.swift": ("LiveMessage.swift 1-8", ""),
    "LobbyScreen.swift": ("LobbyScreen.swift 1-84", ""),
    "Marks.swift": ("Cards.swift 160-191, IconButtons.swift 90-115", "Legend line, application mark, lobby badge."),
    "MediaToggles.swift": ("MediaToggles.swift 1-72", "GAP: G9.4 video-calls has the session, not the toggle strip."),
    "Model.swift": ("Model.swift 1-300", "Wire model."),
    "NameScreen.swift": ("NameScreen.swift 1-36", ""),
    "OurPokerApp.swift": ("OurPokerApp.swift 1-135", "Entry inside the apple-host's window."),
    "Palette.swift": ("Cards.swift 40-52", "Night tokens."),
    "RoomLook.swift": ("PokerBackground.swift 1-217", "Two room looks over theme; the drawing moved to theme."),
    "RootView.swift": ("OurPokerApp.swift 1-135", "The screen flow."),
    "SeatScreen.swift": ("SeatScreen.swift 1-54", ""),
    "Strings.swift": ("Strings.swift 1-101", "Over translations."),
    "TableClient.swift": ("TableClient.swift 1-86", ""),
    "TableEffects.swift": ("Chips.swift 109-455", "Spots, flights, showdown layout."),
    "TableModel.swift": ("TableModel.swift 1-535", "Server address from the apple-host's settings."),
    "TableScreen.swift": ("TableScreen.swift 1-1289", "Poker table screen."),
}

android = {
    "AppLanguage.kt": ("AppLanguage.kt 1-31", "Over the android-host's ShellLanguage."),
    "AppSettings.kt": ("app/build.gradle.kts buildConfigField SERVER_URL, UPDATES_ENABLED", "Template."),
    "MainActivity.kt": ("MainActivity.kt 1-137", "Subclass of the android-host's ShellActivity; screen flow."),
    "Sound.kt": ("Sound.kt 1-53", "Over the sound-cues player and preferences."),
    "TableViewModel.kt": ("TableViewModel.kt 1-493", "Lessons through the guided-tour component."),
    "net/Model.kt": ("net/Model.kt 1-212", "Wire model."),
    "net/TableClient.kt": ("net/TableClient.kt 1-87", "REST client; the live connection is realtime-rooms'."),
    "ui/EndScreen.kt": ("ui/EndScreen.kt 1-72", "Rows from tournament."),
    "ui/Guides.kt": ("ui/Guide.kt 1-184", "Which lesson each moment asks for; overlay moved to guided-tour."),
    "ui/HelpScreen.kt": ("ui/HelpScreen.kt 1-53", "Over controls' HelpPage."),
    "ui/HomeScreen.kt": ("ui/HomeScreen.kt 1-226", ""),
    "ui/LobbyScreen.kt": ("ui/LobbyScreen.kt 1-97", "Rows from seating."),
    "ui/Marks.kt": ("ui/Cards.kt 160-191, ui/IconButtons.kt 79-89", "Legend line, mark, add-computer icon."),
    "ui/MediaToggles.kt": ("ui/MediaToggles.kt 1-85", ""),
    "ui/NameScreen.kt": ("ui/NameScreen.kt 1-62", ""),
    "ui/Palette.kt": ("ui/Cards.kt 48-51, ui/Panels.kt 18", "Night tokens."),
    "ui/RoomLook.kt": ("ui/PokerBackground.kt 1-165, ui/Cards.kt 90-102", "Two room looks over theme and card-graphics."),
    "ui/SeatScreen.kt": ("ui/SeatScreen.kt 1-85", "Video tile of a seat."),
    "ui/Strings.kt": ("ui/Strings.kt 1-68", "Text by name; strings.xml is generated from locales/strings.json."),
    "ui/TableEffects.kt": ("ui/Chips.kt 105-514", "Spots over table-layout; flights, showdown layout."),
    "ui/TableScreen.kt": ("ui/TableScreen.kt 1-891", "Betting amounts from holdem-rules, countdown from game-clock."),
    "ui/VideoPanel.kt": ("ui/VideoPanel.kt 1-39", ""),
}

desktop = {
    "package.json": ("desktop/package.json 1-21", "Name templated."),
    "scripts/build.cjs": ("desktop/scripts/build.cjs 1-4", ""),
    "scripts/package.cjs": ("desktop/scripts/package.cjs 1-93", "Unsigned Windows installer settings."),
    "src/configuration.cjs": ("desktop/src/main.cjs 1-12, verify.cjs", "The windows-desktop configuration document, shared by main and verify."),
    "src/main.cjs": ("desktop/src/main.cjs 1-12", ""),
    "src/verify.cjs": ("desktop/src/verify.cjs 1-135", ""),
    "test/integration.test.cjs": ("desktop/test/integration.test.cjs 1-20", ""),
}


def table(title, folder, mapping, base_dir):
    out = [f"### {title}", "", "| File | Lines | Origin (OurPoker/recipe) | Notes |", "|---|---|---|---|"]
    for name, (origin, note) in mapping.items():
        path = f"{base_dir}/{name}"
        count = lines(path) if (ROOT / path).exists() else "-"
        out.append(f"| `{folder}{name}` | {count} | {origin} | {note} |")
    return "\n".join(out) + "\n"


def count_dir(path, suffixes):
    return sum(lines(str(p.relative_to(ROOT))) for p in (ROOT / path).rglob("*") if p.is_file() and p.suffix in suffixes)


doc = f"""# Source record

Everything here was taken from `OurPoker/recipe/` (read-only) at McInPoker revision 19905b75dbea89fbfd424d67fe26c81aaed0e018. This component holds only what no general component provides. Line ranges are those of the source file named; many files were rewritten over components, so a range is the region the content came from, not a copy of it. `scripts/make_component.py` computes `component.json`; `scripts/make_source.py` writes this file.

## Implementation: server (`implementation/server/src/`, destination `server/src/`)

{table("Server", "implementation/server/src/", server, "implementation/server/src")}
## Implementation: web (`implementation/web/`, destination `web/`)

{table("Web", "implementation/web/src/", web, "implementation/web/src")}
`implementation/web/page-body.html` ({lines("implementation/web/page-body.html")} lines) came from `web/index.html` 1-21 (the body only); the rest of the page is web-host's.

## Implementation: Apple (`implementation/apple/Sources/`, destination `ios/OurPoker/Sources/`)

{table("Apple", "implementation/apple/Sources/", apple, "implementation/apple/Sources")}
## Implementation: Android (`implementation/android/app/src/main/java/app/ourapps/ourpoker/`, same destination)

{table("Android", "", android, "implementation/android/app/src/main/java/app/ourapps/ourpoker")}
## Implementation: desktop (`implementation/desktop/`, destination `desktop/`)

{table("Desktop", "implementation/desktop/", desktop, "implementation/desktop")}
## Rules, text, assets

| File | Lines | Origin | Notes |
|---|---|---|---|
| `rules/texas-holdem-house-rules.json` | {lines("rules/texas-holdem-house-rules.json")} | rules/texas-holdem-house-rules.json 1-226 | The house rules file. |
| `rules/texas-holdem-house-rules.md` | {lines("rules/texas-holdem-house-rules.md")} | rules/texas-holdem-house-rules.md 1-161 | The house rules in prose. |
| `rules/texas-holdem-house-rules.schema.json` | {lines("rules/texas-holdem-house-rules.schema.json")} | new | The schema rules-settings checks the file with. |
| `locales/strings.json` | {lines("locales/strings.json")} | i18n/strings.json 1-1472 | Key to en, fr, de, es; the translations generator makes each platform's resources from it. |
| `locales/lessons.json` | {lines("locales/lessons.json")} | web/src/guide.ts 1-159, android ui/Guide.kt 90-105, ios Guide.swift | Lessons as data for guided-tour: ids, screens, steps naming string keys and anchors. |
| `assets/ASSETS.json` | {lines("assets/ASSETS.json")} | new | The asset list; `tests/portable.test.ts` checks it against the files. |
| `assets/art/`, `assets/web/art/` | 13 + 12 files | art/, web/public/art/ | Placeholder pictures (64 px squares) and the 1024 px icon; the source repository ships no other artwork. |
| `assets/sounds/` | 16 files | web/public/sounds/ | The game's 16 short sounds; `assets/web/sounds-manifest.json` is the sound-cues manifest (cues and the street, winner, myTurn and lowTime events). |
| `assets/apple/`, `assets/android/` | icon catalogues, launcher drawables | ios/OurPoker/Resources/Assets.xcassets, ios/OurPokerTV/Assets.xcassets, android res/drawable | Apple TV catalogue Contents.json files belong to apple-host (it writes them); only the TV images are mapped. |

## Tests (end-to-end specs)

Copied from the source and mapped back to the application layout by the artefact list (`server/test/`, `web/test/`, `verification/`, `ios/OurPokerTests/`, `android/app/src/test/`, `server/fixtures/`). None of them is run by this package; `tests/portable.test.ts` is the package-root suite.

| Files | Lines | Origin |
|---|---|---|
| `tests/e2e/server/*.test.ts` (6) | {count_dir("tests/e2e/server", {".ts"})} | server/test/room.test.ts, adapter.test.ts, video.test.ts and services.test.ts (split into update-links.test.ts and video-services.test.ts, one optional component each); hand.test.ts is new (a server hand without a network) |
| `tests/e2e/web/*` (10) | {count_dir("tests/e2e/web", {".mjs", ".json"})} | web/test/* (browser.mjs is the two-player hand with a display; session.test.mjs the reconnect) |
| `tests/e2e/verification/*` (15) | {count_dir("tests/e2e/verification", {".mjs", ".py"})} | verification/* |
| `tests/e2e/apple/*` (6) | {count_dir("tests/e2e/apple", {".swift"})} | ios/OurPokerTests/{{Contract,Session,Guide,ChallengeLayout}}Tests.swift, OurPokerUITests/HomeButtonsUITests.swift, VerificationSupport/ServerAddress.swift |
| `tests/e2e/android/*` (3) | {count_dir("tests/e2e/android", {".kt"})} | android app/src/test FixturesTest.kt, SoundSettingTest.kt; androidTest FixtureScreenTest.kt (strings looked up by name) |
| `tests/fixtures/*.json` (15) | {count_dir("tests/fixtures", {".json"})} | server/fixtures/* |
| `tests/portable.test.ts` | {lines("tests/portable.test.ts")} | new |
| `examples/configuration.ts` | {lines("examples/configuration.ts")} | new |

## Moved to components

| Source | Destination component |
|---|---|
| server/src/engine.ts (lifecycle, joining, ticking, pauses, bots) | turn-engine, seating, game-clock, presence, tournament, computer-players |
| engine.ts hand logic, pots.ts | holdem-rules, chip-ledger, card-deck |
| bot.ts, evaluate.ts, odds.ts, cards.ts | poker-strategy, poker-hand-ranking, poker-odds, card-deck |
| view.ts | turn-engine (generic view) and `wire.ts` here |
| web background.ts, dom.ts, icons.ts, chips.ts, layout.ts, style.css (most) | theme, controls, chip-graphics, table-layout, card-graphics, guided-tour |
| ios Cards, Chips, Guide, IconButtons, Panels, PulseHalo, Layout, Platform, Sound, PokerBackground | card-graphics, chip-graphics, guided-tour, controls, table-layout, apple-host, sound-cues, theme |
| android ui Cards, Chips, Panels, IconButtons, Layout, PokerBackground, Guide overlay, Sound player, AppLanguage | the same components' Kotlin |

## Left behind (not ported)

- Build and project files, rendered by the host components: web index.html, vite.config.ts, manifest, sw.js, _headers, package.json, package-lock.json, tsconfig.json, sync-art.py (web-host); server package.json, package-lock.json, tsconfig.json, vitest.config.ts, wrangler.jsonc (server-host, realtime-rooms); ios project.yml, Info.plist files, ExportOptions, MacCatalyst.entitlements, Package.resolved, prepare-project.py, sync-art.sh (apple-host); android build.gradle.kts files, gradle wrapper, gradle.lockfile, verification-metadata.xml, AndroidManifest.xml (android-host).
- Generated files: web strings.json, ios Localizable.xcstrings, android values*/strings.xml, i18n/keys.txt, scripts/generate-resources.py (the translations generator makes them from locales/strings.json).
- Server tests of moved logic: engine.test.ts, bot.test.ts, cards.test.ts, evaluate.test.ts, odds.test.ts, pots.test.ts, view.test.ts, fixtures.test.ts, helpers.ts, sim.ts, fixture-data.ts travel in the components that now own the logic. Server scripts fixtures.ts, showdown-views.ts, prepare-proof.py and INTEGRATION.md.
- Native tests of moved logic: ios CameraTests, LanguageTests, PlatformTests, RingTests, SoundTests and android tests of those parts belong to video-calls, translations, apple-host, table-layout and sound-cues.
- Desktop: scripts/runtime-smoke.cjs and installed-smoke.cjs (they require `../src/policy.cjs`, which the source tree does not have; windows-desktop's own platform checks cover them), native-verify.ps1, icon.py, package-lock.json.
- rules/texas-holdem-coding-handoff.md (110 lines): a build note for the hand-built game, replaced by holdem-rules' CONTRACT.md.
- Android INSTRUMENTATION.md.
- Artwork: the source tree holds only placeholder pictures; nothing personal existed to leave out.
"""
(ROOT / "SOURCE.md").write_text(doc, encoding="utf-8")
print("SOURCE.md", len(doc.splitlines()), "lines")
