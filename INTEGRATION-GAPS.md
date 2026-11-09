# OurPoker integration gaps: final status (recipe 0.2.0, components as on disk on 2026-11-09, after the final recipe pass)

Every gap found between the 39 components and the recipe, with its final status. Ids are those of the first report; rows found since have new ids (G5.18, G7.18, G7.19, sections 9 and 10). Severity is what the gap was when found. Status is `closed` (by which component version, the recipe or the application), `deferred` (consciously left, with the reason; nothing here depends on it) or `open` (work remains, owner named). No row is `decision-needed`: the decisions are under "Decisions taken".

Evidence: `node --test tests/recipe.test.ts` checks the recipe against the components and this file's totals; `tests/evaluate_recipe_test.py` runs the reference evaluator of the evaluation rules over every answer set and validates each design with aepm's own definition validator; `tests/conditional_artefacts_test.py` and `authoring/check_conditional_artefacts.py` check the conditional artefacts of the application component. `authoring/integration-real.test.ts` in `components/turn-engine` (not packaged, not re-run by this recipe's tests) passes over the real 0.2.0 providers. No assembler exists, so nothing was assembled by aepm or built.

## 1. turn-engine requires game-rules; holdem-rules provides game-rules

| # | consumer | provider | gap | severity | status | closed by, or what remains | component to change |
|---|---|---|---|---|---|---|---|
| G1.1 | turn-engine | holdem-rules | `optionNames` property missing | blocks assembly | closed | holdem-rules 0.2.0 (createGameRules); the application sets it to `["odds"]` | - |
| G1.2 | turn-engine | holdem-rules | `newRound` against `newHand` (deck, blinds, stacks) | needs adapter | closed | holdem-rules 0.2.0 (createGameRules): deck from card-deck, blinds from level-schedule, stacks from the ledger | - |
| G1.3 | turn-engine | holdem-rules | `phase` missing | blocks assembly | closed | holdem-rules 0.2.0 (createGameRules) | - |
| G1.4 | turn-engine | holdem-rules | `parseMove` against `parseAction` | needs adapter | closed | holdem-rules 0.2.0 (createGameRules) | - |
| G1.5 | turn-engine | holdem-rules | `act` against `apply`; extra error codes | needs adapter | closed | holdem-rules 0.2.0 (createGameRules); turn-engine 0.2.0 accepts `unknownPlayer` and `notEnoughPlayers`, the adapter maps them to `notAllowed` | - |
| G1.6 | turn-engine | holdem-rules | `defaultMove` against `autoAction` | needs adapter | closed | holdem-rules 0.2.0 (createGameRules) | - |
| G1.7 | turn-engine | holdem-rules | `step` against `runoutStep` | needs adapter | closed | holdem-rules 0.2.0 (createGameRules) | - |
| G1.8 | turn-engine | holdem-rules | `outcome` (hold time, history entry) missing | blocks assembly | closed | holdem-rules 0.2.0 (createGameRules): `holdMs` and `historyEntry.winners` | - |
| G1.9 | turn-engine | holdem-rules | `voidRound` against `voidHand` | needs adapter | closed | holdem-rules 0.2.0 (createGameRules) | - |
| G1.10 | turn-engine | holdem-rules | `observation` (strategy input) missing | blocks assembly | closed | holdem-rules 0.2.0 (createGameRules): `DecisionInput` | - |
| G1.11 | turn-engine | holdem-rules | `records` (hidden cards per player) missing | blocks assembly | closed | holdem-rules 0.2.0 (createGameRules); the best hand and odds are added in the application's `wire.ts` | - |
| G1.12 | turn-engine | holdem-rules | `publicView` against `view` | needs adapter | closed | holdem-rules 0.2.0 (createGameRules) | - |
| G1.13 | turn-engine | holdem-rules | `legal` against `legalActions` | needs adapter | closed | holdem-rules 0.2.0 (createGameRules) | - |
| G1.14 | turn-engine | holdem-rules | `prompt` missing | cosmetic | closed | holdem-rules 0.2.0 (createGameRules); its text names no one, so `wire.ts` builds the winner prompts the clients read | - |
| G1.15 | turn-engine, holdem-rules | chip-ledger | holdem-rules kept its own stacks and pots beside the ledger | needs adapter | closed | holdem-rules 0.2.0 (createGameRules) moves every chip through chip-ledger | - |
| G1.16 | holdem-rules | chip-ledger | `sidePots` and `oddChipRule` ignored | needs adapter | closed | holdem-rules 0.2.0 (createGameRules) reads them through the ledger it is given | - |
| G1.17 | holdem-rules | card-deck, chip-ledger, level-schedule, rules-settings | four declared requirements not used | cosmetic | closed | holdem-rules 0.2.0 (createGameRules) takes all five providers | - |

## 2. turn-engine requires game-clock; game-clock provides game-clock

| # | consumer | provider | gap | severity | status | closed by, or what remains | component to change |
|---|---|---|---|---|---|---|---|
| G2.1 | turn-engine | game-clock | `create(now)` against `createClock` | needs adapter | closed | game-clock 0.2.0 `create` | - |
| G2.2 | turn-engine | game-clock | `advance(clock, now, runs)` against `tick` | needs adapter | closed | game-clock 0.2.0 `advance`; `runsFor` derives the flags | - |
| G2.3 | turn-engine | game-clock | `reset` missing | needs adapter | closed | game-clock 0.2.0 `reset` | - |
| G2.4 | turn-engine | game-clock | `elapsed(clock, which)` missing | blocks assembly | closed | game-clock 0.2.0 `elapsed` | - |
| G2.5 | turn-engine | game-clock | `wallAt(clock, which, targetMs)` missing | blocks assembly | closed | game-clock 0.2.0 `wallAt` | - |
| G2.6 | computer-players | game-clock | `elapsed` missing | blocks assembly | closed | game-clock 0.2.0 `elapsed` | - |
| G2.7 | computer-players | game-clock | `wallAt` missing | blocks assembly | closed | game-clock 0.2.0 `wallAt` | - |
| G2.8 | computer-players | game-clock | clock type named differently | cosmetic | closed | computer-players 0.2.0 declares the two operations it calls | - |

## 3. turn-engine requires presence; presence provides presence

| # | consumer | provider | gap | severity | status | closed by, or what remains | component to change |
|---|---|---|---|---|---|---|---|
| G3.1 | turn-engine | presence | `create` against `createPresence` | needs adapter | closed | presence 0.2.0 `createPresenceApi` | - |
| G3.2 | turn-engine | presence | `register` against `addParticipant` | needs adapter | closed | presence 0.2.0 `createPresenceApi` | - |
| G3.3 | turn-engine | presence | `unregister` against `removeParticipant` | needs adapter | closed | presence 0.2.0 `createPresenceApi` | - |
| G3.4 | turn-engine | presence | `restart` missing | needs adapter | closed | presence 0.2.0 `restart` | - |
| G3.5 | turn-engine | presence | sitting out (`sitOut`, `returned`, `leftGame`, `isSittingOut`) missing | blocks assembly | closed | presence 0.2.0 | - |
| G3.6 | turn-engine | presence | accessors `isConnected`, `isLive`, `misses`, `lastSeen` missing | needs adapter | closed | presence 0.2.0 | - |
| G3.7 | turn-engine | presence | holds owned by both presence and game-clock | blocks assembly | closed | presence 0.2.0 owns pauses and holds; game-clock 0.2.0 states it takes run flags only | - |
| G3.8 | turn-engine | presence | `refresh` takes a different context | needs adapter | closed | presence 0.2.0 `refreshFor` | - |
| G3.9 | turn-engine | presence | `setManualPause` without a time | needs adapter | closed | presence 0.2.0 | - |
| G3.10 | turn-engine | presence | `isManualPause`, `pausedSince` missing | needs adapter | closed | presence 0.2.0 | - |
| G3.11 | turn-engine | presence | `nextWake` against `nextCheck` | needs adapter | closed | presence 0.2.0 `nextSilence` | - |
| G3.12 | turn-engine | presence | `pauseReasons` string type | cosmetic | closed | no action needed | - |
| G3.13 | presence | guest-identity | declared requirement not called | cosmetic | closed | presence 0.2.0 documents it in `interfaces/required/guest-identity.json` | - |

## 4. Other turn-engine requirements

| # | consumer | provider | gap | severity | status | closed by, or what remains | component to change |
|---|---|---|---|---|---|---|---|
| G4.1 | turn-engine | private-views | `redact(viewerId, records)` missing | needs adapter | closed | private-views 0.2.0 `redact` | - |
| G4.2 | turn-engine | round-history | `create` against `createHistory` | needs adapter | closed | round-history 0.2.0 `create` | - |
| G4.3 | turn-engine | round-history | `push` of entries with game fields | needs adapter | closed | round-history 0.2.0 `push` keeps extra fields; holdem-rules 0.2.0 entries carry `winners` | - |
| G4.4 | turn-engine | round-history | `list` against `recentRounds` | needs adapter | closed | round-history 0.2.0 `list` | - |
| G4.5 | turn-engine | seating | 21 operations | cosmetic | closed | no action needed (seating 0.2.0 adds `compact`) | - |
| G4.6 | turn-engine | tournament | 23 operations | cosmetic | closed | no action needed (tournament 0.2.0 adds `levelClockRuns`) | - |
| G4.7 | turn-engine | computer-players | 11 operations | cosmetic | closed | no action needed | - |
| G4.8 | turn-engine | rules-settings | `value(path)` missing | needs adapter | closed | rules-settings 0.2.0 `createRulesSettings(rules).value` | - |
| G4.9 | turn-engine | computer-players | requirement is mandatory, the recipe made computer players optional | blocks assembly | closed | turn-engine 0.3.0 marks the requirement optional; the recipe includes computer-players and poker-strategy unless the answer is `none` (`make_recipe.py` asserts the requirement is optional) | - |

## 5. tournament, computer-players, card-deck, seating

| # | consumer | provider | gap | severity | status | closed by, or what remains | component to change |
|---|---|---|---|---|---|---|---|
| G5.1 | tournament | seating | `list`, `find`, `people` | cosmetic | closed | no action needed | - |
| G5.2 | tournament | chip-ledger | `create()` missing | needs adapter | closed | chip-ledger 0.2.0 `create` | - |
| G5.3 | tournament | chip-ledger | `issue` against `credit` | needs adapter | closed | chip-ledger 0.2.0 `issue` | - |
| G5.4 | tournament | chip-ledger | `balance` against `stakeOf` | needs adapter | closed | chip-ledger 0.2.0 `balance` | - |
| G5.5 | tournament | chip-ledger | `issued` against `audit` | needs adapter | closed | chip-ledger 0.2.0 `issued` | - |
| G5.6 | tournament, chip-ledger | recipe | two starting-stack settings for one number | needs adapter | closed | tournament 0.2.0 issues the chips; the recipe sets only `tournament.startingStack` | - |
| G5.7 | tournament | level-schedule | `levelAt` against `levelFor` | needs adapter | closed | level-schedule 0.2.0 `createScheduleApi` | - |
| G5.8 | tournament | level-schedule | `describe` missing | needs adapter | closed | level-schedule 0.2.0 `describe`; `wire.ts` maps it to the clients' clock | - |
| G5.9 | level-schedule | rules-settings | blind table not readable from the rules file | needs adapter | closed | level-schedule 0.2.0 `scheduleFromRules` | - |
| G5.10 | computer-players | poker-strategy | `newMemory` missing | needs adapter | closed | poker-strategy 0.2.0 | - |
| G5.11 | computer-players | poker-strategy | `choose` against `decide` | blocks assembly | closed | poker-strategy 0.2.0 `choose`, with holdem-rules 0.2.0 `observation` | - |
| G5.12 | computer-players | poker-strategy | `observe` signature | needs adapter | closed | poker-strategy 0.2.0 `observe` | - |
| G5.13 | computer-players | seating | `isFull`, `find`, `findByName`, `join`, `canAddComputer` | cosmetic | closed | no action needed | - |
| G5.14 | computer-players | recipe | `names` default fails the `label` grammar | blocks assembly | closed | computer-players 0.2.0 space-separated names; the recipe sets `names` | - |
| G5.15 | card-deck | fair-shuffle | `shuffle(items)` against `shuffle(items, next)` | needs adapter | closed | card-deck 0.2.0 takes a shuffler (`bindShuffle`) | - |
| G5.16 | seating | guest-identity | `validName` needs settings | needs adapter | closed | seating 0.2.0 `bindIdentity` | - |
| G5.17 | realtime-rooms, guest-identity | n/a | both issue and rotate tokens; no port joins them | needs adapter | closed | guest-identity 0.3.0 owns identity and token rotation; realtime-rooms 0.4.0 requires a `guest-identity` port; the recipe connects them and the application passes `createIdentityApi()` as `services.identity` (room.ts) and to seating (parts.ts) | - |
| G5.18 | recipe | chip-ledger | chip-ledger has a `seats` setting in code (default 9) but not in `collect`, so the recipe cannot set it from the `players` answer | cosmetic | closed | chip-ledger 0.3.0 collects `seats`; the recipe sets it from the players answer, and parts.ts passes the rules file's maximum | - |

## 6. realtime-rooms, room-directory, server-host

| # | consumer | provider | gap | severity | status | closed by, or what remains | component to change |
|---|---|---|---|---|---|---|---|
| G6.1 | server-host | room-directory | two directory classes with one storage key | blocks assembly | closed | realtime-rooms 0.3.0 removed its class; the application extends room-directory 0.2.0's | - |
| G6.2 | realtime-rooms, room-directory | n/a | directory data listed under realtime-rooms | cosmetic | closed | room-directory 0.2.0 has its own `migration.json` | - |
| G6.3 | room-directory | realtime-rooms | declared `room-session` requirement | cosmetic | closed | room-directory 0.2.0 documents the one call it makes (ask a room) | - |
| G6.4 | realtime-rooms | n/a | no JSON interface files | cosmetic | closed | realtime-rooms 0.3.0 `room-session.json` and `required/game-adapter.json` | - |
| G6.5 | server-host | realtime-rooms, room-directory | requirements point at its own file | cosmetic | closed | server-host 0.2.0 `interfaces/required/` | - |
| G6.6 | recipe | realtime-rooms | no `own-hardware` profile | needs adapter | closed | realtime-rooms 0.3.0 suitability | - |
| G6.7 | recipe | room-directory | 200-connection limit against the large band | cosmetic | closed | room-directory 0.2.0 raised it to 1,000 | - |

## 7. Recipe against component settings

| # | consumer | provider | gap | severity | status | closed by, or what remains | component to change |
|---|---|---|---|---|---|---|---|
| G7.1 | recipe | rules-settings | `rulesFile` default fails its grammar | blocks assembly | closed | rules-settings 0.2.0 (`slug` name); the recipe sets `texas-holdem-house-rules` | - |
| G7.2 | recipe | rules-settings, chip-ledger, level-schedule, tournament, game-clock, seating | numbers restated in the rules file and in settings | needs adapter | closed | recipe and application: the rules file is the one source, six answers are written over it by `rules.ts`, components are built from it (`scheduleFromRules` for levels), the recipe restates none and sets each component setting from the same answer; checked by `tests/recipe.test.ts` | - |
| G7.3 | recipe | translations | no `languages` setting | needs adapter | closed | translations 0.3.0; set from the languages answer | - |
| G7.4 | recipe | video-calls | no settings for the video service | needs adapter | closed | video-calls 0.3.0: the recipe sets `enabled` and the two secret references from the video answer; the address is G7.8 | - |
| G7.5 | recipe | store-update | no settings | needs adapter | closed | store-update 0.3.0: the recipe sets `enabled` from the updates answer; the invitation address is G7.8 | - |
| G7.6 | recipe | theme, card-graphics, chip-graphics | `look` sets no chip colours; table artwork and card backs are not named | cosmetic | deferred | no second chip colour set exists (chip-graphics has `casino` only, or a hand-written set), so both looks use `casino`; card backs follow the look through `card-graphics.backStyle` | recipe |
| G7.7 | recipe | table-layout | no seat-count setting | cosmetic | closed | no action needed: the count comes from the game | - |
| G7.8 | recipe | web-host, server-host, invitations, video-calls, store-update | no question supplies the web address, the video service address or the store invitation | needs adapter | closed | questions `webAddress` (default `http://localhost:5173`, asked when the web is a target; sets `web-host.webAddress`, `server-host.allowedOrigins`, `invitations.inviteAddress` and the application's copy), `videoServiceUrl` (asked when video is on) and `storeInvitation` (asked when updates are on); `web-host.webAddress` is never missing | - |
| G7.9 | recipe | apple-host, android-host, ourapps-release | bundle and package id fixed to `app.ourapps.ourpoker` | needs adapter | closed | question `bundleId` (empty by default): when answered it sets the Apple, Android, release and application identifiers; when empty they keep `app.ourapps.<applicationId>`, the application's derived value written once in `make_recipe.py` | - |
| G7.10 | recipe | display-mode, video-calls, windows-desktop | three configuration ports have no connection in `recipe.json` | blocks assembly | closed | display-mode, video-calls and windows-desktop 0.3.1 mark `configuration` optional, so the application provides no configuration port (its code passes the documents); ourapps `validateRecipe` accepts the instance `application` | - |
| G7.11 | recipe | application component | provided ports with no consumer; the application's requirements cannot be connected | needs adapter | closed | the recipe connects all 20 requirements of the application component; the seven whose provider can be left out (`web-shell`, `apple-shell`, `android-shell`, `desktop-host`, `media-session`, `guided-tour`, `updates`) are `optional` in its manifest and `make_recipe.py` checks that they are exactly those | - |
| G7.12 | recipe | apple-host | `includedWhen` cannot say "any of ios, macos, tvos" | needs adapter | closed | the recipe includes `apple-host` by `{any: [contains ios, contains macos, contains tvos]}`; effects have no `includes` | - |
| G7.13 | recipe | recipe format | `sets` forms beyond `$answer` (join, map, job profile, secret reference, `application.` targets, boolean maps) | needs adapter | closed | evaluation rules 5 and 6 (literal, `$answer`, `map`, `fromScale`, `template`, `ref`), implemented by `authoring/evaluate_recipe.py` and tested; the recipe uses `$answer`, `map` and `ref` | - |
| G7.14 | recipe | server-host | `provider` and `accountReference` depend on the server answer | needs adapter | closed | the recipe's selection (rule 7) chooses the server profile from the scale and the server answer and writes `server-host.provider`; the account reference is a `{ref}` effect of `hostingAccount`, asked only for `cloudflare` | - |
| G7.15 | recipe | paper | Section 5.5 gives 36 components for the book club | cosmetic | deferred | paper Section 5.5 is not edited here; with the decided format the book club design has 35 components (39 minus `web-host`, `windows-desktop`, `video-calls`, `store-update`) beside the application | paper |
| G7.16 | recipe | paper | Section 5.5 `apple-host.targets` and secret reference examples fail their grammars | cosmetic | deferred | paper Section 5.5 is not edited here; unchanged | paper |
| G7.17 | recipe, every component | aepm diagram generator, ourapps catalogue | generated SVG has a DOCTYPE; `isSafeSvg` refuses it | needs adapter | deferred | `authoring/draw_default_design.py` and `scripts/make_component.py` strip the DOCTYPE; the generator and `isSafeSvg` are unchanged; `page/diagram-full.svg` is also over `isSafeSvg`'s 200,000 character limit and is not published | ourapps/shared or aepm |
| G7.18 | recipe | computer-players | the recipe sets `fillEmptySeats` and `takeOverAbsent` from the answer; the application passes false for both (heads-up start, no play for absent people) | needs adapter | closed | decision: the question is a choice `none`, `on-request`, `fill-empty` (default `on-request`) mapped to `computer-players.mode` (0.3.0) and to `application.computerPlayers`, which parts.ts passes as `mode` | - |
| G7.19 | realtime-rooms | turn-engine, application | `recipe.json` connects turn-engine's own adapter to realtime-rooms; the clients read the application's poker view | needs adapter | closed | the application's `poker-game-adapter` is connected to realtime-rooms' `game` requirement; turn-engine's adapter is connected to the application's `game-adapter` requirement | - |

## 8. Requirements with no operation list

| # | consumer | provider | gap | severity | status | closed by, or what remains | component to change |
|---|---|---|---|---|---|---|---|
| G8.1 | web-host, apple-host, android-host | theme | no required file | cosmetic | closed | hosts 0.2.0 `interfaces/required/theme.json` | - |
| G8.2 | controls, table-layout, card-graphics, chip-graphics | theme | no required file | cosmetic | closed | 0.2.0 `interfaces/required/theme.json` | - |
| G8.3 | table-layout, guided-tour | controls | no required file | cosmetic | closed | 0.2.0 `interfaces/required/controls.json` | - |
| G8.4 | guided-tour, sound-cues | preferences | no required file | cosmetic | closed | 0.2.0 `interfaces/required/preferences.json` | - |
| G8.5 | guided-tour | translations | no required file | cosmetic | closed | guided-tour 0.2.0 `interfaces/required/language.json` | - |
| G8.6 | holdem-rules, poker-odds | poker-hand-ranking | operations used not listed | cosmetic | closed | 0.2.0 `interfaces/required/hand-ranking.json` | - |
| G8.7 | poker-strategy | poker-odds | `winChance` | cosmetic | closed | no action needed | - |
| G8.8 | poker-hand-ranking, poker-odds | card-deck | no `CardCodes` object | cosmetic | closed | card-deck 0.2.0 `cardCodes` | - |
| G8.9 | poker-strategy | poker-hand-ranking | declared requirement not called | cosmetic | closed | poker-strategy 0.2.0 documents it | - |
| G8.10 | presence, room-directory, server-host | guest-identity, realtime-rooms, room-directory | requirements point at the consumer's own file | cosmetic | closed | 0.2.0 `interfaces/required/` | - |

## 9. Application code marked `// GAP:`

| # | consumer | provider | gap | severity | status | closed by, or what remains | component to change |
|---|---|---|---|---|---|---|---|
| G9.1 | application server | server-host | `host-settings.ts` (provider, account reference, region) is imported by `index.ts` but nothing writes it | needs adapter | closed | server-host 0.3.0 renders `components/server-host/server/host-settings.ts` from its own settings at install; `index.ts` imports `serverSettings` from it and the `// GAP:` mark is removed | - |
| G9.2 | application Apple client | holdem-rules | `BetRange` is not `Decodable` in holdem-rules' Swift | cosmetic | deferred | the application adds the decoding in `Model.swift`; holdem-rules' Swift `BetRange` stays not `Decodable` | holdem-rules |
| G9.3 | application Apple client | controls, seating | no numbered badge for lobby and standings lists | cosmetic | deferred | drawn in `Marks.swift`; no component provides a numbered badge | controls |
| G9.4 | application Apple and Android clients | video-calls | video session without a microphone and camera toggle strip | needs adapter | deferred | drawn in `MediaToggles.swift` and `MediaToggles.kt`; video-calls 0.3.1 has no toggle strip | video-calls |
| G9.5 | application Android client | video-calls | no seat video tile | needs adapter | deferred | drawn in `SeatScreen.kt`; video-calls has no seat video tile | video-calls |
| G9.6 | application Android client | table-layout | the table draws its own felt, cards, bets and flights over one coordinate box | needs adapter | deferred | `TableScreen.kt` draws its own felt, cards, bets and flights; table-layout 0.2.0 gives card and stake spots the client has not been moved onto | application |

## 10. Found while rebuilding the recipe to the decided format, and in the final pass

| # | consumer | provider | gap | severity | status | closed by, or what remains | component to change |
|---|---|---|---|---|---|---|---|
| G10.1 | recipe | apple-host | the decided form passes the whole devices answer (`web ios android macos windows tvos`) as `apple-host.targets`; apple-host 0.2.0 accepted only `iphone ipad mac tv` | blocks assembly | closed | apple-host 0.3.0 reads `ios`, `macos` and `tvos` from the list and ignores the other devices; the recipe passes `$answer` as it is | - |
| G10.2 | recipe | turn-engine | the decided inclusion (computer-players and poker-strategy out for `none`) left turn-engine's mandatory `computer-players` requirement unconnected | needs adapter | closed | turn-engine 0.3.0 `optional: true`; the recipe includes both unless the answer is `none`; `tests/evaluate_recipe_test.py` shows a design without them with every non-optional requirement connected | - |
| G10.3 | recipe | application | `application.serverAddress` keeps its local default (`http://localhost:8788`); the server's address is known only after the first deploy and no question asks for it | needs adapter | deferred | the web address, video service and store invitation are asked; the server address belongs to a post-deploy step the assembler does not yet have | the assembler |
| G10.4 | application | ourapps/shared, aepm or the application | the core files of the application import modules that exist only for some designs: 15 imports in 7 files (`index.ts`, `room.ts`, `parts.ts`, web `main.ts`, `screens.ts`, `store.ts`, `table.ts`) of `video.ts`, `update-links.ts`, `computers.ts`, `guide.ts`, `guide-style.ts`, `shell.ts`, `update.ts`; a design without video, updates, lessons, computer players or the web does not compile | blocks assembly | open | the manifest can install a file only with a component, not a stand-in without it, and two artefacts cannot share a destination; closing it needs a stand-in condition in aepm (install when a component is absent), run-time discovery of the optional modules in the application, or the optional parts moved behind one interface each; `tests/conditional_artefacts_test.py` lists the 15 imports | application |
| G10.5 | recipe | ourapps-release | `storeCredentials` was a required secret, so its question was always asked, even for a web-only application | cosmetic | closed | ourapps-release 0.2.0 makes it optional; the question is asked only when `updates` is yes or `targets` contains `ios` (the release has no store call and no iOS job without it) and the setting is written only by the `{ref}` effect | - |
| G10.6 | recipe | aepm | an aepm application definition had no field for the answers and `selections` that rule 11 says the design records | needs adapter | closed | aepm accepts `answers` and `selections`; the recipe's evaluator emits them as real fields and every design is checked with `aepm.application.validate_definition` | - |
| G10.7 | recipe | evaluation rules | the written rules left eleven choices that the reference evaluator had to make | needs adapter | closed | component-standard.md rules 13 to 25, which the recipe's evaluator follows; its comments name the rule | - |
| G10.8 | recipe | aepm, application | the format could not say that an application file belongs only when a component is in the design | blocks assembly | closed | aepm artefact `component` condition (rule 25); the application marks 34 artefacts (computer-players 1, guided-tour 3, store-update 9, video-calls 14, web-host 1, windows-desktop 6) by a script from their import and path strings, checked for every answer set by `authoring/check_conditional_artefacts.py` | - |
| G10.9 | application | video-calls | the Windows verification files (`desktop/src/verify.cjs`, `desktop/scripts/package.cjs`, `tests/e2e/verification/windows-package.mjs`) take their result writer from video-calls' `verification/result.mjs`; they are marked windows-desktop, so a design with Windows and without video installs three files that name an excluded component | needs adapter | open | one `component` value cannot say "windows-desktop and video-calls"; the harness belongs in a component of its own or aepm needs a conjunction; only the answer set `clinic` shows it | video-calls |
| G10.10 | recipe | web-host, windows-desktop | the Windows build packs the web client (`windows-desktop`'s `build.cjs` builds the web root), which imports web-host's runtime, but `web-host` is included only when `targets` contains `web`; a Windows-only design has no web project | blocks assembly | open | decision needed on the condition (`web` or `windows`), left as the task fixed it; no answer set is Windows-only | recipe |
| G10.11 | application | translations | `web/src/i18n.ts` imports `./strings.json`, which no artefact of the application writes (translations' generator makes it from `locales/strings.json`; nothing runs the generator here) | needs adapter | deferred | listed as `generated` by the check; the assembler runs the translations step | the assembler |

## Counts

Counted from the status and severity columns above (`tests/recipe.test.ts` checks them).

Total 118 gaps: closed 104, deferred 11, open 3, decision-needed 0.

Deferred and open by severity when found: blocks assembly 2, needs adapter 7, cosmetic 5.

| section | closed | deferred | open | decision-needed |
|---|---|---|---|---|
| 1 | 17 | 0 | 0 | 0 |
| 2 | 8 | 0 | 0 | 0 |
| 3 | 13 | 0 | 0 | 0 |
| 4 | 9 | 0 | 0 | 0 |
| 5 | 18 | 0 | 0 | 0 |
| 6 | 7 | 0 | 0 | 0 |
| 7 | 15 | 4 | 0 | 0 |
| 8 | 10 | 0 | 0 | 0 |
| 9 | 1 | 5 | 0 | 0 |
| 10 | 6 | 2 | 3 | 0 |

## Decisions taken

Made without asking so that a complete recipe exists; each is easy to change (the number is the one in REVIEW.md).

1. **Identity (G5.17).** guest-identity owns names and token rotation. realtime-rooms requires a `guest-identity` port, connected to guest-identity; the application builds one `createIdentityApi()` (parts.ts) and gives it to seating and, as `services.identity`, to realtime-rooms (room.ts).
2. **Computer players (G7.18, G10.2).** A choice `none`, `on-request`, `fill-empty` (default `on-request`), set as `computer-players.mode` and `application.computerPlayers`. `none` leaves out computer-players and poker-strategy; turn-engine 0.3.0 has the requirement optional.
3. **Addresses (G7.8).** Follow-up questions with `askWhen`: `webAddress` (default `http://localhost:5173`, when the web is a target), `videoServiceUrl` (video on), `storeInvitation` (updates on). The web address has one source for four settings. An empty text answer writes nothing (rule 18).
4. **Bundle identifier (G7.9).** `bundleId` text question, default empty; answered, it sets the four identifier settings, empty they keep `app.ourapps.ourpoker`.
5. **Inclusion (G7.12).** Only `includedWhen` (rule 4): `apple-host` for any of ios, macos, tvos; `video-calls` by `video`; `guided-tour` by `lessons`; `store-update` by `updates`; `web-host`, `android-host`, `windows-desktop` by the devices question (id `targets`); `computer-players` and `poker-strategy` unless `computerPlayers` is `none`.
6. **Devices to apple-host (G10.1).** The whole devices answer goes to `apple-host.targets` as `$answer`; apple-host 0.3.0 ignores non-Apple entries.
7. **Server provider and size.** Selection (rule 7) chooses it. The `server` answer is the `overrideQuestion` of the `server` and `realtime` jobs; the scale picks the tier: `cloudflare` at small or medium is free, at large paid; `own-hardware` costs nothing at every band. The `video` job follows the scale only.
8. **References.** `videoKey` and `videoSecret` (video on), `hostingAccount` (server `cloudflare`), `androidSigning` (Android a target), `webDeploy` (web a target) and `storeCredentials` (updates on or `ios` a target) are secretRef questions set only by `{ref}` effects; none is in configuration.
9. **Store credentials guard (G10.5).** Asked when `updates` is yes or the devices include `ios`: ourapps-release has no store call and no iOS job without it. Other Apple targets and Android do not need it.
10. **Application ports.** It provides only `poker-game-adapter` (connected to realtime-rooms' `game`); seven of its twenty requirements are optional, exactly those whose providers can be left out.
11. **One source for numbers.** Players, chips, level length, rebuys and decision time reach every component and the application from one answer each; only the tournament's `startingStack` and `rebuyStack` are set from the chips answer.
12. **Page drawings.** The grouped overview no longer draws the application (with it the image passes the generator's size limit); the application and its neighbours are drawn on their own (`page/diagram-application.svg`, SVG only).
13. **Conditional artefacts (G10.8, rule 25).** A file is marked by the optional components its import and path strings name; a test file also by the application files it imports; several components under one condition (computer-players, poker-strategy) count as one; under different conditions a host component wins, then the first by name. `display-mode` is never marked: the recipe always includes it. Swift and Kotlin files name no component path, so they are not marked (the Apple and Android sources are installed for every design).
14. **Splitting instead of marking whole core files.** Files that mixed optional and required imports were split so that each optional component is imported by one small module (`video.ts`, `update-links.ts`, `computers.ts`, `shell.ts`, `guide-style.ts`, web `video.ts`); `services.ts` and `services.test.ts` became two files each. The core files still import those modules (G10.4).
15. **Windows verification (G10.9).** The three files that need video-calls' verification harness are marked windows-desktop; the violation for Windows without video is recorded, not hidden.
16. **Rules 13 to 25.** The eleven choices the reference evaluator had to make, plus the definition fields and the conditional artefacts, are rules in component-standard.md.

## Final status

- Closed in this pass: G10.1, G10.2, G10.5, G10.6, G10.7, G10.8 (and G4.9 restated).
- Open: G10.4 (core files import optional modules), G10.9 (Windows verification without video), G10.10 (web-host not included for a Windows-only design).
- Deferred: the earlier items (G7.6, G7.15 to G7.17, G9.2 to G9.6), G10.3 (server address after deploy), G10.11 (generated `strings.json`).
- Verified by script only: designs, definitions, conditional artefacts, package packing, component suites, the ourapps tests. Not verified: any build.

## What is not specified or built

- **The assembler.** Nothing here runs a recipe: nothing asks the questions, evaluates the design, resolves components, installs, renders `host-settings.ts`, builds or deploys. `authoring/evaluate_recipe.py` is a reference for tests, written to find holes in the rules; it is not the assembler and is not packaged.
- **Optional modules in the core** (G10.4): the application files that import a module installed only for some designs.
- **The post-deploy step** that learns the server's address (G10.3).
- **Client items** G9.2 to G9.6 and the paper rows G7.15 and G7.16, deferred above.
- **Run and compile checks.** Nothing was assembled by aepm or built. A throwaway copy of the `poker-league` design (files placed by their manifests, outside the repositories) was type-checked with `tsc` for the server and web code and three server unit tests ran against it; the remaining type errors there come from the generated `strings.json`, the platform's `Env` type and a missing `livekit-client` link. The end-to-end specs under `tests/e2e/`, wrangler and vite builds, Swift, Kotlin, Gradle, Xcode and Windows packaging were not run (kotlinc is not installed).
