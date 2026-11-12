# Source record

Everything here was taken from the `recipe/` folder of the OurPoker source at McInPoker revision 19905b75dbea89fbfd424d67fe26c81aaed0e018. This component holds only what no general component provides. Line ranges are those of the source file named; many files were rewritten over components, so a range is the region the content came from, not a copy of it. `scripts/make_component.py` computes `component.json`; `scripts/make_source.py` writes this file.

## Implementation: server (`implementation/server/src/`, destination `server/src/`)

### Server

| File | Lines | Origin (the source's recipe/ folder) | Notes |
|---|---|---|---|
| `implementation/server/src/adapter.ts` | 18 | server/src/adapter.ts 1-109 | The room's lobby, join, apply, advance and view moved to turn-engine; the rest wraps its view in the poker wire view and gives it the hand text and odds. |
| `implementation/server/src/contract.ts` | 257 | server/src/contract.ts 1-257 | Wire types the four clients decode. |
| `implementation/server/src/directory.ts` | 6 | server/src/directory.ts 1-3 | The room list class, over room-directory's createDirectoryClass. |
| `implementation/server/src/env.d.ts` | 15 | new | The worker's bindings and variables; the source generated it with `wrangler types`. |
| `implementation/server/src/index.ts` | 28 | server/src/index.ts 1-28 | Worker entry over server-host and realtime-rooms; with the update and video routes. |
| `implementation/server/src/parts.ts` | 75 | server/src/engine.ts 9-38, 209-250, 980-1005; bot.ts 1-60 | Selects the component for each turn-engine part through its own interface (game-clock, private-views, presence, round-history, chip-ledger, level-schedule, holdem-rules, tournament, computer-players, poker-strategy) and builds each from the house rules. |
| `implementation/server/src/room.ts` | 21 | server/src/room.ts 1-20 | The room class with the invitation links added to its view; it takes guest-identity's identity as `services.identity`. |
| `implementation/server/src/rules.ts` | 28 | server/src/rules.ts 1-29 | Loads the house rules file, writes the design's answers over six of its values, checks it with the rules-settings checker and gives rules-settings' reader. |
| `implementation/server/src/update-links.ts` | 18 | server/src/services.ts 1-8, index.ts 12-19 | Store invitation and update links, and the `/update` route; the only server module that imports store-update. |
| `implementation/server/src/settings.ts` | 20 | server/src/settings.ts 1-6 | Template: the design's answers, including the six that change the house rules (the computer players answer is the component's `mode`). |
| `implementation/server/src/video.ts` | 21 | server/src/video.ts 1-6, services.ts 9-16, index.ts 20 | Video grant, the room's `videoGrant` service and the `/video-rooms` route over video-calls; the only server module that imports it. |
| `implementation/server/src/computers.ts` | 12 | server/src/engine.ts 980-1005; bot.ts 1-60 | Computer players over poker-strategy; the only server module that imports computer-players and poker-strategy. |
| `implementation/server/src/wire.ts` | 101 | server/src/view.ts 10-55, 143-222 | Maps the engine's generic view to the poker wire view: players, best hands, odds, clock, the winner prompts. |

## Implementation: web (`implementation/web/`, destination `web/`)

### Web

| File | Lines | Origin (the source's recipe/ folder) | Notes |
|---|---|---|---|
| `implementation/web/src/api.ts` | 82 | web/src/api.ts 1-75 | Server address templated. |
| `implementation/web/src/betting.ts` | 92 | web/src/table.ts 891-1012 | Gestures, hints and the move buttons; amounts from holdem-rules. |
| `implementation/web/src/board.ts` | 65 | web/src/board.ts 1-67 | The table viewer's screen. |
| `implementation/web/src/configuration.ts` | 8 | new | The display-mode and video-calls configuration documents, passed in code. |
| `implementation/web/src/geometry.ts` | 35 | web/src/table.ts 133-212 | Seat, bet and card spots over table-layout. |
| `implementation/web/src/guide-style.ts` | 2 | new | Imports the guided tour's styles; the only web module besides guide.ts that imports guided-tour. |
| `implementation/web/src/guide.ts` | 62 | web/src/guide.ts 1-159 | Which lesson each moment asks for; the lessons are data in locales/lessons.json. |
| `implementation/web/src/i18n.ts` | 80 | web/src/i18n.ts 1-69 | Typed accessors over translations. |
| `implementation/web/src/main.ts` | 129 | web/src/main.ts 1-121 | Entry; shell and styles from the components. |
| `implementation/web/src/mode.ts` | 10 | web/src/mode.ts 1-9 | Over display-mode. |
| `implementation/web/src/odds-panel.ts` | 67 | web/src/table.ts 1023-1081 | The possible-hands panel. |
| `implementation/web/src/poker.css` | 273 | web/src/style.css 1-359 | Rules only poker needs; the rest moved to theme, controls, card-graphics, chip-graphics, table-layout and guided-tour. |
| `implementation/web/src/rooms.ts` | 26 | web/src/background.ts 1-181 | The two room looks; the drawing moved to theme. |
| `implementation/web/src/screens.ts` | 232 | web/src/screens.ts 1-230 | Home, name, lobby, end and help screens. |
| `implementation/web/src/shell.ts` | 7 | web/src/main.ts 118-121 | Starts the installable shell; the only web module that imports web-host. |
| `implementation/web/src/showdown.ts` | 216 | web/src/table.ts 327-523 | Showdown display and where shown hands go. |
| `implementation/web/src/sound.ts` | 28 | web/src/sound.ts 1-62 | Names the game's sounds over sound-cues. |
| `implementation/web/src/store-response.ts` | 73 | web/src/store-response.ts 1-73 | Update response normalising. |
| `implementation/web/src/store.ts` | 314 | web/src/store.ts 1-308 | Client state: join, act, live connection, rooms. |
| `implementation/web/src/table.ts` | 639 | web/src/table.ts 1-1116 | The poker table screen; seats, cards and chips come from table-layout, card-graphics and chip-graphics. |
| `implementation/web/src/timers.ts` | 69 | web/src/table.ts 23-88 | Countdown helpers. |
| `implementation/web/src/ui.ts` | 51 | web/src/dom.ts 1-95, icons.ts 1-50, chips.ts 1-54, layout.ts 1-11 | Thin names over controls, card-graphics and chip-graphics. |
| `implementation/web/src/update.ts` | 18 | web/src/update.ts 1-18 | Update check over store-update. |
| `implementation/web/src/video.ts` | 2 | new | Re-exports the video session; the only web module that imports video-calls. |

## Build files

| File | Lines | Origin | Notes |
|---|---|---|---|
| `implementation/server/package.json`, `package-lock.json` | 26, 2853 | server/package.json 1-23, server/package-lock.json | Exact versions of the source lock; tsx and the simulation and fixture scripts left behind; scripts run server-host's `start.ts` and `wrangler.jsonc`. |
| `implementation/server/tsconfig.json` | 25 | server/tsconfig.json 1-15 | Checks `src` and `test` with the Node, Workers and Workers test types. |
| `implementation/server/vitest.config.ts` | 16 | server/vitest.config.ts 1-19 | The room tests use server-host's `wrangler.jsonc`. |
| `implementation/web/package.json`, `package-lock.json` | 23, 1075 | web/package.json 1-20, web/package-lock.json | Exact versions; with `livekit-client` (installed with video-calls). |
| `implementation/web/index.html` | 10 | web/index.html 1-21 | The body and the entry; web-host's Vite configuration writes the head. |
| `implementation/web/vite.config.ts` | 20 | web/vite.config.ts 1-28 | Returns web-host's `webHostConfig` with the theme's colours. |
| `implementation/web/tsconfig.json` | 17 | web/tsconfig.json 1-16 | |
| `implementation/apple/generate-project.ts` | 30 | ios/project.yml 1-150, prepare-project.py | Runs apple-host's renderer with the installed components' Swift folders. |
| `implementation/android/generate-project.ts` | 47 | android/settings.gradle.kts, build.gradle.kts, app/build.gradle.kts 1-150, AndroidManifest.xml | Runs android-host's renderer with the installed components' Android folders and the source's dependencies. |
| `locales/generated/` | 6 files | i18n generator output | Written by `scripts/make_component.py` with translations' generator from `locales/strings.json`. |

## Stand-ins (`implementation/stand-ins/`, installed when the design leaves the component out)

| File | Lines | Stands in for |
|---|---|---|
| `server/src/computers.ts`, `update-links.ts`, `video.ts` | 20 | computer-players, store-update, video-calls (new) |
| `web/src/guide.ts`, `guide-style.ts`, `shell.ts`, `update.ts`, `video.ts` | 53 | guided-tour, web-host, store-update, video-calls (new) |
| `web/package.json`, `package-lock.json` | 20, 938 | video-calls: the web package without `livekit-client` |
| `apple/Sources/Video.swift`, `SeatScreen.swift`, `Lessons.swift`, `Updates.swift` | 104 | video-calls, guided-tour, store-update (new) |
| `android/.../Video.kt`, `ui/SeatScreen.kt`, `ui/Lessons.kt`, `Updates.kt` | 89 | video-calls, guided-tour, store-update (new) |

## Implementation: Apple (`implementation/apple/Sources/`, destination `ios/OurPoker/Sources/`)

### Apple

| File | Lines | Origin (the source's recipe/ folder) | Notes |
|---|---|---|---|
| `implementation/apple/Sources/ApplicationSettings.swift` | 8 | ApplicationSettings.swift 1-3 | Template: whether updates are offered. |
| `implementation/apple/Sources/Lessons.swift` | 37 | TableModel.swift 43-48, Guide.swift 160-175 | The lessons over guided-tour; the only application file that names it. |
| `implementation/apple/Sources/Updates.swift` | 6 | new | The update check's version comparison over store-update; the only application file that names it. |
| `implementation/apple/Sources/Video.swift` | 3 | new | The video session under the application's name (video-calls' `VideoSession`). |
| `implementation/apple/Sources/Bridge.swift` | 110 | ios/OurPoker/Sources/Sound.swift 1-75, Layout.swift 1-35, Platform.swift 1-41, Cards.swift 137-149 | Names over the sound-cues player, preferences, apple-host platform rules and table-layout spots; `tapIf`. |
| `implementation/apple/Sources/DisplayScreen.swift` | 569 | DisplayScreen.swift 1-628 | The table viewer for a television or shared screen. |
| `implementation/apple/Sources/EndScreen.swift` | 57 | EndScreen.swift 1-57 |  |
| `implementation/apple/Sources/Guides.swift` | 42 | Guide.swift 1-189 | Which lesson each moment asks for; the overlay moved to guided-tour. |
| `implementation/apple/Sources/HelpScreen.swift` | 29 | HelpScreen.swift 1-29 |  |
| `implementation/apple/Sources/HomeScreen.swift` | 180 | HomeScreen.swift 1-174 |  |
| `implementation/apple/Sources/LiveMessage.swift` | 8 | LiveMessage.swift 1-8 |  |
| `implementation/apple/Sources/LobbyScreen.swift` | 84 | LobbyScreen.swift 1-84 |  |
| `implementation/apple/Sources/Marks.swift` | 44 | Cards.swift 160-191, IconButtons.swift 90-115 | Legend line, application mark, lobby badge. |
| `implementation/apple/Sources/MediaToggles.swift` | 57 | MediaToggles.swift 1-72 | GAP: G9.4 video-calls has the session, not the toggle strip. |
| `implementation/apple/Sources/Model.swift` | 278 | Model.swift 1-300 | Wire model. |
| `implementation/apple/Sources/NameScreen.swift` | 36 | NameScreen.swift 1-36 |  |
| `implementation/apple/Sources/OurPokerApp.swift` | 18 | OurPokerApp.swift 1-135 | Entry inside the apple-host's window. |
| `implementation/apple/Sources/Palette.swift` | 15 | Cards.swift 40-52 | Night tokens. |
| `implementation/apple/Sources/RoomLook.swift` | 85 | PokerBackground.swift 1-217 | Two room looks over theme; the drawing moved to theme. |
| `implementation/apple/Sources/RootView.swift` | 106 | OurPokerApp.swift 1-135 | The screen flow. |
| `implementation/apple/Sources/SeatScreen.swift` | 54 | SeatScreen.swift 1-54 |  |
| `implementation/apple/Sources/Strings.swift` | 92 | Strings.swift 1-101 | Over translations. |
| `implementation/apple/Sources/TableClient.swift` | 88 | TableClient.swift 1-86 |  |
| `implementation/apple/Sources/TableEffects.swift` | 360 | Chips.swift 109-455 | Spots, flights, showdown layout. |
| `implementation/apple/Sources/TableModel.swift` | 522 | TableModel.swift 1-535 | Server address from the apple-host's settings. |
| `implementation/apple/Sources/TableScreen.swift` | 1282 | TableScreen.swift 1-1289 | Poker table screen. |

## Implementation: Android (`implementation/android/app/src/main/java/app/ourapps/ourpoker/`, same destination)

### Android

| File | Lines | Origin (the source's recipe/ folder) | Notes |
|---|---|---|---|
| `AppLanguage.kt` | 15 | AppLanguage.kt 1-31 | Over the android-host's ShellLanguage. |
| `Updates.kt` | 4 | new | The update check's version comparison over store-update. |
| `Video.kt` | 6 | new | The video session and room under the application's names (video-calls' `VideoSession`, LiveKit's `Room`). |
| `ui/Lessons.kt` | 40 | TableViewModel.kt 87-92, ui/Guide.kt 170-184 | The lessons over guided-tour; the only application file that names it. |
| `AppSettings.kt` | 14 | app/build.gradle.kts buildConfigField SERVER_URL, UPDATES_ENABLED | Template. |
| `MainActivity.kt` | 107 | MainActivity.kt 1-137 | Subclass of the android-host's ShellActivity; screen flow. |
| `Sound.kt` | 57 | Sound.kt 1-53 | Over the sound-cues player and preferences. |
| `TableViewModel.kt` | 482 | TableViewModel.kt 1-493 | Lessons through the guided-tour component. |
| `net/Model.kt` | 212 | net/Model.kt 1-212 | Wire model. |
| `net/TableClient.kt` | 90 | net/TableClient.kt 1-87 | REST client; the live connection is realtime-rooms'. |
| `ui/EndScreen.kt` | 80 | ui/EndScreen.kt 1-72 | Rows from tournament. |
| `ui/Guides.kt` | 48 | ui/Guide.kt 1-184 | Which lesson each moment asks for; overlay moved to guided-tour. |
| `ui/HelpScreen.kt` | 20 | ui/HelpScreen.kt 1-53 | Over controls' HelpPage. |
| `ui/HomeScreen.kt` | 230 | ui/HomeScreen.kt 1-226 |  |
| `ui/LobbyScreen.kt` | 103 | ui/LobbyScreen.kt 1-97 | Rows from seating. |
| `ui/Marks.kt` | 40 | ui/Cards.kt 160-191, ui/IconButtons.kt 79-89 | Legend line, mark, add-computer icon. |
| `ui/MediaToggles.kt` | 85 | ui/MediaToggles.kt 1-85 |  |
| `ui/NameScreen.kt` | 62 | ui/NameScreen.kt 1-62 |  |
| `ui/Palette.kt` | 12 | ui/Cards.kt 48-51, ui/Panels.kt 18 | Night tokens. |
| `ui/RoomLook.kt` | 67 | ui/PokerBackground.kt 1-165, ui/Cards.kt 90-102 | Two room looks over theme and card-graphics. |
| `ui/SeatScreen.kt` | 87 | ui/SeatScreen.kt 1-85 | Video tile of a seat. |
| `ui/Strings.kt` | 73 | ui/Strings.kt 1-68 | Text by name; strings.xml is generated from locales/strings.json. |
| `ui/TableEffects.kt` | 463 | ui/Chips.kt 105-514 | Spots over table-layout; flights, showdown layout. |
| `ui/TableScreen.kt` | 905 | ui/TableScreen.kt 1-891 | Betting amounts from holdem-rules, countdown from game-clock. |
| `ui/VideoPanel.kt` | 39 | ui/VideoPanel.kt 1-39 |  |

## Implementation: desktop (`implementation/desktop/`, destination `desktop/`)

### Desktop

| File | Lines | Origin (the source's recipe/ folder) | Notes |
|---|---|---|---|
| `implementation/desktop/package.json` | 22 | desktop/package.json 1-21 | Name templated. |
| `implementation/desktop/package-lock.json` | 3604 | desktop/package-lock.json | Exact versions of electron and electron-builder. |
| `implementation/desktop/scripts/build.cjs` | 4 | desktop/scripts/build.cjs 1-4 |  |
| `implementation/desktop/scripts/package.cjs` | 93 | desktop/scripts/package.cjs 1-93 | Unsigned Windows installer settings. |
| `implementation/desktop/src/configuration.cjs` | 13 | desktop/src/main.cjs 1-12, verify.cjs | The windows-desktop configuration document, shared by main and verify. |
| `implementation/desktop/src/main.cjs` | 8 | desktop/src/main.cjs 1-12 |  |
| `implementation/desktop/src/verify.cjs` | 134 | desktop/src/verify.cjs 1-135 |  |
| `implementation/desktop/test/integration.test.cjs` | 20 | desktop/test/integration.test.cjs 1-20 |  |

## Rules, text, assets

| File | Lines | Origin | Notes |
|---|---|---|---|
| `rules/texas-holdem-house-rules.json` | 226 | rules/texas-holdem-house-rules.json 1-226 | The house rules file. |
| `rules/texas-holdem-house-rules.md` | 161 | rules/texas-holdem-house-rules.md 1-161 | The house rules in prose. |
| `rules/texas-holdem-house-rules.schema.json` | 98 | new | The schema rules-settings checks the file with. |
| `locales/strings.json` | 1550 | i18n/strings.json 1-1472 | Key to en, fr, de, es; the translations generator makes each platform's resources from it. |
| `locales/lessons.json` | 248 | web/src/guide.ts 1-159, android ui/Guide.kt 90-105, ios Guide.swift | Lessons as data for guided-tour: ids, screens, steps naming string keys and anchors. |
| `assets/ASSETS.json` | 306 | new | The asset list; `tests/portable.test.ts` checks it against the files. |
| `assets/art/icon.png`, `assets/web/manifest.json` | 1 file, an empty list | art/, web/public/art/manifest.json | The 1024 px icon; the source's court-card, card-back and scene pictures were single-colour placeholders and are not shipped, so cards and rooms are drawn by card-graphics and theme. A developer adds pictures to `web/public/art/` and lists them in its `manifest.json`. |
| `assets/sounds/` | 16 files | web/public/sounds/ | The game's 16 short sounds; `assets/web/sounds-manifest.json` is the sound-cues manifest (cues and the street, winner, my_turn and low_time events). |
| `assets/apple/`, `assets/android/` | icon catalogues, launcher drawables | ios/OurPoker/Resources/Assets.xcassets, ios/OurPokerTV/Assets.xcassets, android res/drawable | Apple TV catalogue Contents.json files belong to apple-host (it writes them); only the TV images are mapped. |

## Tests (end-to-end specs)

Copied from the source and mapped back to the application layout by the artefact list (`server/test/`, `web/test/`, `verification/`, `ios/OurPokerTests/`, `android/app/src/test/`, `server/fixtures/`). None of them is run by this package; `tests/portable.test.ts` is the package-root suite.

| Files | Lines | Origin |
|---|---|---|
| `tests/e2e/server/*.test.ts` (6) | 678 | server/test/room.test.ts, adapter.test.ts, video.test.ts and services.test.ts (split into update-links.test.ts and video-services.test.ts, one optional component each); hand.test.ts is new (a server hand without a network) |
| `tests/e2e/web/*` (10) | 1056 | web/test/* (browser.mjs is the two-player hand with a display; session.test.mjs the reconnect) |
| `tests/e2e/verification/*` (15) | 691 | verification/* |
| `tests/e2e/apple/*` (6) | 339 | ios/OurPokerTests/{Contract,Session,Guide,ChallengeLayout}Tests.swift, OurPokerUITests/HomeButtonsUITests.swift, VerificationSupport/ServerAddress.swift |
| `tests/e2e/android/*` (3) | 190 | android app/src/test FixturesTest.kt, SoundSettingTest.kt; androidTest FixtureScreenTest.kt (strings looked up by name) |
| `tests/fixtures/*.json` (15) | 3575 | server/fixtures/* |
| `tests/portable.test.ts` | 218 | new |
| `examples/configuration.ts` | 46 | new |

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

- Project files the host components render: web manifest, sw.js, _headers, sync-art.py (web-host); wrangler.jsonc (server-host); ios project.yml, Info.plist files, ExportOptions, MacCatalyst.entitlements, Package.resolved, prepare-project.py, sync-art.sh (apple-host); android build.gradle.kts files, gradle wrapper, gradle.lockfile, verification-metadata.xml, AndroidManifest.xml (android-host).
- i18n/keys.txt and scripts/generate-resources.py (translations' generator makes the text files from locales/strings.json).
- Server tests of moved logic: engine.test.ts, bot.test.ts, cards.test.ts, evaluate.test.ts, odds.test.ts, pots.test.ts, view.test.ts, fixtures.test.ts, helpers.ts, sim.ts, fixture-data.ts travel in the components that now own the logic. Server scripts fixtures.ts, showdown-views.ts, prepare-proof.py and INTEGRATION.md.
- Native tests of moved logic: ios CameraTests, LanguageTests, PlatformTests, RingTests, SoundTests and android tests of those parts belong to video-calls, translations, apple-host, table-layout and sound-cues.
- Desktop: scripts/runtime-smoke.cjs and installed-smoke.cjs (they require `../src/policy.cjs`, which the source tree does not have; windows-desktop's own platform checks cover them), native-verify.ps1, icon.py.
- rules/texas-holdem-coding-handoff.md (110 lines): a build note for the hand-built game, replaced by holdem-rules' CONTRACT.md.
- Android INSTRUMENTATION.md.
- Artwork: the source tree's court-card, card-back and scene pictures, single-colour placeholders.
