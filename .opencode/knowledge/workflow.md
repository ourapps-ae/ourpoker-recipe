# Local workflow

Local only: no commits, pushes, remote changes or publishing without George's say-so. Licence wording remains deferred.
Python 3.12 with `-B` (never write bytecode into the repository) and an aepm checkout on `PYTHONPATH`; Node 26.5. Set `OURPOKER_COMPONENTS` to the folder of component checkouts and `OURAPPS` to the ourapps checkout (the defaults are the sibling folders of the workspace this repository sits in).

From the repository root (INSTRUCTIONS.md part 5 has every command):
- Regenerate: `scripts/make_component.py --render`, `scripts/make_source.py`, `authoring/make_recipe.py`, `authoring/draw_default_design.py`.
- Required suite: `node --test tests/portable.test.ts`. Recipe checks: `node --test tests/recipe.test.ts`; `tests/evaluate_recipe_test.py` (aepm's evaluator; needs `npm install --prefix authoring` once for `@bufbuild/cel`); `tests/conditional_artefacts_test.py`; `authoring/check_conditional_artefacts.py -v`; the ourapps validator `node "$OURAPPS/scripts/validate-recipe-file.ts" recipe.json --components "$OURPOKER_COMPONENTS"`.
- Install proof: `authoring/try_install.py [ANSWERS ...]` (packs, signs, reviews, installs, builds, runs). Kotlin stand-ins: `gradle -p authoring/kotlin-stand-ins compileKotlin`.
- Pack check: `python3 -B -m aepm pack --store <new temporary folder> .` (a temporary folder whose path has no symbolic link; aepm refuses links).
Every file listed in `component.json` `files` must exist and every packaged file must be listed; the required suite checks both.
