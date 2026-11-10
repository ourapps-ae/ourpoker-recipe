# OurPoker integration status (recipe 0.3.0)

Open items between the 39 components and the recipe, and the decisions that shape it. Status is `open` (work remains, owner named) or `deferred` (consciously left, with the reason). Nothing here is waiting for a decision: the decisions are under "Decisions".

Evidence: `node --test tests/recipe.test.ts` checks the recipe against the components and this file's totals; `tests/evaluate_recipe_test.py` runs the reference evaluator of the evaluation rules over every answer set and validates each design with aepm's own definition validator; `tests/conditional_artefacts_test.py` and `authoring/check_conditional_artefacts.py` check the conditional artefacts of the application component. No assembler exists, so nothing was assembled by aepm or built.

## Open items

| # | consumer | provider | item | severity | status | what remains | component to change |
|---|---|---|---|---|---|---|---|
| G7.6 | recipe | theme, card-graphics, chip-graphics | `look` sets no chip colours; table artwork and card backs are not named | cosmetic | deferred | chip-graphics has the `casino` colour set only, so both looks use `casino`; card backs follow the look through `card-graphics.backStyle` | recipe |
| G7.15 | recipe | paper | Section 5.5 gives 36 components for the book club | cosmetic | deferred | the paper is not edited here; the book club design has 35 components (39 minus `web-host`, `windows-desktop`, `video-calls`, `store-update`) beside the application | paper |
| G7.16 | recipe | paper | Section 5.5 `apple-host.targets` and secret reference examples fail their grammars | cosmetic | deferred | the paper is not edited here | paper |
| G7.17 | recipe, every component | aepm diagram generator, ourapps catalogue | the generated SVG has a DOCTYPE and `isSafeSvg` refuses it | needs adapter | deferred | `authoring/draw_default_design.py` and `scripts/make_component.py` strip the DOCTYPE; `page/diagram-full.svg` is over `isSafeSvg`'s 200,000 character limit and is not published | ourapps/shared or aepm |
| G9.2 | application Apple client | holdem-rules | `BetRange` is not `Decodable` in holdem-rules' Swift | cosmetic | deferred | the application adds the decoding in `Model.swift` | holdem-rules |
| G9.3 | application Apple client | controls, seating | no numbered badge for lobby and standings lists | cosmetic | deferred | drawn in `Marks.swift`; no component provides a numbered badge | controls |
| G9.4 | application Apple and Android clients | video-calls | no microphone and camera toggle strip | needs adapter | deferred | drawn in `MediaToggles.swift` and `MediaToggles.kt`; video-calls has the session only | video-calls |
| G9.5 | application Android client | video-calls | no seat video tile | needs adapter | deferred | drawn in `SeatScreen.kt` | video-calls |
| G9.6 | application Android client | table-layout | the table draws its own felt, cards, bets and flights over one coordinate box | needs adapter | deferred | `TableScreen.kt` draws them; table-layout gives card and stake spots the client is not built on | application |
| G10.3 | recipe | application | `application.serverAddress` has its local default (`http://localhost:8788`); the server's address is known only after the first deploy and no question asks for it | needs adapter | deferred | the web address, video service and store invitation are asked; the server address belongs to a post-deploy step the assembler does not have | the assembler |
| G10.4 | application | ourapps/shared, aepm or the application | the core files of the application import modules that exist only for some designs: 15 imports in 7 files (`index.ts`, `room.ts`, `parts.ts`, web `main.ts`, `screens.ts`, `store.ts`, `table.ts`) of `video.ts`, `update-links.ts`, `computers.ts`, `guide.ts`, `guide-style.ts`, `shell.ts`, `update.ts`; a design without video, updates, lessons, computer players or the web does not compile | blocks assembly | open | the manifest installs a file only with a component, not a stand-in without it, and two artefacts cannot share a destination; closing it needs a stand-in condition in aepm (install when a component is absent), run-time discovery of the optional modules in the application, or the optional parts moved behind one interface each; `tests/conditional_artefacts_test.py` lists the 15 imports | application |
| G10.9 | application | video-calls | the Windows verification files (`desktop/src/verify.cjs`, `desktop/scripts/package.cjs`, `tests/e2e/verification/windows-package.mjs`) take their result writer from video-calls' `verification/result.mjs`; they are marked windows-desktop, so a design with Windows and without video installs three files that name an excluded component | needs adapter | open | one `component` value cannot say "windows-desktop and video-calls"; the harness belongs in a component of its own or aepm needs a conjunction; the answer set `clinic` shows it | video-calls |
| G10.10 | recipe | web-host, windows-desktop | the Windows build packs the web client (`windows-desktop`'s `build.cjs` builds the web root), which imports web-host's runtime, but `web-host` is included only when `targets` contains `web`; a Windows-only design has no web project | blocks assembly | open | decide the condition (`web` or `windows`); no answer set is Windows-only | recipe |
| G10.11 | application | translations | `web/src/i18n.ts` imports `./strings.json`, which no artefact of the application writes (translations' generator makes it from `locales/strings.json`; nothing runs the generator here) | needs adapter | deferred | listed as `generated` by the check; the assembler runs the translations step | the assembler |

## Counts

Counted from the status and severity columns above (`tests/recipe.test.ts` checks them).

Total 14 open items: open 3, deferred 11.

By severity: blocks assembly 2, needs adapter 7, cosmetic 5.

## Decisions

Made without asking so that a complete recipe exists; each is easy to change (the number is the one in REVIEW.md).

1. **Identity.** guest-identity owns names and token rotation. realtime-rooms requires a `guest-identity` port, connected to guest-identity; the application builds one `createIdentityApi()` (parts.ts) and gives it to seating and, as `services.identity`, to realtime-rooms (room.ts).
2. **Computer players.** A choice `none`, `on-request`, `fill-empty` (default `on-request`), set as `computer-players.mode` and `application.computerPlayers`. `none` leaves out computer-players and poker-strategy; turn-engine's `computer-players` requirement is optional.
3. **Addresses.** Follow-up questions with `askWhen`: `webAddress` (default `http://localhost:5173`, when the web is a target), `videoServiceUrl` (video on), `storeInvitation` (updates on). The web address has one source for four settings. An empty text answer writes nothing (rule 18).
4. **Bundle identifier.** `bundleId` text question, default empty; answered, it sets the four identifier settings, empty they are `app.ourapps.ourpoker`.
5. **Inclusion.** Only `includedWhen` (rule 4): `apple-host` for any of ios, macos, tvos; `video-calls` by `video`; `guided-tour` by `lessons`; `store-update` by `updates`; `web-host`, `android-host`, `windows-desktop` by the devices question (id `targets`); `computer-players` and `poker-strategy` unless `computerPlayers` is `none`.
6. **Devices to apple-host.** The whole devices answer goes to `apple-host.targets` as `$answer`, space-separated and lower case; apple-host reads `ios`, `macos` and `tvos` from it and ignores the other devices. `ourapps-release.targets` takes the same list.
7. **Server provider and size.** Selection (rule 7) chooses it. The `server` answer is the `overrideQuestion` of the `server` and `realtime` jobs; the scale picks the tier: `cloudflare` at small or medium is free, at large paid; `own-hardware` costs nothing at every band. The `video` job follows the scale only.
8. **References.** `videoKey` and `videoSecret` (video on), `hostingAccount` (server `cloudflare`), `androidSigning` (Android a target), `webDeploy` (web a target) and `storeCredentials` (updates on or `ios` a target) are secretRef questions set only by `{ref}` effects; none is in configuration.
9. **Store credentials guard.** Asked when `updates` is yes or the devices include `ios`: ourapps-release has no store call and no iOS job without it. Other Apple targets and Android do not need it.
10. **Application ports.** It provides only `poker-game-adapter` (connected to realtime-rooms' `game`); seven of its twenty requirements are optional, exactly those whose providers can be left out.
11. **One source for numbers.** Players, chips, level length, rebuys and decision time reach every component and the application from one answer each; only the tournament's `startingStack` and `rebuyStack` are set from the chips answer.
12. **Page drawings.** The grouped overview does not draw the application (with it the image passes the generator's size limit); the application and its neighbours are drawn on their own (`page/diagram-application.svg`, SVG only).
13. **Conditional artefacts (rule 25).** A file is marked by the optional components its import and path strings name; a test file also by the application files it imports; several components under one condition (computer-players, poker-strategy) count as one; under different conditions a host component wins, then the first by name. `display-mode` is never marked: the recipe always includes it. Swift and Kotlin files name no component path, so they are not marked (the Apple and Android sources are installed for every design).
14. **Optional modules.** Each optional component is imported by one small module (`video.ts`, `update-links.ts`, `computers.ts`, `shell.ts`, `guide-style.ts`, web `video.ts`); the core files import those modules (G10.4).
15. **Windows verification.** The three files that need video-calls' verification harness are marked windows-desktop; the violation for Windows without video is recorded (G10.9).
16. **Rules 13 to 25.** The choices the reference evaluator makes, the definition fields and the conditional artefacts are rules in component-standard.md.
17. **One form per setting.** Lists in settings are space-separated (`allowedOrigins`, `targets`, `names`, `languages`, `denominations`) and device targets are lower case; the application's own list of allowed web origins is space-separated too.

## What is not specified or built

- **The assembler.** Nothing here runs a recipe: nothing asks the questions, evaluates the design, resolves components, installs, renders `host-settings.ts`, builds or deploys. `authoring/evaluate_recipe.py` is a reference for tests, written to find holes in the rules; it is not the assembler and is not packaged.
- **Optional modules in the core** (G10.4): the application files that import a module installed only for some designs.
- **The post-deploy step** that learns the server's address (G10.3).
- **Client items** G9.2 to G9.6 and the paper rows G7.15 and G7.16.
- **Builds.** Nothing was assembled by aepm or built. A throwaway copy of the `poker-league` design (files placed by their manifests, outside the repositories) was type-checked with `tsc` for the server and web code, the Apple sources were type-checked against the iOS simulator SDK, and the server unit tests ran against it. The end-to-end specs under `tests/e2e/` that need a browser, wrangler, Xcode, Gradle or Windows packaging were not run, and Kotlin was not compiled (kotlinc is not installed).
