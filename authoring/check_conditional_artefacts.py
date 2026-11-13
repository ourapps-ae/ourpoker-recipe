#!/usr/bin/env python3
"""Checks the conditional artefacts of the application component against every answer set of recipe.json.

For each answer set it evaluates the design with aepm's evaluator (aepm.recipe), takes the artefacts
aepm would install for that design (aepm.application.installed_artefacts), and reads each installed file, without assembling anything:

  marks       every `component` mark (one name or a list) names components the recipe can leave out (they have an includedWhen)
              and are in the recipe;
  excluded    no installed file names a component path (an import, a require or a path string) of a component the design excludes;
  unresolved  every such path of an installed file is a destination of the artefacts of the component it names (that component's
              own manifest), allowing the extension or index file a bundler adds; paths into `node_modules` and paths built at run
              time (`${...}`) are checked only as far as the part before the `${`;
  generated   a relative import of an installed file that no artefact of the application component provides (a file another
              component's step writes: web/src/strings.json from translations); listed, not judged;
  seams       every relative import of an installed file (`./x`, `../x`) is the destination of another installed artefact of the
              application component. A file that is installed for every design but imports one installed only for some designs
              cannot compile for the others: these are the seams the manifest alone cannot close (see INTEGRATION-GAPS.md, G10.4).

Exit status 0 when marks, excluded and unresolved are empty for every answer set; `seams` are listed and counted but do not
change the status (tests/conditional_artefacts_test.py states the expected list). Nothing here resolves, installs or runs
components. Usage: PYTHONPATH=<aepm checkout> python3.12 -B authoring/check_conditional_artefacts.py [-v]
"""
import sys
from pathlib import Path

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT.parent.parent / "aepm"))

import component_imports  # noqa: E402
from aepm import recipe as E  # noqa: E402
import recipe_world  # noqa: E402
import make_recipe  # noqa: E402
from aepm import application  # noqa: E402


def destinations(world, component_id: str) -> set[str]:
    """What a component installs, relative to its folder `components/<name>/` (its manifest's artefact destinations)."""
    prefix = f"components/{world.recipe_names[component_id].split('/')[1]}/"
    return {a["destination"][len(prefix):] for a in world.manifests[component_id]["artefacts"] if a["destination"].startswith(prefix)}


def check_design(world, design) -> dict:
    """Findings for one design: lists of strings under marks, excluded, unresolved, seams."""
    manifest = world.manifests[E.APPLICATION]
    names = {c["name"]: c["id"] for c in design["components"]}
    present = {design["recipe"]["name"], *names}
    ids = set(names.values())
    conditional = {c["id"] for c in world.recipe["components"] if c.get("includedWhen") is not None}
    recipe_names = {c["name"] for c in world.recipe["components"]}
    found = {"marks": [], "excluded": [], "unresolved": [], "seams": [], "generated": []}

    for artefact in manifest["artefacts"]:
        for name in ([artefact["component"]] if isinstance(artefact.get("component"), str) else artefact.get("component", [])):
            if name not in recipe_names or name.split("/")[1] not in conditional:
                found["marks"].append(f"{artefact['source']}: {name} is not a component the recipe can leave out")

    installed = application.installed_artefacts(manifest, present)
    installed_destinations = {a["destination"] for a in installed}
    all_destinations = {a["destination"] for a in manifest["artefacts"]}
    for artefact in installed:
        source = ROOT / artefact["source"]
        for component, rest in sorted(set(component_imports.references(source)) | set(component_imports.repository_references(source))):
            if component not in ids:
                found["excluded"].append(f"{artefact['source']}: {component}/{rest}")
            elif "node_modules/" not in rest and not component_imports.resolves(rest, destinations(world, component)):
                found["unresolved"].append(f"{artefact['source']}: {component}/{rest}")
        for specifier in component_imports.relative_imports(source):
            if component_imports.relative_match(artefact["destination"], specifier, installed_destinations):
                continue
            kind = "seams" if component_imports.relative_match(artefact["destination"], specifier, all_destinations) else "generated"
            found[kind].append(f"{artefact['source']}: {specifier}")
    return found


def load_world():
    world = recipe_world.world()
    world.recipe_names = {c["id"]: c["name"] for c in world.recipe["components"]}
    return world


def answer_sets(world) -> dict:
    return {"default": world.recipe["tests"]["defaultAnswers"], **{s["id"]: s["answers"] for s in world.recipe["tests"]["answerSets"]}}


def run(world=None):
    world = world or load_world()
    results = {}
    for name, answers in answer_sets(world).items():
        result = E.evaluate(world, answers)
        if not result["ok"]:
            raise SystemExit(f"{name}: the evaluator refused the answers: {result['errors']}")
        design = result["design"]
        found = check_design(world, design)
        present = {design["recipe"]["name"], *(c["name"] for c in design["components"])}
        found["installed"] = len(application.installed_artefacts(world.manifests[E.APPLICATION], present))
        found["total"] = len(world.manifests[E.APPLICATION]["artefacts"])
        results[name] = found
    return results


def main(argv) -> int:
    results = run()
    bad = 0
    for name, found in results.items():
        failing = len(found["marks"]) + len(found["excluded"]) + len(found["unresolved"])
        bad += failing
        print(f"{name}: installed {found['installed']} of {found['total']} artefacts; marks {len(found['marks'])}, excluded {len(found['excluded'])}, "
              f"unresolved {len(found['unresolved'])}, seams {len(found['seams'])}, generated {len(found['generated'])}")
        for kind in ("marks", "excluded", "unresolved"):
            for line in found[kind]:
                print(f"  {kind}: {line}")
        if "-v" in argv:
            for kind in ("seams", "generated"):
                for line in found[kind]:
                    print(f"  {kind[:-1] if kind == 'seams' else kind}: {line}")
    print(f"{len(results)} answer sets; {'no violations' if not bad else str(bad) + ' violations'}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
