# ourpoker ownership

Repository: https://github.com/ourapps-ae/ourpoker.git (local only; nothing pushed; branch work/ourapps-ae-components). Package `ourapps-ae/ourpoker` version 0.4.0, kind `recipe`.
Standard: `/Users/george/Projects/com/my/.opencode/knowledge/component-standard.md`. Source (read-only): `OurPoker/recipe/`.

This repository holds two things that are packaged together:
- The recipe: `recipe.json`, `page/`, `INSTRUCTIONS.md`, `INTEGRATION-GAPS.md`, `tests/recipe.test.ts`, `tests/evaluate_recipe_test.py`, `tests/conditional_artefacts_test.py`, `authoring/` (not packaged; `make_recipe.py` writes `recipe.json`; `evaluate_recipe.py` is a reference evaluator of the evaluation rules, used only by tests; `component_imports.py` and `check_conditional_artefacts.py` read and check the `component` marks of the application's artefacts). Owned by the recipe author.
- The application-specific component: `component.json` (generated), `CONTRACT.md`, `SOURCE.md` (generated), `LICENCE`, `suitability.json`, `tools.lock.json`, `interfaces/*.json` and `interfaces/required/*.json` (generated), `examples/`, `visual/`, `implementation/{server,web,apple,android,desktop}`, `rules/`, `locales/`, `assets/` (`ASSETS.json` generated), `tests/portable.test.ts`, `tests/e2e/`, `tests/fixtures/`.

Generated: `component.json`, `interfaces/**`, `assets/ASSETS.json`, `visual/definition.json`, `visual/examples/connected.json`, `visual/output/connected.*` by `scripts/make_component.py --render`; `SOURCE.md` by `scripts/make_source.py`. `scripts/` is not packaged. Never edit the generated files by hand.
Destinations: server `server/src`, web `web/src`, Apple `ios/OurPoker/Sources`, Android `android/app/src/main/java/app/ourapps/ourpoker`, desktop `desktop`. Code imports components as `../../components/<name>/<platform>/...`; those folders exist only in the assembled application. Files containing `{{setting}}` are templates: a string setting must sit inside quotes and no stray `{{` or `}}` may appear.
Do not edit `OurPoker/`, `components/`, `mcinpoker/`, `aepm/`, `ourapps/`. Nothing here runs the recipe.
