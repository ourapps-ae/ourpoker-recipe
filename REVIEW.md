# OurPoker: review guide for George

Everything is local and uncommitted; nothing is pushed or published. Paths are from `/Users/george/Projects/com/my`. Python is `PYTHONPATH=aepm /Users/george/.pyenv/versions/3.12.8/bin/python3.12 -B` (written `PY` below). Last full run: 2026-11-09.

## 1. What exists

**39 components** in `components/<name>/` (each: `CONTRACT.md`, `INSTRUCTIONS.md`, `component.json`, `visual/output/connected.svg`, `tests/`):

| component | version | one line |
|---|---|---|
| web-host | 0.3.0 | Installable web application shell |
| apple-host | 0.4.0 | SwiftUI shell for iPhone, iPad, Mac and Apple TV; reads ios, macos, tvos from the device list |
| android-host | 0.3.0 | Android Compose application shell |
| windows-desktop | 0.4.0 | Configured Electron host with local assets and capture/navigation policies |
| server-host | 0.4.0 | Room service hosting on Cloudflare or own hardware; renders `host-settings.ts` |
| ourapps-release | 0.3.0 | Build, sign and publish client targets to ourapps.app; store credentials optional |
| store-update | 0.4.0 | Store update check |
| realtime-rooms | 0.5.0 | Persistent private game rooms and native transports |
| room-directory | 0.3.0 | Room list, live change announcements, join by code |
| guest-identity | 0.4.0 | Guest names, private tokens, rotation, device-side storage |
| presence | 0.3.0 | Present and absent tracking, pause and abandon rules |
| invitations | 0.1.1 | Invitation codes, links, parsing, sharing |
| private-views | 0.3.0 | Per-viewer redaction and client view helpers |
| display-mode | 0.4.0 | Mode publication and display capability restrictions |
| video-calls | 0.4.0 | Signed room grants and browser, Apple and Android media |
| preferences | 0.1.1 | Per-device language, sound, camera and microphone choices |
| turn-engine | 0.4.0 | Lobby, start, round cycle, rebuys, completion; computer players optional |
| game-clock | 0.3.0 | Caller-driven clocks, decision and thinking deadlines, timeouts, client countdowns |
| seating | 0.3.0 | Join, leave, lowest free seat, table checks |
| fair-shuffle | 0.3.0 | Seedable or cryptographic random numbers and shuffles |
| card-deck | 0.3.0 | Create, shuffle, deal, burn cards |
| computer-players | 0.4.0 | One computer player on request, or fill every empty seat |
| chip-ledger | 0.4.0 | Stacks, bets, pots, side pots, odd chips, audit |
| level-schedule | 0.3.0 | Blind level for a clock reading |
| tournament | 0.3.0 | Starting stacks issued through the ledger, rebuys |
| round-history | 0.3.0 | Append rounds, keep the newest N, query and export |
| rules-settings | 0.3.0 | Load and validate a rules file, read rules by path |
| poker-hand-ranking | 0.3.0 | Evaluate, compare and name poker hands |
| poker-odds | 0.3.0 | Hand improvement and winning chances |
| holdem-rules | 0.3.0 | Hold'em rounds for a turn engine |
| poker-strategy | 0.3.0 | Fold, check, call or bet for a computer player |
| theme | 0.3.0 | Design tokens and animated background |
| controls | 0.3.0 | Buttons, toggles, panels, banners, dialogs, help pages |
| table-layout | 0.3.0 | Seat, card, stake positions for 2 to 9 seats |
| card-graphics | 0.3.0 | Card faces, backs, dealing, flipping |
| chip-graphics | 0.3.0 | Chip piles, bets, winnings in motion |
| sound-cues | 0.3.0 | Sound cues for events, mute by preference |
| guided-tour | 0.3.0 | Lessons that ring an element, shown once each |
| translations | 0.4.0 | Languages (en, fr, de, es) for every client |

**Recipe** `recipes/ourpoker/` (package `ourapps-ae/ourpoker` 0.2.0): `recipe.json` (24 questions, 39 components, 65 connections, 3 jobs, 3 scale bands, 9 answer sets plus the default); the application-specific component (screen flow, house rules, text, lessons, art, wiring, end-to-end specs; 265 artefacts, 34 conditional); `page/` drawings; `INSTRUCTIONS.md`; `INTEGRATION-GAPS.md` (118 gaps).

**ourapps** (`ourapps/`): recipe library and component catalogue (`shared/src/catalogue*.ts`, `worker/src/catalogue-db.ts`, `routes/catalogue.ts`, migrations `0019` and `0020` with deprecation, site pages `/recipes` and `/components`), `scripts/validate-recipe-file.ts`. Detail: `ourapps/.opencode/knowledge/recipes.md`.

**aepm** (`aepm/`): installer and verifier (`pack`, `resolve`, `install`, `verify`, `propose-update`, ...) with diagram generator. This effort relied on three features: `optional` requirements, artefact `component` conditions, definition `answers` and `selections`.

**Tools and standards**: `tools/scaffold_component.py`, `tools/check_component.py`, `.opencode/knowledge/component-standard.md` (rules 1 to 25), `papers/agentically-engineered-applications/`. Extraction source, read-only: `OurPoker/`.

## 2. How to inspect

- A component: open `components/<name>/CONTRACT.md`, then `visual/output/connected.svg` and `SOURCE.md` (where each file came from).
- The recipe: `recipes/ourpoker/page/diagram.svg` (all 39), `page/diagram-*.svg` (by group), `page/diagram-application.svg`, `page/description.md`, `recipe.json`.
- One design: `PY recipes/ourpoker/authoring/evaluate_recipe.py [answers.json]` prints the aepm definition for the answers (default answers if none).
- What a design installs: `PY recipes/ourpoker/authoring/check_conditional_artefacts.py -v`.
- Gaps and decisions: `recipes/ourpoker/INTEGRATION-GAPS.md`.
- Catalogue pages: `cd ourapps && npm run build -w site`, then serve `site/dist`.

## 3. How to run every check

```
cd recipes/ourpoker
node --test tests/recipe.test.ts tests/portable.test.ts          # 34 tests
PY tests/evaluate_recipe_test.py                                  # 40 tests
PY tests/conditional_artefacts_test.py                            # 14 tests (includes aepm pack)
PY authoring/check_conditional_artefacts.py                       # 10 answer sets
(cd ../../ourapps && node scripts/validate-recipe-file.ts ../recipes/ourpoker/recipe.json --components ../components)
PY -m aepm pack --store /private/var/folders/yk/8tzc9b_1713dlhdp5vzkgg100000gn/T/opencode/<new folder> .
cd ../.. ; PY tools/check_component.py recipes/ourpoker
PY tools/check_component.py --all                                 # 39 components
(cd components/realtime-rooms && npm test && node tests/request-body.mjs && npm run types && npm run typecheck)
(cd components/video-calls && npm run typecheck && node --test tests/provider.test.mjs)
(cd ourapps && npm run typecheck && npm test && npm run build -w site)
(cd aepm && PY -m unittest discover -s tests)
```

Regenerate: `authoring/make_recipe.py`, `scripts/make_component.py --render`, `scripts/make_source.py`, `authoring/draw_default_design.py` (in that order, from `recipes/ourpoker`).

## 4. Verified and not verified

Verified (2026-11-09):
- Recipe: 34 node tests, 40 evaluator tests, 14 conditional-artefact tests, ourapps validator valid, `aepm pack` ok, `check_component` ok (12 run, 11 passed, 1 skipped: needs `component.json`).
- Every design (default and 9 answer sets) is accepted by aepm's definition validator with `answers` and `selections`.
- Components: `check_component --all` 37 ok, 2 fail only in the checker's clean copy for lack of `node_modules`; run in their folders, realtime-rooms (11 + request bodies + typecheck + 12 migration and interface tests) and video-calls (typecheck, 12 provider, 18 behaviour, 3 Python suites) all pass. The checker counted 661 of 668 tests across all 39; the 7 not counted are 4 realtime-rooms and 2 video-calls tests lost to the missing `node_modules` and 1 server-host test skipped in the clean copy.
- aepm: 406 tests, 1 failure, 8 skipped: `test_execution_context.ExecutionContextTests.test_expiry_after_real_execution_prevents_completion` (authorization expiry; fails when run alone; aepm is not edited here, so it is open for aepm's owner).
- ourapps: typecheck clean; 667 tests pass (115 + 472 + 80); site build ok.
- A throwaway copy of the `poker-league` design type-checked with `tsc` and 3 server unit tests ran; the only type errors left are the generated `strings.json`, the platform `Env` type and a missing `livekit-client` link.

Not verified:
- Android (Kotlin: no kotlinc), Gradle and Xcode builds, Windows packaging, wrangler and vite builds, the end-to-end specs in `tests/e2e/`, real deployments, real video and store services.
- The assembler does not exist: nothing asks the questions, resolves, installs or builds from a recipe.
- Designs without video, updates, lessons, computer players or the web do not compile (G10.4).

## 5. Decisions taken (change by editing the named place)

1. Identity: guest-identity owns names and tokens (`make_recipe.py` connections).
2. Computer players: choice none / on-request / fill-empty, default on-request; `none` leaves out computer-players and poker-strategy (`QUESTIONS`, `WITHOUT_COMPUTERS`).
3. Addresses: three follow-up questions guarded by `askWhen` (`QUESTIONS`).
4. Bundle identifier: empty by default, derived `app.ourapps.ourpoker` (`BUNDLE_ID`).
5. Inclusion only by `includedWhen`; apple-host for ios, macos or tvos (`INCLUDED_WHEN`).
6. The whole devices answer goes to `apple-host.targets`.
7. Server size by scale: cloudflare free up to medium, paid at large; own hardware costs nothing (`JOBS`, `SCALE`).
8. Secrets are references only, set by `{ref}` effects (`QUESTIONS`).
9. Store credentials are asked only when updates are on or iPhone and iPad is a target (`storeCredentials.askWhen`).
10. The application provides one port; seven of its requirements are optional (`scripts/make_component.py`).
11. One answer feeds every copy of a number; the rules file is the source (`CONFIGURATION`).
12. The page overview omits the application; it has its own drawing (`draw_default_design.py`).
13. Artefacts are marked by the optional components their import and path strings name (`conditions_of` in `scripts/make_component.py`); Swift and Kotlin are not marked; display-mode is always included so never marked.
14. Mixed core files were split so each optional component is imported by one small module (server `video.ts`, `update-links.ts`, `computers.ts`; web `video.ts`, `shell.ts`, `guide-style.ts`).
15. Windows verification files are marked windows-desktop, not video-calls.
16. Rules 13 to 25 in component-standard.md fix the evaluator's choices (region and compliance not requested; provider written from the profile id; empty text writes nothing; asked beats unasked).
17. `web/src/geometry.ts` now exports `Point` (a type error the typecheck found).

## 6. Open items

- G10.4 (blocks assembly): 15 imports in 7 core files of modules installed only for some designs. Needs a stand-in condition in aepm, run-time discovery, or one interface per optional part.
- G10.10 (blocks assembly): the Windows build packs the web client, but web-host is included only for the web target. Decide the condition.
- G10.9: Windows verification needs video-calls' harness; Windows without video installs 3 files naming an excluded component (answer set `clinic`).
- Deferred: G10.3 server address after deploy; G10.11 generated `strings.json`; client items G9.2 to G9.6; paper rows G7.15 and G7.16; G7.6 chip colours; G7.17 SVG safety rule.
- Licence wording stays deferred. No commits, pushes or publishing done.
