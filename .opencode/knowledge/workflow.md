# Local workflow

Local only: no commits, pushes, remote changes or publishing without George's say-so. Licence wording remains deferred.
Always `PYTHONPATH=/Users/george/Projects/com/my/aepm /Users/george/.pyenv/versions/3.12.8/bin/python3.12 -B`; never write bytecode into the repository.

From the package root:
- Regenerate: `... scripts/make_component.py --render` then `... scripts/make_source.py`.
- Required suite: `node --test tests/portable.test.ts`. Recipe checks: `node --test tests/recipe.test.ts`; `... tests/evaluate_recipe_test.py`; `... tests/conditional_artefacts_test.py`; `... authoring/check_conditional_artefacts.py -v`; the ourapps validator: `cd ../../ourapps && node scripts/validate-recipe-file.ts ../recipes/ourpoker/recipe.json --components ../components`. `tests/recipe.test.ts` imports the ourapps validator from `../../ourapps`, or from `OURAPPS` when set. `evaluate_recipe_test.py` needs `npm install --prefix authoring` once (`@bufbuild/cel` for the condition parity test; `authoring/` is not packaged).
- Recipe: `... authoring/make_recipe.py` (after `make_component.py`), then `... authoring/draw_default_design.py`.
- Pack check (temporary store): `... -m aepm pack --store /private/var/folders/yk/8tzc9b_1713dlhdp5vzkgg100000gn/T/opencode/<new folder> .`.
- Syntax only for code that imports assembled paths: `swiftc -parse` on the Swift files; for TypeScript `node -e "require('module').stripTypeScriptTypes(require('fs').readFileSync(FILE,'utf8'))"` (`node --check` does not check TypeScript); `node --check` for `.mjs` and `.cjs`. Kotlin cannot be checked here (no kotlinc).
Every file listed in `component.json` `files` must exist and every packaged file must be listed; the required suite checks both.
