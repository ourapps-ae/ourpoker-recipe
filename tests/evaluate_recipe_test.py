"""Tests of this recipe under aepm's evaluator (aepm.recipe), which implements the recipe evaluation rules.

They check the evaluator against what the rules say, for each answer set in recipe.json, for every answer that changes which
components are included or which hosts are selected, and for each error code. The point is to show the written rules are
complete: nothing here assembles, installs or runs an application.

Run from the repository root with aepm on PYTHONPATH: python3 -B tests/evaluate_recipe_test.py
"""
import copy
import itertools
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / "authoring"))
sys.path.insert(0, str(ROOT.parent.parent / "aepm"))

import draw_design  # noqa: E402
from aepm import recipe as E  # noqa: E402
import recipe_world  # noqa: E402
from aepm import application as aepm_application  # noqa: E402
from aepm.diagram import generate as diagram  # noqa: E402

WORLD = recipe_world.world()
RECIPE = WORLD.recipe
SETS = {s["id"]: s["answers"] for s in RECIPE["tests"]["answerSets"]}
SETS = {"default": RECIPE["tests"]["defaultAnswers"], **SETS}
INVITATION = "https://ourapps.app/l/0123456789abcdef01234567"
KEY, SECRET, STORE = {"secretRef": "ourpoker/video-key"}, {"secretRef": "ourpoker/video-secret"}, {"secretRef": "ourpoker/store-credentials"}
ANDROID, WEB_DEPLOY = {"secretRef": "ourpoker/android-signing"}, {"secretRef": "ourpoker/web-deploy"}
# The default answers with builds published: every signing and deployment reference is asked.
PUBLISHED = {**SETS["default"], "publish": True, "videoKey": "ourpoker/video-key", "videoSecret": "ourpoker/video-secret",
             "storeCredentials": "ourpoker/store-credentials", "androidSigning": "ourpoker/android-signing", "webDeploy": "ourpoker/web-deploy"}

CONDITIONAL = {"web-host", "apple-host", "android-host", "windows-desktop", "guided-tour", "video-calls", "store-update"}
# turn-engine's computer-players requirement is optional (0.3.0), so computer-players and poker-strategy follow the answer.
assert any(p["type"] == "ae/computer-players" and p.get("optional") for p in WORLD.manifests["turn-engine"]["requires"])


def evaluated(answers, world=WORLD):
    result = E.evaluate(world, answers)
    assert result["ok"], result
    return result["design"]


def settings_of(design):
    out = {c["id"]: c["configuration"] for c in design["components"]}
    out["application"] = design["configuration"]
    return out


def ids_of(design):
    return {c["id"] for c in design["components"]}


def codes(result):
    assert not result["ok"], "expected an error"
    return {(e["code"], e["path"]) for e in result["errors"]}


# What each answer set must give, from the rules: which conditional components are out, the settings the answers (and the
# fixed configuration, and the selected host) decide, and the selections.
EXPECTED = {
    "default": dict(
        out={"store-update"},
        settings={
            "web-host": {"webAddress": "http://localhost:5173"},
            "apple-host": {"targets": "web ios android macos windows tvos", "bundleIdentifier": "app.ourapps.ourpoker"},
            "android-host": {"packageId": "app.ourapps.ourpoker"},
            # not published: no signing or deployment reference
            "ourapps-release": {"targets": "web ios android macos windows tvos", "storeCredentials": None, "androidSigning": None, "webDeploy": None, "bundleIdentifier": "app.ourapps.ourpoker"},
            "server-host": {"provider": "cloudflare-free", "accountReference": "ourpoker-cloudflare-account", "allowedOrigins": "http://localhost:5173", "roomPrefix": "ourpoker-"},
            "video-calls": {"keyReference": None, "secretReference": None},
            "theme": {"themeName": "night"}, "card-graphics": {"backStyle": "stripes"}, "translations": {"languages": "en fr de es"},
            "seating": {"maximumPlayers": 9}, "holdem-rules": {"seats": 9}, "chip-ledger": {"seats": 9}, "room-directory": {"roomCapacity": 9},
            "tournament": {"startingStack": 5000, "rebuyStack": 5000, "rebuysPerPlayer": 1}, "level-schedule": {"levelSeconds": 600},
            "game-clock": {"decisionSeconds": 30}, "turn-engine": {"decisionSeconds": 30}, "computer-players": {"mode": "on-request"},
            "invitations": {"inviteAddress": "http://localhost:5173"},
            "application": {"webAddress": "http://localhost:5173", "packageId": "app.ourapps.ourpoker", "updatesEnabled": False, "computerPlayers": "on-request", "maximumPlayers": 9},
        },
        selections={"server": "cloudflare-free", "realtime": "free", "video": "free"}),
    "book-club": dict(
        out={"web-host", "windows-desktop", "store-update", "video-calls"},
        settings={
            "apple-host": {"targets": "ios android tvos"}, "ourapps-release": {"targets": "ios android tvos", "androidSigning": ANDROID, "storeCredentials": STORE},
            "translations": {"languages": "en fr"}, "tournament": {"startingStack": 3000, "rebuyStack": 3000},
            "server-host": {"provider": "cloudflare-free", "accountReference": "ourpoker-cloudflare-account"},
        },
        selections={"server": "cloudflare-free", "realtime": "free"}),
    "poker-league": dict(
        out=set(),
        settings={
            "store-update": {"inviteAddress": INVITATION, "enabled": True}, "application": {"updatesEnabled": True, "inviteAddress": INVITATION, "webAddress": "https://poker.acme.io"},
            "web-host": {"webAddress": "https://poker.acme.io"}, "server-host": {"allowedOrigins": "https://poker.acme.io", "provider": "cloudflare-free"},
            "invitations": {"inviteAddress": "https://poker.acme.io"},
        },
        selections={"server": "cloudflare-free", "realtime": "free", "video": "free"}),
    "company-event": dict(
        out=set(),
        settings={"server-host": {"provider": "own-hardware", "accountReference": "none"}, "store-update": {"inviteAddress": INVITATION}},
        selections={"server": "own-hardware", "realtime": "own-hardware", "video": "paid"}),
    "company-event-hosted": dict(
        out=set(),
        settings={"server-host": {"provider": "cloudflare-paid", "accountReference": "ourpoker-cloudflare-account"}},
        selections={"server": "cloudflare-paid", "realtime": "paid", "video": "paid"}),
    "tv-only": dict(
        out={"web-host", "android-host", "windows-desktop", "store-update", "video-calls", "guided-tour"},
        settings={"apple-host": {"targets": "tvos"}, "ourapps-release": {"targets": "tvos"}, "translations": {"languages": "en"}},
        selections={"server": "cloudflare-free", "realtime": "free"}),
    "browser-only-no-extras": dict(
        out={"apple-host", "android-host", "windows-desktop", "store-update", "video-calls", "guided-tour"},
        settings={"ourapps-release": {"targets": "web", "webDeploy": None}, "tournament": {"rebuysPerPlayer": 0}, "application": {"computerPlayers": "none", "rebuysPerPlayer": 0}},
        selections={"server": "cloudflare-free", "realtime": "free"}),
    "large-paid-host": dict(
        out={"store-update"},
        settings={
            "theme": {"themeName": "lounge"}, "card-graphics": {"backStyle": "plain"}, "seating": {"maximumPlayers": 6}, "chip-ledger": {"seats": 6}, "holdem-rules": {"seats": 6},
            "tournament": {"rebuysPerPlayer": 3}, "computer-players": {"mode": "fill-empty"}, "video-calls": {"serviceUrl": "https://video.acme.io"},
            "apple-host": {"bundleIdentifier": "io.acme.poker"}, "android-host": {"packageId": "io.acme.poker"}, "ourapps-release": {"bundleIdentifier": "io.acme.poker"},
            "application": {"packageId": "io.acme.poker", "maximumPlayers": 6, "computerPlayers": "fill-empty"},
            "server-host": {"provider": "cloudflare-paid"},
        },
        selections={"server": "cloudflare-paid", "realtime": "paid", "video": "paid"}),
    "clinic": dict(
        out={"apple-host", "android-host", "store-update", "video-calls", "guided-tour"},
        settings={
            "web-host": {"webAddress": "https://clinic.example"}, "server-host": {"provider": "own-hardware", "accountReference": "none", "allowedOrigins": "https://clinic.example"},
            "translations": {"languages": "en es"}, "ourapps-release": {"targets": "web windows", "webDeploy": None},
        },
        selections={"server": "own-hardware", "realtime": "own-hardware"}),
    "no-computers": dict(
        out={"apple-host", "windows-desktop", "store-update"},
        settings={"application": {"computerPlayers": "none"}, "ourapps-release": {"targets": "web android", "androidSigning": None, "webDeploy": None}},
        selections={"server": "cloudflare-free", "realtime": "free", "video": "free"}),
}
# The dry run's answers: nothing but devices, size, language, video and server; no reference is asked.
EXPECTED["local-web"] = dict(
    out={"apple-host", "android-host", "windows-desktop", "store-update", "video-calls"},
    settings={"server-host": {"provider": "own-hardware", "accountReference": "none"}, "translations": {"languages": "en"},
              "ourapps-release": {"targets": "web", "webDeploy": None, "storeCredentials": None},
              "application": {"inviteAddress": "http://localhost:5173", "serverAddress": "http://localhost:8788"}},
    selections={"server": "own-hardware", "realtime": "own-hardware"})
EXPECTED["web-own-hardware"] = dict(
    out={"apple-host", "android-host", "windows-desktop", "store-update", "video-calls", "guided-tour"},
    settings={"server-host": {"provider": "own-hardware", "accountReference": "none"}, "translations": {"languages": "en fr"},
              "application": {"computerPlayers": "none", "serverAddress": "http://localhost:8788"}, "ourapps-release": {"targets": "web", "webDeploy": None}},
    selections={"server": "own-hardware", "realtime": "own-hardware"})
# Phones and television with video and updates but no lessons: guided-tour's native files are replaced by stand-ins.
EXPECTED["native-no-lessons"] = dict(
    out={"web-host", "windows-desktop", "guided-tour"},
    settings={"apple-host": {"targets": "ios android tvos"}, "translations": {"languages": "en fr"}, "application": {"languages": "en fr", "updatesEnabled": True},
              "store-update": {"inviteAddress": INVITATION}},
    selections={"server": "cloudflare-free", "realtime": "free", "video": "free"})
# Windows alone keeps the web project (web-host), which the Windows build packs; the deployed server address is an answer.
EXPECTED["windows-only"] = dict(
    out={"apple-host", "android-host", "store-update", "video-calls"},
    settings={"web-host": {"webAddress": "http://localhost:5173"}, "server-host": {"provider": "own-hardware"}, "ourapps-release": {"targets": "windows"},
              "application": {"serverAddress": "https://poker.clinic.example"}},
    selections={"server": "own-hardware", "realtime": "own-hardware"})
for name in ("browser-only-no-extras", "no-computers", "web-own-hardware"):
    EXPECTED[name]["out"] |= {"computer-players", "poker-strategy"}


def required_but_unconnected(design):
    """Every non-optional requirement of every included instance, from the manifests, against the design's connections."""
    connected = {(c["target"]["instance"], c["target"]["port"]): 0 for c in design["design"]["connections"]}
    for c in design["design"]["connections"]:
        connected[(c["target"]["instance"], c["target"]["port"])] += 1
    present = ["application"] + [c["id"] for c in design["components"]]
    missing = []
    for instance in present:
        for port in WORLD.manifests[instance]["requires"]:
            if not port.get("optional") and connected.get((instance, port["id"])) != 1:
                missing.append(f"{instance}.{port['id']}")
    return missing


class AnswerSets(unittest.TestCase):
    def test_the_expected_table_covers_every_answer_set(self):
        self.assertEqual(sorted(EXPECTED), sorted(SETS))
        self.assertGreaterEqual(len(RECIPE["tests"]["answerSets"]), 9)

    def test_each_answer_set_gives_the_design_the_rules_say(self):
        for name, answers in SETS.items():
            with self.subTest(name):
                design = evaluated(answers)
                want = EXPECTED[name]
                every = {c["id"] for c in RECIPE["components"]}
                self.assertEqual(ids_of(design), every - want["out"], "included components")
                self.assertTrue(want["out"] <= CONDITIONAL | {"computer-players", "poker-strategy"})
                settings = settings_of(design)
                for instance, values in want["settings"].items():
                    for setting, value in values.items():
                        self.assertEqual(settings[instance].get(setting), value, f"{instance}.{setting}")
                self.assertEqual({k: v["profile"] for k, v in design["selections"].items()}, want["selections"])
                for job, selection in design["selections"].items():
                    self.assertTrue(selection["reason"] and selection["component"].startswith("ourapps-ae/"), job)

    def test_unasked_references_stay_unset_and_defaults_apply(self):
        book = settings_of(evaluated(SETS["book-club"]))
        self.assertNotIn("webDeploy", book["ourapps-release"], "web is not a target: webDeploy is not asked")
        self.assertNotIn("keyReference", book.get("video-calls", {}))
        own = settings_of(evaluated(SETS["company-event"]))
        self.assertEqual(own["server-host"]["accountReference"], "none", "own hardware: the account reference keeps its default")
        self.assertNotIn("hostingAccount", evaluated(SETS["company-event"])["answers"])

    def test_every_setting_exists_with_the_right_type_and_every_required_one_has_a_value(self):
        for name, answers in SETS.items():
            with self.subTest(name):
                design = evaluated(answers)
                for component in design["components"]:
                    manifest = WORLD.manifests[component["id"]]
                    declared = {s["id"] for s in manifest["collect"]}
                    self.assertLessEqual(set(component["configuration"]), declared, component["id"])
                    # aepm's own check: grammar, type, secret shape, required settings, address host and port
                    effective = aepm_application.configuration(manifest["collect"], component["configuration"])
                    self.assertEqual(effective, component["configuration"], component["id"])
                own = aepm_application.configuration(WORLD.manifests["application"]["collect"], design["configuration"])
                self.assertEqual(own, design["configuration"])

    def test_no_secret_value_and_no_null_anywhere_in_the_design(self):
        text = json.dumps(evaluated(SETS["default"]))
        self.assertNotIn("null", text)
        for component in evaluated(SETS["default"])["components"]:
            for setting in WORLD.manifests[component["id"]]["collect"]:
                if setting["secret"] and setting["id"] in component["configuration"]:
                    self.assertEqual(list(component["configuration"][setting["id"]]), ["secretRef"])

    def test_every_non_optional_requirement_is_connected_once(self):
        for name, answers in SETS.items():
            with self.subTest(name):
                self.assertEqual(required_but_unconnected(evaluated(answers)), [])

    def test_connections_only_join_included_instances(self):
        for name, answers in SETS.items():
            with self.subTest(name):
                design = evaluated(answers)
                present = {"application"} | ids_of(design)
                for c in design["design"]["connections"]:
                    self.assertIn(c["source"]["instance"], present)
                    self.assertIn(c["target"]["instance"], present)
                recipe_count = sum(1 for c in RECIPE["connections"] if c["source"]["instance"] in present and c["target"]["instance"] in present)
                self.assertEqual(len(design["design"]["connections"]), recipe_count)

    def test_output_bytes_are_identical_across_evaluations(self):
        for name, answers in SETS.items():
            with self.subTest(name):
                first = E.to_json(E.evaluate(WORLD, answers))
                second = E.to_json(E.evaluate(recipe_world.world(), copy.deepcopy(answers)))
                self.assertEqual(first, second)
                shuffled = dict(reversed(list(answers.items())))
                self.assertEqual(first, E.to_json(E.evaluate(WORLD, shuffled)), "answer order does not matter")
                self.assertEqual(first, E.to_json(json.loads(first)), "canonical form is stable")

    def test_the_design_is_an_aepm_definition_with_answers_and_selections(self):
        """aepm's own validation (the one `resolve`, `install` and `update` run on a definition file) accepts every design as emitted."""
        for name, answers in SETS.items():
            with self.subTest(name):
                design = evaluated(answers)
                self.assertEqual(design["recipe"], {"name": RECIPE["name"], "version": RECIPE["version"]})
                self.assertEqual(set(design["answers"]) - {q["id"] for q in RECIPE["questions"]}, set())
                self.assertTrue(design["answers"] and design["selections"])
                validated = aepm_application.validate_definition(json.loads(E.to_json(design)))
                self.assertEqual(validated, design)
                self.assertIn("answers", validated)
                self.assertIn("selections", validated)

    def test_aepm_refuses_a_definition_whose_answers_or_selections_are_not_maps(self):
        design = evaluated(SETS["default"])
        for field in ("answers", "selections"):
            with self.subTest(field), self.assertRaises(Exception):
                aepm_application.validate_definition({**design, field: ["not", "a", "map"]})
        with self.assertRaises(Exception):
            aepm_application.validate_definition({**design, "unknown": 1})

    def test_the_recorded_answers_are_the_asked_ones(self):
        design = evaluated(SETS["book-club"])
        self.assertEqual(design["answers"]["targets"], ["ios", "android", "tvos"], "option order")
        self.assertNotIn("webDeploy", design["answers"], "web is not a target: not asked")
        self.assertNotIn("videoKey", design["answers"], "video is off: not asked")
        self.assertEqual(design["selections"]["server"]["profile"], "cloudflare-free")

    def test_validate_design_accepts_every_drawing(self):
        for name, answers in SETS.items():
            with self.subTest(name):
                drawing = draw_design.drawing(evaluated(answers))
                diagram.validate_design(copy.deepcopy(drawing))

    def test_one_source_for_numbers_the_rules_file_states(self):
        rules = json.loads((ROOT / "rules" / "texas-holdem-house-rules.json").read_text())
        for name, answers in SETS.items():
            with self.subTest(name):
                s = settings_of(evaluated(answers))
                players, chips = answers.get("players", 9), answers.get("startingChips", 5000)
                for target in (s["seating"]["maximumPlayers"], s["holdem-rules"]["seats"], s["chip-ledger"]["seats"], s["room-directory"]["roomCapacity"], s["application"]["maximumPlayers"]):
                    self.assertEqual(target, players)
                self.assertEqual([s["tournament"]["startingStack"], s["tournament"]["rebuyStack"], s["application"]["startingStack"]], [chips] * 3)
                self.assertEqual(s["chip-ledger"]["startingStack"], 5000, "the ledger's own startingStack is not set: the tournament issues the chips")
                self.assertEqual(s["application"]["levelSeconds"], s["level-schedule"]["levelSeconds"])
                self.assertEqual(s["application"]["decisionSeconds"], s["game-clock"]["decisionSeconds"])
        default = settings_of(evaluated(SETS["default"]))
        self.assertEqual([default["seating"]["maximumPlayers"], default["tournament"]["startingStack"], default["level-schedule"]["levelSeconds"]],
                         [rules["players"]["maximum"], rules["chips"]["starting_stack"], rules["blinds"]["level_duration_seconds"]])


def all_answers():
    """Every combination of the answers that decide inclusion, asking and selection (the rest cannot change the connections)."""
    refs = {"videoKey": "ourpoker/video-key", "videoSecret": "ourpoker/video-secret", "hostingAccount": "ourpoker-cloudflare-account",
            "storeCredentials": "ourpoker/store-credentials", "androidSigning": "ourpoker/android-signing", "webDeploy": "ourpoker/web-deploy"}
    options = RECIPE["questions"][0]["options"]
    for size in range(1, len(options) + 1):  # no devices at all is an invalid answer (test_invalid_answers)
        for targets in itertools.combinations(options, size):
            for video, lessons, updates, publish, computers, server, scale in itertools.product((True, False), (True, False), (True, False), (True, False), ("none", "on-request", "fill-empty"), ("cloudflare", "own-hardware"), ("small", "medium", "large")):
                yield {**refs, "targets": list(targets), "video": video, "lessons": lessons, "updates": updates, "publish": publish, "computerPlayers": computers, "server": server, "scale": scale}


class EveryAnswer(unittest.TestCase):
    def test_every_non_optional_requirement_is_connectable_for_every_answer_set(self):
        count = 0
        bad = []
        for answers in all_answers():
            result = E.evaluate(WORLD, answers)
            count += 1
            if not result["ok"]:
                bad.append((answers["targets"], answers["video"], answers["computerPlayers"], result["errors"][:2]))
            elif required_but_unconnected(result["design"]):
                bad.append((answers, required_but_unconnected(result["design"])))
        self.assertEqual(count, 63 * 2 * 2 * 2 * 2 * 3 * 2 * 3)
        self.assertEqual(bad[:3], [])

    def test_inclusion_follows_the_conditions_for_every_answer_set(self):
        for answers in itertools.islice(all_answers(), 0, None, 37):
            present = ids_of(evaluated(answers))
            t = set(answers["targets"])
            self.assertEqual("web-host" in present, bool(t & {"web", "windows"}))
            self.assertEqual("apple-host" in present, bool(t & {"ios", "macos", "tvos"}))
            self.assertEqual("android-host" in present, "android" in t)
            self.assertEqual("windows-desktop" in present, "windows" in t)
            self.assertEqual("video-calls" in present, answers["video"])
            self.assertEqual("guided-tour" in present, answers["lessons"])
            self.assertEqual("store-update" in present, answers["updates"])
            self.assertEqual("computer-players" in present, answers["computerPlayers"] != "none")
            self.assertEqual("poker-strategy" in present, answers["computerPlayers"] != "none")


class Selection(unittest.TestCase):
    def test_the_scale_picks_the_cheapest_fitting_candidate_and_the_server_answer_restricts_them(self):
        def pick(scale, server):
            return {k: v["profile"] for k, v in evaluated({**SETS["default"], "scale": scale, "server": server})["selections"].items()}
        self.assertEqual(pick("small", "cloudflare"), {"server": "cloudflare-free", "realtime": "free", "video": "free"})
        self.assertEqual(pick("medium", "cloudflare"), {"server": "cloudflare-free", "realtime": "free", "video": "free"})
        self.assertEqual(pick("large", "cloudflare"), {"server": "cloudflare-paid", "realtime": "paid", "video": "paid"})
        self.assertEqual(pick("small", "own-hardware"), {"server": "own-hardware", "realtime": "own-hardware", "video": "free"})
        self.assertEqual(pick("large", "own-hardware"), {"server": "own-hardware", "realtime": "own-hardware", "video": "paid"})

    def test_without_an_override_question_the_cheapest_candidate_wins_whatever_the_provider(self):
        recipe = copy.deepcopy(RECIPE)
        for job in recipe["jobs"]:
            job.pop("overrideQuestion", None)
        design = evaluated({**SETS["default"], "scale": "large"}, WORLD.with_recipe(recipe))
        self.assertEqual(design["selections"]["server"]["profile"], "own-hardware", "cost none ranks below metered")

    def test_a_job_with_no_fitting_candidate_is_uncovered(self):
        recipe = copy.deepcopy(RECIPE)
        recipe["jobs"][0]["candidates"] = [c for c in recipe["jobs"][0]["candidates"] if c["profile"] == "cloudflare-free"]
        self.assertIn(("uncovered", "server"), codes(E.evaluate(WORLD.with_recipe(recipe), {**SETS["default"], "scale": "large"})))
        self.assertTrue(E.evaluate(WORLD.with_recipe(recipe), SETS["default"])["ok"])

    def test_a_job_whose_component_is_left_out_selects_nothing(self):
        self.assertNotIn("video", evaluated(SETS["book-club"])["selections"])
        self.assertIn("video", evaluated(SETS["default"])["selections"])


class Rules(unittest.TestCase):
    """Each error code, and each `sets` form, with small changes to the recipe or the answers."""

    def mutate(self, change):
        recipe = copy.deepcopy(RECIPE)
        change(recipe)
        return WORLD.with_recipe(recipe)

    def question(self, recipe, qid):
        return next(q for q in recipe["questions"] if q["id"] == qid)

    def test_unanswered(self):
        answers = {k: v for k, v in PUBLISHED.items() if k not in ("server", "storeCredentials")}
        self.assertEqual(codes(E.evaluate(WORLD, answers)), {("unanswered", "answers.server"), ("unanswered", "answers.storeCredentials")})

    def test_invalid_answers(self):
        base = PUBLISHED
        for change, path in (({"players": 10}, "answers.players"), ({"players": True}, "answers.players"), ({"targets": ["web", "fax"]}, "answers.targets"), ({"targets": []}, "answers.targets"),
                             ({"look": "neon"}, "answers.look"), ({"video": "yes"}, "answers.video"), ({"videoKey": "bad key!"}, "answers.videoKey"),
                             ({"hostingAccount": "Bad_Name"}, "answers.hostingAccount"), ({"webAddress": "not an address"}, "answers.webAddress"),
                             ({"bundleId": "NoDots"}, "answers.bundleId"), ({"nonsense": 1}, "answers.nonsense")):
            with self.subTest(change):
                self.assertIn(("invalid-answer", path), codes(E.evaluate(WORLD, {**base, **change})))

    def test_ask_when_false_takes_the_default_and_ignores_a_supplied_answer(self):
        design = evaluated({**SETS["default"], "video": False, "videoKey": "ourpoker/video-key", "videoServiceUrl": "https://video.acme.io"})
        self.assertNotIn("videoKey", design["answers"])
        self.assertNotIn("video-calls", ids_of(design))
        self.assertEqual(design["answers"]["video"], False)
        # a question that is asked but unanswered takes its default; an asked reference without an answer is an error
        asked = evaluated({k: v for k, v in SETS["default"].items() if k != "webAddress"})
        self.assertEqual(settings_of(asked)["web-host"]["webAddress"], "http://localhost:5173")
        self.assertIn(("unanswered", "answers.videoKey"), codes(E.evaluate(WORLD, {k: v for k, v in PUBLISHED.items() if k != "videoKey"})))

    def test_conditions(self):
        def with_condition(condition):
            def change(recipe):
                next(c for c in recipe["components"] if c["id"] == "store-update")["includedWhen"] = condition
            return ids_of(evaluated(SETS["default"], self.mutate(change)))
        self.assertIn("store-update", with_condition("scale == 'small'"))
        self.assertNotIn("store-update", with_condition("scale == 'large'"))
        self.assertIn("store-update", with_condition("scale in ['small', 'large']"))
        self.assertIn("store-update", with_condition("'tvos' in targets"))
        self.assertIn("store-update", with_condition("video"))
        self.assertNotIn("store-update", with_condition("updates"))
        self.assertIn("store-update", with_condition("!updates"))
        self.assertIn("store-update", with_condition("video && lessons"))
        self.assertNotIn("store-update", with_condition("video && updates"))
        self.assertIn("store-update", with_condition("updates || video"))
        self.assertIn("store-update", with_condition("players >= 9 && size(languages) == 4"))
        self.assertNotIn("store-update", with_condition("hostingAccount == ''"), "an asked reference has its value")
        self.assertIn("store-update", with_condition("storeInvitation == ''"), "an unasked text question has its default")

    def test_settings_precedence_collect_default_then_configuration_then_question(self):
        default = settings_of(evaluated(SETS["default"]))
        self.assertEqual(WORLD.manifests["chip-ledger"]["collect"][4], {"id": "seats", "type": "integer", "grammar": "integer", "required": False, "secret": False, "default": 9})
        self.assertEqual(default["chip-ledger"]["minimumUnit"], 1, "collect default")
        self.assertEqual(default["computer-players"]["thinkMinMs"], 300, "recipe configuration")
        self.assertEqual(settings_of(evaluated({**SETS["default"], "players": 4}))["chip-ledger"]["seats"], 4, "question over the default")

        def change(recipe):
            next(c for c in recipe["components"] if c["id"] == "seating")["configuration"]["maximumPlayers"] = 5
        world = self.mutate(change)
        self.assertEqual(settings_of(evaluated(SETS["default"], world))["seating"]["maximumPlayers"], 9, "question over the recipe's configuration")

    def test_a_set_on_an_excluded_component_is_ignored(self):
        design = evaluated({**SETS["default"], "targets": ["web"]})
        self.assertNotIn("apple-host", ids_of(design))
        self.assertEqual(design["configuration"]["packageId"], "app.ourapps.ourpoker")

    def test_sets_forms_literal_answer_map_from_scale_template_and_ref(self):
        def change(recipe):
            q = self.question(recipe, "look")
            q["effects"].append({"sets": {
                "room-directory.maxConnections": {"fromScale": "concurrentPeople"},
                "server-host.roomPrefix": {"template": "{{answer}}-room-"},
                "card-graphics.cardWidth": 60,
                "card-graphics.cornerStyle": "square",
            }})
        world = self.mutate(change)
        small = settings_of(evaluated(PUBLISHED, world))
        self.assertEqual([small["room-directory"]["maxConnections"], small["server-host"]["roomPrefix"], small["card-graphics"]["cardWidth"], small["card-graphics"]["cornerStyle"]], [10, "night-room-", 60, "square"])
        self.assertEqual(settings_of(evaluated({**SETS["default"], "scale": "large", "look": "lounge"}, world))["room-directory"]["maxConnections"], 1000)
        self.assertEqual(small["card-graphics"]["backStyle"], "stripes", "map")
        self.assertEqual(small["video-calls"]["keyReference"], KEY, "ref to a secret setting is wrapped")
        self.assertEqual(small["server-host"]["accountReference"], "ourpoker-cloudflare-account", "ref to a plain setting is the name")
        self.assertEqual(settings_of(evaluated(SETS["default"]))["apple-host"]["targets"], "web ios android macos windows tvos", "a set becomes a space-separated string")

    def test_a_template_that_breaks_the_grammar_is_an_invalid_answer(self):
        def change(recipe):
            self.question(recipe, "look")["effects"].append({"sets": {"server-host.roomPrefix": {"template": "{{answer}}!"}}})
        self.assertIn(("invalid-answer", "answers.look"), codes(E.evaluate(self.mutate(change), SETS["default"])))

    def test_an_empty_text_answer_writes_nothing(self):
        design = evaluated({**SETS["default"], "bundleId": ""})
        self.assertEqual(settings_of(design)["apple-host"]["bundleIdentifier"], "app.ourapps.ourpoker", "the recipe's derived value stands")
        self.assertNotIn("serviceUrl", settings_of(design)["video-calls"])
        design = evaluated({**SETS["default"], "bundleId": "io.acme.poker"})
        self.assertEqual(settings_of(design)["apple-host"]["bundleIdentifier"], "io.acme.poker")

    def test_a_required_setting_with_no_value_is_missing(self):
        self.assertIn(("missing-setting", "web-host.webAddress"), codes(E.evaluate(WORLD, {**SETS["default"], "webAddress": ""})))

        def change(recipe):
            next(c for c in recipe["components"] if c["id"] == "web-host")["configuration"].pop("applicationName")
        self.assertIn(("missing-setting", "web-host.applicationName"), codes(E.evaluate(self.mutate(change), SETS["default"])))

    def test_unknown_component_and_unknown_setting(self):
        def component(recipe):
            recipe["components"].append({"id": "ghost", "name": "ourapps-ae/ghost", "version": "0.1.0", "configuration": {}, "includedWhen": None})
        self.assertIn(("unknown-component", "ghost"), codes(E.evaluate(self.mutate(component), SETS["default"])))

        def setting(recipe):
            self.question(recipe, "look")["effects"].append({"sets": {"theme.nonsense": "$answer"}})
        self.assertIn(("unknown-setting", "theme.nonsense"), codes(E.evaluate(self.mutate(setting), SETS["default"])))

        def configuration(recipe):
            next(c for c in recipe["components"] if c["id"] == "theme")["configuration"]["nonsense"] = "x"
        self.assertIn(("unknown-setting", "theme.nonsense"), codes(E.evaluate(self.mutate(configuration), SETS["default"])))

    def test_conflicting_sets(self):
        def change(recipe):
            self.question(recipe, "look")["effects"].append({"sets": {"theme.primaryColour": "gold"}})
            self.question(recipe, "scale")["effects"].append({"sets": {"theme.primaryColour": "blue"}})
        self.assertIn(("conflicting-sets", "theme.primaryColour"), codes(E.evaluate(self.mutate(change), SETS["default"])))

        def exclusive(recipe):
            self.question(recipe, "look")["effects"].append({"sets": {"theme.primaryColour": "gold"}})
            q = self.question(recipe, "updates")
            q["effects"].append({"sets": {"theme.primaryColour": "blue"}})
        # both asked here as well: still a conflict; the recipe validator is what rejects non-exclusive questions beforehand
        self.assertIn(("conflicting-sets", "theme.primaryColour"), codes(E.evaluate(self.mutate(exclusive), SETS["default"])))

    def test_an_asked_question_beats_an_unasked_one_that_sets_the_same_target(self):
        def change(recipe):
            self.question(recipe, "bundleId")["effects"] = []
            self.question(recipe, "videoServiceUrl")["effects"] = [{"sets": {"video-calls.serviceUrl": "$answer"}}]
            alternative = {"id": "videoServiceUrl2", "ask": "x", "askWhen": "!video", "type": "text", "default": "https://fallback.acme.io",
                           "effects": [{"sets": {"video-calls.serviceUrl": "$answer"}}]}
            recipe["questions"].append(alternative)
        design = evaluated({**SETS["default"], "videoServiceUrl": "https://video.acme.io"}, self.mutate(change))
        self.assertEqual(settings_of(design)["video-calls"]["serviceUrl"], "https://video.acme.io")

    def test_unconnected_when_a_connection_is_missing_or_doubled(self):
        def missing(recipe):
            recipe["connections"] = [c for c in recipe["connections"] if not (c["target"] == {"instance": "seating", "port": "guest-identity"})]
        self.assertIn(("unconnected", "seating.guest-identity"), codes(E.evaluate(self.mutate(missing), SETS["default"])))

        def doubled(recipe):
            recipe["connections"].append(copy.deepcopy(next(c for c in recipe["connections"] if c["target"]["instance"] == "seating")))
        self.assertIn(("unconnected", "seating.guest-identity"), codes(E.evaluate(self.mutate(doubled), SETS["default"])))

    def test_a_connection_to_an_excluded_component_is_dropped_and_an_optional_requirement_may_stay_open(self):
        design = evaluated(SETS["tv-only"])
        self.assertFalse([c for c in design["design"]["connections"] if "web-host" in (c["source"]["instance"], c["target"]["instance"])])
        open_ports = {f"{c['id']}.{p['id']}" for c in design["components"] for p in WORLD.manifests[c["id"]]["requires"] if p.get("optional")}
        self.assertTrue({"display-mode.configuration"} <= open_ports)
        self.assertFalse([c for c in design["design"]["connections"] if c["target"] == {"instance": "display-mode", "port": "configuration"}])

    def test_the_application_is_an_instance_of_the_design(self):
        design = evaluated(SETS["default"])
        targets = {(c["target"]["instance"], c["target"]["port"]) for c in design["design"]["connections"]}
        for port in WORLD.manifests["application"]["requires"]:
            if not port.get("optional"):
                self.assertIn(("application", port["id"]), targets)
        self.assertIn(("realtime-rooms", "game"), targets)
        source = [c["source"] for c in design["design"]["connections"] if c["target"] == {"instance": "realtime-rooms", "port": "game"}]
        self.assertEqual(source, [{"instance": "application", "port": "poker-game-adapter"}])

    def test_computer_players_and_poker_strategy_are_left_out_for_none_and_nothing_is_left_unconnected(self):
        none = evaluated({**SETS["default"], "computerPlayers": "none"})
        self.assertFalse({"computer-players", "poker-strategy"} & ids_of(none))
        self.assertIn("poker-odds", ids_of(none))
        self.assertEqual(required_but_unconnected(none), [])
        self.assertFalse([c for c in none["design"]["connections"] if "computer-players" in (c["source"]["instance"], c["target"]["instance"])])
        open_ports = {f"{c['id']}.{p['id']}" for c in none["components"] for p in WORLD.manifests[c["id"]]["requires"] if p.get("optional")}
        self.assertIn("turn-engine.computer-players", open_ports)
        self.assertTrue({"computer-players", "poker-strategy"} <= ids_of(evaluated({**SETS["default"], "computerPlayers": "fill-empty"})))

    def test_store_credentials_are_asked_only_when_published_for_updates_or_an_iphone_target(self):
        def release(**changes):
            return evaluated({**PUBLISHED, **changes})
        web_only = release(targets=["web"])
        self.assertNotIn("storeCredentials", web_only["answers"])
        self.assertNotIn("storeCredentials", settings_of(web_only)["ourapps-release"])
        self.assertEqual(settings_of(release(targets=["web"], updates=True, storeInvitation=INVITATION))["ourapps-release"]["storeCredentials"], STORE)
        self.assertEqual(settings_of(release(targets=["ios"]))["ourapps-release"]["storeCredentials"], STORE)
        self.assertNotIn("storeCredentials", settings_of(release(targets=["android", "macos", "tvos"]))["ourapps-release"])
        self.assertIn(("unanswered", "answers.storeCredentials"), codes(E.evaluate(WORLD, {k: v for k, v in PUBLISHED.items() if k != "storeCredentials"})))

    def test_a_local_design_asks_for_no_signing_or_deployment_reference(self):
        local = evaluated({"targets": ["web", "ios", "android"], "server": "own-hardware", "video": True, "updates": True})
        for question in ("webDeploy", "androidSigning", "storeCredentials", "videoKey", "videoSecret", "hostingAccount"):
            self.assertNotIn(question, local["answers"])
        self.assertEqual({k: v for k, v in settings_of(local)["ourapps-release"].items() if k in ("storeCredentials", "androidSigning", "webDeploy")}, {})
        self.assertNotIn("keyReference", settings_of(local)["video-calls"])
        # a Cloudflare server needs its account reference whether or not builds are published
        self.assertEqual(codes(E.evaluate(WORLD, {"targets": ["web"], "server": "cloudflare"})), {("unanswered", "answers.hostingAccount")})

    def test_the_devices_answer_goes_to_apple_host_whole(self):
        self.assertEqual(settings_of(evaluated({**SETS["default"], "targets": ["macos", "android", "web"]}))["apple-host"]["targets"], "web android macos")
        self.assertEqual(settings_of(evaluated(SETS["tv-only"]))["apple-host"]["targets"], "tvos")


HELPER = ROOT / "authoring" / "cel_evaluate.mjs"
KINDS = E.question_kinds(RECIPE)
# Expressions over the recipe's questions that use every allowed construct; compared with @bufbuild/cel like the recipe's own
# conditions.
SAMPLES = [
    "true", "false || video", "!lessons", "!!updates", "players >= 6", "players < 4 || startingChips > 3000", "-1 < rebuys",
    "levelSeconds <= 0x258", "rebuys > --1", "rebuys >= -- -1", "-0x1 < rebuys", "decisionSeconds != 30", "size(targets) == 1", "targets.size() > 2", "size(bundleId) > 0",
    "scale in ['medium', 'large']", "scale < 'medium'", "look != 'night'", "!(video && lessons)", "bundleId == ''",
    "'en' in languages && !('de' in languages)", "computerPlayers == 'fill-empty' || (updates && server == 'own-hardware')",
    "webAddress == 'http://localhost:5173'", 'storeInvitation != ""', "r'own-hardware' == server", "'''cloudflare''' == server",
    "players in [2, 6, 9]", "video in [true]", "(players > 2) == (rebuys > 0)", "hostingAccount >= 'o'", r"'\x61\u0062' < look",
    r"size('caf\u00e9') == 4 && webAddress > 'http'", "storeCredentials == '' && videoKey != ''",
]


def conditions_of(recipe):
    out = [c["includedWhen"] for c in recipe["components"] if c.get("includedWhen") is not None]
    out += [q["askWhen"] for q in recipe["questions"] if q.get("askWhen") is not None]
    out += [c["includedWhen"] for j in recipe.get("jobs", []) for c in j["candidates"] if c.get("includedWhen") is not None]
    return sorted(set(out))


def bufbuild(lines):
    """@bufbuild/cel's results for each {kinds, bindings, expressions} line (authoring/cel_evaluate.mjs)."""
    assert (ROOT / "authoring" / "node_modules" / "@bufbuild" / "cel").is_dir(), "run: npm install --prefix authoring"
    done = subprocess.run(["node", str(HELPER)], input="".join(json.dumps(line) + "\n" for line in lines), capture_output=True, text=True, check=True, cwd=ROOT)
    return [json.loads(line)["results"] for line in done.stdout.splitlines()]


class CelParity(unittest.TestCase):
    """Every condition of recipe.json and every sample, for every answer set in recipe.json and every combination EveryAnswer
    generates: this evaluator and @bufbuild/cel give the same true or false."""

    def test_the_python_evaluator_and_bufbuild_cel_agree(self):
        conditions = conditions_of(RECIPE)
        self.assertEqual(len(conditions), 14, "distinct conditions of the recipe")
        expressions = conditions + SAMPLES
        answer_sets = list(SETS.values()) + list(all_answers())
        lines = [{"kinds": KINDS, "bindings": E.bindings(WORLD, answers), "expressions": expressions} for answers in answer_sets]
        theirs = bufbuild(lines)
        self.assertEqual(len(theirs), len(lines))
        compared, differ = 0, []
        for line, results in zip(lines, theirs):
            for expression, result in zip(line["expressions"], results):
                self.assertIs(type(result), bool, f"{expression}: {result}")
                ours = E.evaluate_condition(expression, line["bindings"], KINDS)
                compared += 1
                if ours != result:
                    differ.append((expression, line["bindings"], ours, result))
        self.assertEqual(differ[:3], [])
        self.assertEqual(compared, (len(SETS) + 63 * 2 * 2 * 2 * 2 * 3 * 2 * 3) * len(expressions))
        self.assertEqual(compared, (len(SETS) + 63 * 2 * 2 * 2 * 2 * 3 * 2 * 3) * len(expressions))

    def test_each_condition_takes_both_values_over_the_combinations(self):
        lines = [E.bindings(WORLD, answers) for answers in all_answers()]
        for condition in conditions_of(RECIPE):
            with self.subTest(condition):
                self.assertEqual({E.evaluate_condition(condition, b, KINDS) for b in lines}, {True, False})


class Cel(unittest.TestCase):
    """The parser and type check accept exactly the allowed subset."""

    def holds(self, expression, **answers):
        return E.evaluate_condition(expression, E.bindings(WORLD, {**SETS["default"], **answers}), KINDS)

    def test_the_recipe_conditions_read_the_answers(self):
        apple = "'ios' in targets || 'macos' in targets || 'tvos' in targets"
        self.assertTrue(self.holds(apple))
        self.assertFalse(self.holds(apple, targets=["web", "android"]))
        self.assertTrue(self.holds("computerPlayers != 'none'"))
        self.assertFalse(self.holds("computerPlayers != 'none'", computerPlayers="none"))
        self.assertTrue(self.holds("updates || 'ios' in targets", updates=False))
        self.assertTrue(self.holds("storeCredentials == ''", targets=["web"]), "an unasked reference is the empty text")
        self.assertEqual(E.names_in(E.parse_condition("updates || 'ios' in targets")), {"updates", "targets"})

    def test_literals_and_operators(self):
        self.assertEqual(E.parse_condition("x == -3"), ("call", "==", [("id", "x"), ("lit", -3)]))
        self.assertEqual(E.parse_condition("x in [1, 2,]"), ("call", "in", [("id", "x"), ("list", [("lit", 1), ("lit", 2)])]))
        self.assertEqual(E.parse_condition("!!x"), ("id", "x"))
        self.assertEqual(E.parse_condition("x == --3"), ("call", "==", [("id", "x"), ("lit", 3)]))
        self.assertEqual(E.parse_condition("x == -- -3"), ("call", "==", [("id", "x"), ("lit", -3)]))
        self.assertEqual(E.parse_condition("a || b && c"), ("call", "||", [("id", "a"), ("call", "&&", [("id", "b"), ("id", "c")])]))
        self.assertEqual(E.parse_condition("x // a comment\n == 'a'"), ("call", "==", [("id", "x"), ("lit", "a")]))
        self.assertEqual(E.parse_condition(r"x == '\x41\101\u0042\U00000043\?\`\n'")[2][1], ("lit", "AABC?`\n"))
        self.assertEqual(E.parse_condition(r"x == r'\n'")[2][1], ("lit", "\\n"))
        self.assertEqual(E.parse_condition('x == """a\nb"""')[2][1], ("lit", "a\nb"))

    def test_constructs_outside_the_subset_are_refused(self):
        for expression, why in (("players + 1 > 2", "+ is not allowed"), ("- players < 0", "unary minus"), ("-(3) < players", "unary minus"),
                                ("- 3 < players", "unary minus"), ("---3 < players", "unary minus"), ("- -3 < players", "unary minus"), ("lessons ? true : false", "?:"), ("targets[0] == 'web'", "indexing"),
                                ("targets.all(t, t == 'web')", "the method all()"), ("has(scale.x)", "field selection"), ("scale.x == 'a'", "field selection"),
                                ("{'a': true}", "map or message literal"), ("scale.startsWith('s')", "the method startsWith()"),
                                ("int(scale) == 1", "the function int()"), ("exists(x)", "macros"), ("players == 1.5", "double literal"),
                                ("players == 1u", "uint64 literal"), ("scale == null", "null literal"), ("look == b'a'", "bytes literal"),
                                ("'a\nb' == look", "cannot read"), ("video &&", "unexpected"), ("in == 1", "reserved word"),
                                ("size() == 0", "the function size()"), ("size(look, look) == 0", "the function size()"), ("", "1 to 1000 characters")):
            with self.subTest(expression), self.assertRaises(E.CelError) as caught:
                E.kind_of(E.parse_condition(expression), KINDS)
            self.assertIn(why, str(caught.exception))

    def test_types_are_checked_to_bool(self):
        for expression, why in (("players", "not true or false"), ("lessons == 'yes'", "compares bool with string"), ("players == '5'", "compares int with string"),
                                ("targets == ['web']", "cannot compare sets"), ("lessons < true", "cannot order"), ("'web' in scale", "in needs a value and a list"),
                                ("1 in targets", "not int in list(string)"), ("lessons && players", "&& takes true or false"), ("size(lessons) > 0", "size() takes"),
                                ("ghost", "not a question"), ("scale in []", "1 to 50 values"), ("scale in [look]", "only literals"), ("players in [1, 'a']", "one type"),
                                ("players < 9223372036854775808", "64-bit")):
            with self.subTest(expression), self.assertRaises(E.CelError) as caught:
                E.evaluate_condition(expression, E.bindings(WORLD, SETS["default"]), KINDS)
            self.assertIn(why, str(caught.exception))


class Grammars(unittest.TestCase):
    def test_the_evaluators_grammars_are_aepms(self):
        self.assertEqual(E.GRAMMARS, aepm_application.GRAMMARS)

    def test_the_diagram_generator_rejects_a_drawing_with_an_unconnected_required_input(self):
        drawing = draw_design.drawing(evaluated(SETS["default"]))
        drawing["connections"] = [c for c in drawing["connections"] if c["target"] != {"instance": "seating", "port": "guest-identity"}]
        with self.assertRaises(diagram.DesignError):
            diagram.validate_design(drawing)


if __name__ == "__main__":
    unittest.main(verbosity=1)
