# OurPoker integration status (recipe 0.4.0)

Open items between the 39 components and the recipe, and the decisions that shape it. Status is `open` (work remains, owner named) or `deferred` (consciously left, with the reason). Nothing here is waiting for a decision: the decisions are under "Decisions".

Evidence: `node --test tests/recipe.test.ts` checks the recipe against the components and this file's totals; `tests/evaluate_recipe_test.py` runs the reference evaluator of the evaluation rules over every answer set and validates each design with aepm's own definition validator; `tests/conditional_artefacts_test.py` and `authoring/check_conditional_artefacts.py` check the conditional and stand-in artefacts of the application component for every answer set; `authoring/try_install.py` installs designs with aepm and builds and runs the server and web client (INSTRUCTIONS.md part 3).

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
| G11.1 | application Apple and Android clients | video-calls, guided-tour | the Swift and Kotlin sources use video-calls' `VideoSession` and LiveKit views and guided-tour's tour types directly (no import names a component, so no file can be marked); a design with an Apple or Android target and without video or lessons does not compile (`book-club`, `tv-only`) | blocks assembly | open | Swift and Kotlin stand-ins for the video and lessons parts, as `StoreVersion.swift` is for store-update, or the native video and lessons code moved behind one module each that the manifest can mark | application |
| G11.2 | application Apple and Android clients | translations | the generated `Localizable.xcstrings` and `strings.xml` hold all four languages; the `languages` answer limits the web client only (through translations' installed `languages.ts`) | cosmetic | open | the Apple and Android language pickers read the installed `languages` setting, or translations ships one generated set per language | translations |

## Counts

Counted from the status and severity columns above (`tests/recipe.test.ts` checks them).

Total 11 open items: open 2, deferred 9.

By severity: blocks assembly 1, needs adapter 4, cosmetic 6.

## Decisions

Made without asking so that a complete recipe exists; each is easy to change (the number is the one in REVIEW.md).

1. **Identity.** guest-identity owns names and token rotation. realtime-rooms requires a `guest-identity` port, connected to guest-identity; the application builds one `createIdentityApi()` (parts.ts) and gives it to seating and, as `services.identity`, to realtime-rooms (room.ts).
2. **Computer players.** A choice `none`, `on-request`, `fill-empty` (default `on-request`), set as `computer-players.mode` and `application.computerPlayers`. `none` leaves out computer-players and poker-strategy; turn-engine's `computer-players` requirement is optional.
3. **Addresses.** Follow-up questions with `askWhen`: `webAddress` (default `http://localhost:5173`, when the web is a target), `videoServiceUrl` (video on), `storeInvitation` (updates on). The web address has one source for four settings. `serverAddress` is asked always, default `http://localhost:8788`, and is answered again after the server's first deploy (INSTRUCTIONS.md "Two-step deploy"). An empty text answer writes nothing (rule 18).
4. **Bundle identifier.** `bundleId` text question, default empty; answered, it sets the four identifier settings, empty they are `app.ourapps.ourpoker`.
5. **Inclusion.** Only `includedWhen` (rule 4): `apple-host` for any of ios, macos, tvos; `web-host` for web or windows (the Windows build packs the web client); `video-calls` by `video`; `guided-tour` by `lessons`; `store-update` by `updates`; `android-host`, `windows-desktop` by the devices question (id `targets`); `computer-players` and `poker-strategy` unless `computerPlayers` is `none`.
6. **Devices to apple-host.** The whole devices answer goes to `apple-host.targets` as `$answer`, space-separated and lower case; apple-host reads `ios`, `macos` and `tvos` from it and ignores the other devices. `ourapps-release.targets` takes the same list.
7. **Server provider and size.** Selection (rule 7) chooses it. The `server` answer is the `overrideQuestion` of the `server` and `realtime` jobs; the scale picks the tier: `cloudflare` at small or medium is free, at large paid; `own-hardware` costs nothing at every band. The `video` job follows the scale only.
8. **References.** `videoKey` and `videoSecret` (video on), `hostingAccount` (server `cloudflare`), `androidSigning` (Android a target), `webDeploy` (web a target) and `storeCredentials` (updates on or `ios` a target) are secretRef questions set only by `{ref}` effects; none is in configuration.
9. **Store credentials guard.** Asked when `updates` is yes or the devices include `ios`: ourapps-release has no store call and no iOS job without it. Other Apple targets and Android do not need it.
10. **Application ports.** It provides only `poker-game-adapter` (connected to realtime-rooms' `game`); seven of its twenty requirements are optional, exactly those whose providers can be left out.
11. **One source for numbers.** Players, chips, level length, rebuys and decision time reach every component and the application from one answer each; only the tournament's `startingStack` and `rebuyStack` are set from the chips answer.
12. **Page drawings.** The grouped overview does not draw the application (with it the image passes the generator's size limit); the application and its neighbours are drawn on their own (`page/diagram-application.svg`, SVG only).
13. **Conditional artefacts (rule 25).** A file is marked by the optional components its import and path strings name; a test file also by the application files it imports; several components under one condition (computer-players, poker-strategy) count as one; under different conditions a host component wins, then the first by name. `display-mode` is never marked: the recipe always includes it. Swift and Kotlin files name no component path, so they are not marked (the Apple and Android sources are installed for every design).
14. **Optional modules and stand-ins.** Each optional component is imported by one small module (server `video.ts`, `update-links.ts`, `computers.ts`; web `video.ts`, `shell.ts`, `guide.ts`, `guide-style.ts`, `update.ts`), marked `component`; a stand-in under `implementation/stand-ins/` at the same destination is marked `withoutComponent` with the same component, so every design installs one of the two and the core compiles. The web package files are a pair too (`livekit-client` only with video-calls). `StoreVersion.swift` stands in for store-update's Swift declarations.
15. **Windows verification.** The desktop verify and package scripts and `windows-package.mjs` take their result writer from windows-desktop's `verification/result.mjs` (the same aepm result protocol video-calls' harness writes), so they need windows-desktop alone.
16. **Rules 13 to 25.** The choices the reference evaluator makes, the definition fields and the conditional artefacts are rules in component-standard.md.
17. **One form per setting.** Lists in settings are space-separated (`allowedOrigins`, `targets`, `names`, `languages`, `denominations`) and device targets are lower case; the application's own list of allowed web origins is space-separated too.
18. **Build files.** The application ships its build files: `server/` (package and lock with exact versions, TypeScript and Vitest configuration, `Env` declaration), `web/` (package and lock, `index.html`, `vite.config.ts` that returns web-host's Vite configuration, TypeScript configuration), `desktop/` (package and lock), and `ios/generate-project.ts` and `android/generate-project.ts`, which run apple-host's and android-host's renderers with their installed `settings.ts`. aepm writes a component's files only under `components/<name>/`, so the host components' installed files (web-host `settings.ts` and `vite.ts`, server-host `wrangler.jsonc` and `start.ts`) are used from there.
19. **Generated text.** `scripts/make_component.py` runs translations' generator on `locales/strings.json` into `locales/generated/` and ships the web, Apple and Android files, so install alone gives every client its text.

## What is not specified or built

- **The assembler.** Nothing here runs a recipe for a person: asking the questions is the agent's (INSTRUCTIONS.md part 1). `authoring/evaluate_recipe.py` is a reference evaluator for tests and `authoring/try_install.py` a proof that installs and runs designs; neither is packaged.
- **Native designs without video or lessons** (G11.1).
- **Client items** G9.2 to G9.6 and the paper rows G7.15 and G7.16.
- **Builds not run here.** Android (no Android SDK or kotlinc on this machine), Windows packaging (needs Windows), the end-to-end specs under `tests/e2e/` that need a LiveKit service, Xcode test runs or Windows, and deploys to Cloudflare (need an account). The iOS build (`xcodebuild`, iOS simulator) ran for the `default` design.
