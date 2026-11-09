"""Tests for the conditional artefacts of the application component (`component` marks in component.json).

They use aepm's own artefact selection (`aepm.application.installed_artefacts`) and its manifest validation, and the checks of
authoring/check_conditional_artefacts.py, for every answer set of recipe.json. Nothing here assembles components.

Run: PYTHONPATH=/Users/george/Projects/com/my/aepm /Users/george/.pyenv/versions/3.12.8/bin/python3.12 -B tests/conditional_artefacts_test.py
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AEPM = ROOT.parent.parent / "aepm"
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / "authoring"))
sys.path.insert(0, str(AEPM))

import check_conditional_artefacts as C  # noqa: E402
import component_imports  # noqa: E402
import evaluate_recipe as E  # noqa: E402
from aepm import application, model  # noqa: E402
from aepm.io import load  # noqa: E402

WORLD = C.load_world()
MANIFEST = WORLD.manifests[E.APPLICATION]
RESULTS = C.run(WORLD)

# Marks, derived from the import and path strings of each source file (tests also from the application files they import).
EXPECTED_MARKS = {"computer-players": 1, "guided-tour": 3, "store-update": 9, "video-calls": 14, "web-host": 1, "windows-desktop": 6}

# Windows verification (the desktop verify and package scripts, windows-package.mjs) needs the verification harness that
# video-calls ships, so a design with Windows and without video installs three files that name an excluded component.
KNOWN_EXCLUDED = {"clinic": {
    "implementation/desktop/scripts/package.cjs: video-calls/verification/result.mjs",
    "implementation/desktop/src/verify.cjs: video-calls/verification/result.mjs",
    "tests/e2e/verification/windows-package.mjs: video-calls/verification/result.mjs",
}}

# Core files that import a module installed only for some designs: the seams the manifest cannot close (INTEGRATION-GAPS.md, G10.4).
KNOWN_SEAMS = {
    "implementation/server/src/index.ts": {"./update-links", "./video"},
    "implementation/server/src/parts.ts": {"./computers"},
    "implementation/server/src/room.ts": {"./update-links", "./video"},
    "implementation/web/src/main.ts": {"./guide", "./guide-style", "./shell", "./update", "./video"},
    "implementation/web/src/screens.ts": {"./guide", "./video"},
    "implementation/web/src/store.ts": {"./guide"},
    "implementation/web/src/table.ts": {"./guide", "./video"},
}


def names_in(design):
    return {design["recipe"]["name"], *(c["name"] for c in design["components"])}


class Marks(unittest.TestCase):
    def test_marks_name_components_the_recipe_can_leave_out(self):
        for name, found in RESULTS.items():
            self.assertEqual(found["marks"], [], name)

    def test_every_source_that_names_an_optional_component_is_marked(self):
        optional = {c["id"] for c in WORLD.recipe["components"] if c.get("includedWhen") is not None}
        self.assertEqual(optional, {"web-host", "apple-host", "android-host", "windows-desktop", "guided-tour", "video-calls", "store-update", "computer-players", "poker-strategy"})
        for artefact in MANIFEST["artefacts"]:
            reached = {c for c, _ in component_imports.references(ROOT / artefact["source"]) if c in optional}
            if reached:
                self.assertIn("component", artefact, artefact["source"])
                mark = artefact["component"].split("/")[1]
                self.assertTrue(mark in reached or artefact["source"].startswith("tests/"), f"{artefact['source']}: {mark} not in {reached}")

    def test_the_count_of_marked_artefacts_per_component(self):
        marked = {}
        for artefact in MANIFEST["artefacts"]:
            if "component" in artefact:
                marked[artefact["component"].split("/")[1]] = marked.get(artefact["component"].split("/")[1], 0) + 1
        self.assertEqual(marked, EXPECTED_MARKS)

    def test_a_package_with_these_marks_is_a_valid_component_to_aepm(self):
        model.validate_component(load(ROOT / "component.json"))
        self.assertEqual(sum(1 for a in MANIFEST["artefacts"] if "component" in a), sum(EXPECTED_MARKS.values()))

    def test_aepm_refuses_a_mark_naming_the_component_itself(self):
        broken = json.loads((ROOT / "component.json").read_text())
        next(a for a in broken["artefacts"] if "component" in a)["component"] = broken["identity"]["name"]
        with self.assertRaises(Exception):
            model.validate_component(broken)


class Installed(unittest.TestCase):
    def test_aepm_installs_the_unmarked_artefacts_and_those_of_included_components(self):
        for name, answers in C.answer_sets(WORLD).items():
            with self.subTest(name):
                design = E.evaluate(WORLD, answers)["design"]
                present = names_in(design)
                installed = application.installed_artefacts(MANIFEST, present)
                expected = [a for a in MANIFEST["artefacts"] if "component" not in a or a["component"] in present]
                self.assertEqual(installed, expected)
                self.assertEqual(RESULTS[name]["installed"], len(expected))
                for artefact in MANIFEST["artefacts"]:
                    if "component" in artefact:
                        self.assertEqual(artefact in installed, artefact["component"] in present)

    def test_every_included_conditional_component_brings_its_files_and_every_excluded_one_takes_them_away(self):
        everything = application.installed_artefacts(MANIFEST, names_in(E.evaluate(WORLD, C.answer_sets(WORLD)["poker-league"])["design"]))
        self.assertEqual(len(everything), len(MANIFEST["artefacts"]), "poker-league includes every conditional component")
        none = application.installed_artefacts(MANIFEST, {"ourapps-ae/ourpoker"})
        self.assertEqual(len(none), len(MANIFEST["artefacts"]) - sum(EXPECTED_MARKS.values()))

    def test_no_installed_file_names_an_excluded_component_apart_from_the_known_windows_verification_files(self):
        for name, found in RESULTS.items():
            self.assertEqual(set(found["excluded"]), KNOWN_EXCLUDED.get(name, set()), name)

    def test_every_component_path_of_an_installed_file_is_an_artefact_destination_of_an_included_component(self):
        for name, found in RESULTS.items():
            self.assertEqual(found["unresolved"], [], name)

    def test_the_seams_are_the_known_ones(self):
        seams = {}
        for found in RESULTS.values():
            for line in found["seams"]:
                source, specifier = line.split(": ")
                seams.setdefault(source, set()).add(specifier)
        self.assertEqual(seams, KNOWN_SEAMS)
        generated = {line for found in RESULTS.values() for line in found["generated"]}
        self.assertEqual(generated, {"implementation/web/src/i18n.ts: ./strings.json"})


class Checker(unittest.TestCase):
    """The check finds what it is meant to find: a file reaching a component the design leaves out, and an unresolvable path."""

    def design(self, name="book-club"):
        return E.evaluate(WORLD, C.answer_sets(WORLD)[name])["design"]

    def test_an_unmarked_file_that_reaches_an_excluded_component_is_found(self):
        import copy
        world = C.load_world()
        manifest = copy.deepcopy(world.manifests[E.APPLICATION])
        for artefact in manifest["artefacts"]:
            if artefact["source"] == "implementation/web/src/video.ts":
                del artefact["component"]
        world.manifests[E.APPLICATION] = manifest
        found = C.check_design(world, self.design())
        self.assertIn("implementation/web/src/video.ts: video-calls/web/video", found["excluded"])

    def test_a_path_that_is_not_an_artefact_of_the_component_is_found(self):
        self.assertTrue(component_imports.resolves("web/video", {"web/video.ts"}))
        self.assertTrue(component_imports.resolves("web/tour.css", {"web/tour.css"}))
        self.assertTrue(component_imports.resolves("web", {"web/video.ts"}))
        self.assertTrue(component_imports.resolves("web/x", {"web/x/index.ts"}))
        self.assertTrue(component_imports.resolves("desktop/src/*", {"desktop/src/main.cjs"}))
        self.assertFalse(component_imports.resolves("web/missing", {"web/video.ts"}))

    def test_comments_are_not_references(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "a.ts"
            path.write_text('// "../../components/video-calls/web/video"\nimport x from "../../components/theme/web/theme.css"; // see "components/video-calls/x" here\n')
            self.assertEqual(component_imports.references(path), [("theme", "web/theme.css")])


class Pack(unittest.TestCase):
    def test_the_package_packs_with_aepm(self):
        base = Path(os.path.realpath(tempfile.gettempdir()))
        with tempfile.TemporaryDirectory(dir=base) as store:
            env = {**os.environ, "PYTHONPATH": str(AEPM), "PYTHONDONTWRITEBYTECODE": "1"}
            run = subprocess.run([sys.executable, "-B", "-m", "aepm", "pack", "--store", store, str(ROOT)], capture_output=True, text=True, env=env, timeout=300)
            self.assertEqual(run.returncode, 0, run.stdout + run.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=1)
