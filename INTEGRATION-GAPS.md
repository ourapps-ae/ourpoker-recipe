# OurPoker integration status (recipe 0.4.0)

Open items between the 39 components and the recipe, and the decisions that shape it. Status is `open` (work remains, owner named) or `deferred` (consciously left, with the reason). Nothing here is waiting for a decision: the decisions are under "Decisions".

Evidence: `node --test tests/recipe.test.ts` checks the recipe against the components and this file's totals; `tests/evaluate_recipe_test.py` runs aepm's evaluator (`aepm.recipe`) over every answer set and validates each design with aepm's definition validator; `tests/conditional_artefacts_test.py` and `authoring/check_conditional_artefacts.py` check the conditional and stand-in artefacts of the application component for every answer set; `authoring/try_install.py` installs designs with aepm and builds and runs them (INSTRUCTIONS.md parts 3 and 4); `authoring/kotlin-stand-ins` type-checks the Kotlin stand-ins. All of these are in the recipe's repository, not in the package.

## Open items

| # | consumer | provider | item | severity | status | what remains | component to change |
|---|---|---|---|---|---|---|---|
| G7.6 | recipe | theme, card-graphics, chip-graphics | `look` sets no chip colours; table artwork and card backs are not named | cosmetic | deferred | chip-graphics has the `casino` colour set only, so both looks use `casino`; card backs follow the look through `card-graphics.backStyle`; the web page's theme colour (`web/vite.config.ts`) comes from the theme's default look, because theme installs no file with its `themeName` | recipe |
| G7.15 | recipe | paper | Section 5.5 gives 36 components for the book club | cosmetic | deferred | the paper is not edited here; the book club design has 35 components (39 minus `web-host`, `windows-desktop`, `video-calls`, `store-update`) beside the application | paper |
| G7.16 | recipe | paper | Section 5.5 `apple-host.targets` and secret reference examples fail their grammars | cosmetic | deferred | the paper is not edited here | paper |
| G7.17 | recipe, every component | aepm diagram generator, ourapps catalogue | the generated SVG has a DOCTYPE and `isSafeSvg` refuses it | needs adapter | deferred | `authoring/draw_default_design.py` and `scripts/make_component.py` strip the DOCTYPE; `page/diagram-full.svg` is over `isSafeSvg`'s 200,000 character limit and is not published | ourapps/shared or aepm |
| G9.2 | application Apple client | holdem-rules | `BetRange` is not `Decodable` in holdem-rules' Swift | cosmetic | deferred | the application adds the decoding in `Model.swift` | holdem-rules |
| G9.3 | application Apple client | controls, seating | no numbered badge for lobby and standings lists | cosmetic | deferred | drawn in `Marks.swift`; no component provides a numbered badge | controls |
| G9.4 | application Apple and Android clients | video-calls | no microphone and camera toggle strip | needs adapter | deferred | drawn in `MediaToggles.swift` and `MediaToggles.kt`; video-calls has the session only | video-calls |
| G9.5 | application Android client | video-calls | no seat video tile | needs adapter | deferred | drawn in `SeatScreen.kt` | video-calls |
| G9.6 | application Android client | table-layout | the table draws its own felt, cards, bets and flights over one coordinate box | needs adapter | deferred | `TableScreen.kt` draws them; table-layout gives card and stake spots the client is not built on | application |
| G11.3 | application web, Apple and Android clients | aepm | each client's sources (`web/`, `ios/`, `android/`) are installed for every design; only what builds them comes with the target (`vite.config.ts` with web-host, `generate-project.ts` with apple-host or android-host) | cosmetic | deferred | an artefact condition takes one component, and the files that are pairs already depend on video-calls, guided-tour or store-update; marking the rest with the host would leave those pairs behind on their own; nothing builds a client folder without its host's build file | aepm |

## Counts

Counted from the status and severity columns above (`tests/recipe.test.ts` checks them).

Total 10 open items: open 0, deferred 10.

By severity: blocks assembly 0, needs adapter 4, cosmetic 6.

## Decisions

Made without asking so that a complete recipe exists; each is easy to change.

1. **Identity.** guest-identity owns names and token rotation. realtime-rooms requires a `guest-identity` port, connected to guest-identity; the application builds one `createIdentityApi()` (parts.ts) and gives it to seating and, as `services.identity`, to realtime-rooms (room.ts).
2. **Computer players.** A choice `none`, `on-request`, `fill-empty` (default `on-request`), set as `computer-players.mode` and `application.computerPlayers`. `none` leaves out computer-players and poker-strategy; turn-engine's `computer-players` requirement is optional.
3. **Addresses.** Follow-up questions with `askWhen`: `webAddress` (default `http://localhost:5173`, when the web is a target), `videoServiceUrl` (video on), `storeInvitation` (updates on). The web address has one source for four settings. `serverAddress` is asked always, default `http://localhost:8788`, and is answered again after the server's first deploy (INSTRUCTIONS.md "Two-step deploy"). An empty text answer writes nothing.
4. **Bundle identifier.** `bundleId` text question, default empty; answered, it sets the four identifier settings, empty they are `app.ourapps.ourpoker`.
5. **Inclusion.** Only `includedWhen`: `apple-host` for any of ios, macos, tvos; `web-host` for web or windows (the Windows build packs the web client); `video-calls` by `video`; `guided-tour` by `lessons`; `store-update` by `updates`; `android-host`, `windows-desktop` by the devices question (id `targets`); `computer-players` and `poker-strategy` unless `computerPlayers` is `none`.
6. **Devices to apple-host.** The whole devices answer goes to `apple-host.targets` as `$answer`, space-separated and lower case; apple-host reads `ios`, `macos` and `tvos` from it and ignores the other devices. `ourapps-release.targets` takes the same list.
7. **Server provider and size.** Selection by aepm's evaluator chooses it. The `server` answer is the `overrideQuestion` of the `server` and `realtime` jobs; the scale picks the tier: `cloudflare` at small or medium is free, at large paid; `own-hardware` costs nothing at every band. The `video` job follows the scale only.
8. **References.** `videoKey` and `videoSecret` (video on), `hostingAccount` (server `cloudflare`), `androidSigning` (Android a target), `webDeploy` (web a target) and `storeCredentials` (updates on or `ios` a target) are secretRef questions set only by `{ref}` effects; none is in configuration.
9. **Store credentials guard.** Asked when `updates` is yes or the devices include `ios`: ourapps-release has no store call and no iOS job without it. Other Apple targets and Android do not need it.
10. **Application ports.** It provides only `poker-game-adapter` (connected to realtime-rooms' `game`); seven of its twenty requirements are optional, exactly those whose providers can be left out.
11. **One source for numbers.** Players, chips, level length, rebuys and decision time reach every component and the application from one answer each; only the tournament's `startingStack` and `rebuyStack` are set from the chips answer.
12. **Page drawings.** The grouped overview does not draw the application (with it the image passes the generator's size limit); the application and its neighbours are drawn on their own (`page/diagram-application.svg`, SVG only).
13. **Conditional artefacts.** A file is marked by the optional components its import and path strings name; a test file also by the application files it imports; several components under one condition (computer-players, poker-strategy) count as one; under different conditions a host component wins, then the first by name. `display-mode` is never marked: the recipe always includes it. Swift and Kotlin name a component's types, not its path: the few native modules that do are listed in `scripts/make_component.py` and marked, and `tests/conditional_artefacts_test.py` refuses any other native file that names video-calls', guided-tour's or store-update's types.
14. **Optional modules and stand-ins.** Each optional component is reached through small modules (server `video.ts`, `update-links.ts`, `computers.ts`; web `video.ts`, `shell.ts`, `guide.ts`, `guide-style.ts`, `update.ts`; Apple `Video.swift`, `SeatScreen.swift`, `Lessons.swift`, `Updates.swift`; Android `Video.kt`, `ui/SeatScreen.kt`, `ui/Lessons.kt`, `Updates.kt`), marked `component`; a stand-in under `implementation/stand-ins/` at the same destination is marked `withoutComponent` with the same component, so every design installs one of the two and every client compiles. The web package files are a pair too (`livekit-client` only with video-calls). The real Swift and Kotlin `Video` is video-calls' `VideoSession` under the application's name; the stand-ins declare the members the application uses and never connect.
15. **Windows verification.** The desktop verify and package scripts and `windows-package.mjs` take their result writer from windows-desktop's `verification/result.mjs` (the same aepm result protocol video-calls' harness writes), so they need windows-desktop alone.
16. **Evaluation.** aepm's evaluator (`aepm.recipe`, run by `aepm design`) turns answers into the design; the recipe's tests run the same code.
17. **One form per setting.** Lists in settings are space-separated (`allowedOrigins`, `targets`, `names`, `languages`, `denominations`) and device targets are lower case; the application's own list of allowed web origins is space-separated too.
18. **Build files.** The application ships its build files: `server/` (package and lock with exact versions, TypeScript and Vitest configuration, `Env` declaration), `web/` (package and lock, `index.html`, `vite.config.ts` that returns web-host's Vite configuration, TypeScript configuration), `desktop/` (package and lock), and `ios/generate-project.ts` and `android/generate-project.ts`, which run apple-host's and android-host's renderers with their installed `settings.ts`. aepm writes a component's files only under `components/<name>/`, so the host components' installed files (web-host `settings.ts` and `vite.ts`, server-host `wrangler.jsonc` and `start.ts`) are used from there.
19. **Generated text.** `scripts/make_component.py` runs translations' generator on `locales/strings.json` into `locales/generated/` and ships the web, Apple and Android files, so install alone gives every client its text.
20. **Languages on the native clients.** The `languages` answer also sets `application.languages`. The full Apple catalogue and Android string folders are installed outside the projects (`ios/strings/`, `android/strings/`); `generate-project.ts` copies only the answered languages into the project, and the native language pickers offer only those.

## What is not specified or built

- **The assembler.** Nothing here asks the questions for a person: that is the agent's (INSTRUCTIONS.md part 1); `aepm questions`, `aepm design`, `aepm resolve` and `aepm install` do the rest (part 3).
- **Client items** G9.2 to G9.6 and the paper rows G7.15 and G7.16.
- **Builds not run.** The Android build (no Android SDK where the recipe is maintained; the Kotlin stand-ins are type-checked on the JVM), Windows packaging (needs Windows), the end-to-end specs under `tests/e2e/` that need a LiveKit service, Xcode test runs or Windows, and deploys to Cloudflare (need an account). The Apple builds ran for the iOS and tvOS simulators (`default`, `book-club`, `native-no-lessons`).
