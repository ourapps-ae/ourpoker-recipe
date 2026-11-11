# OurPoker: review guide

Nothing is pushed or published. Paths are relative to this repository. `PY` is `python3 -B` (Python 3.12) with an aepm checkout on `PYTHONPATH`; `OURPOKER_COMPONENTS` names a folder with one checkout per component and `OURAPPS` a checkout of the ourapps catalogue (INSTRUCTIONS.md part 5).

## 1. What exists

- `recipe.json` (package `ourapps-ae/ourpoker` 0.4.2): 26 questions, 39 components at exact versions, 65 connections, 3 jobs, 3 scale bands, 13 answer sets plus the default.
- The application-specific component: screen flow on web, Apple and Android, the server's wiring, house rules, text in four languages, lessons, art, sounds, the desktop entry, end-to-end specs, the build files and the stand-ins (`component.json`, 272 artefacts, 50 conditional, 18 stand-ins).
- `page/` drawings, `INSTRUCTIONS.md` (asking, accounts, install, build and run, maintenance), `INTEGRATION-GAPS.md` (status and decisions).
- `authoring/` and `scripts/` (not packaged): the generators, the conditional artefact check, the install proof (`try_install.py`) and the Kotlin stand-in type-check (`kotlin-stand-ins/`).

## 2. How to inspect

- The recipe: `page/diagram.svg` (all 39), `page/diagram-*.svg` (by group), `page/diagram-application.svg`, `page/description.md`, `recipe.json`.
- One design: `PY -m aepm design ourpoker@0.4.2 --store STORE --answers answers.json --out definition.json` on a store that holds the packages (`authoring/try_install.py` makes one).
- What a design installs: `PY authoring/check_conditional_artefacts.py -v`.
- Gaps and decisions: `INTEGRATION-GAPS.md`.

## 3. How to run every check

INSTRUCTIONS.md part 5 lists the commands. The install proof: `PY authoring/try_install.py` (default `default`, `local-web`, `fill-empty-own-hardware`, `lounge-web-ios`; any answer-set id or answers file).

## 4. Verified and not verified

Verified (2026-11-11):
- Recipe tests: `tests/recipe.test.ts` and `tests/portable.test.ts`, `tests/evaluate_recipe_test.py` (aepm's evaluator, with the CEL parity check against `@bufbuild/cel`), `tests/conditional_artefacts_test.py`, `authoring/check_conditional_artefacts.py` (14 answer sets, no violations), the ourapps validator.
- `authoring/try_install.py`: the 39 components and the recipe packed, released, reviewed and guardian-signed with disposable identities, each design installed with `aepm install`; server and web type-checked, server tests passed, the server ran on Node and the web client loaded in headless Chrome, listed the rooms, seated a player and dealt a hand with a computer player or a second person, with the table inside a 1280x800 window; Apple designs built for the iOS and tvOS simulators with only the answered languages; Android projects generated with only the answered languages' strings.
- The Kotlin stand-ins type-check on the JVM against the calls the application makes (`authoring/kotlin-stand-ins`).

Not verified:
- Android builds (no Android SDK where the recipe is maintained), Windows packaging, the browser and native end-to-end specs in `tests/e2e/`, real deployments, real video and store services, `aepm fetch` from the published catalogue (the packages are not published).

## 5. Decisions

`INTEGRATION-GAPS.md` "Decisions"; each names the place to change it (`authoring/make_recipe.py`, `scripts/make_component.py`, `implementation/stand-ins/`).

## 6. Open items

- Deferred: client items G9.2 to G9.6; paper rows G7.15 and G7.16; G7.6 chip colours; G7.17 SVG safety rule.
- Licence wording stays deferred. Nothing pushed or published.
