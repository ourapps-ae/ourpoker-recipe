#!/usr/bin/env python3
"""Reference evaluator for recipe.json: rules 1 to 25 of "Recipe evaluation rules" in component-standard.md.

It exists only so tests can show the rules are complete and unambiguous. It reads recipe.json, the components' component.json
and suitability.json, and the recipe's own component.json, and returns an aepm application definition (format 1) for one set
of answers. It does not assemble, resolve, install or run anything, and it is not the assembler.

Result (rule 12, errors are values): {"ok": True, "design": {...}} or {"ok": False, "errors": [{"code": ..., "path": ...}]}.
Codes: unanswered, invalid-answer, missing-setting, uncovered, unconnected, conflicting-sets, unknown-component, unknown-setting.
`design` is an aepm application definition (format 1): format, id, title, recipe, components, configuration, design,
updatePolicy and the optional `answers` and `selections` (rules 11 and 24); `aepm.application.validate_definition` accepts it.
Output bytes are canonical: `to_json` sorts every key.

Choices the first rules left open are rules 13 to 25; the comments name the rule.

Usage: python3 -B authoring/evaluate_recipe.py [answers.json]     (prints the design for the answers, or the default answers)
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
COMPONENTS = HERE.parent.parent / "components"
APPLICATION = "application"
UNSET = object()  # a secretRef question that was not asked: the reference is left unset (clarification a)

GRAMMARS = {
    "identifier": r"[A-Za-z][A-Za-z0-9_]{0,63}",
    "qualified": r"[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+",
    "slug": r"[a-z][a-z0-9-]{0,63}",
    "label": r"[A-Za-z][A-Za-z0-9 -]{0,63}",
    "environment": r"[A-Z][A-Z0-9_]{0,63}",
    "address": r"https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[A-Za-z0-9_/-]*)?",
}
SECRET_REFERENCE = r"[A-Za-z][A-Za-z0-9_./-]{0,127}"
COST_RANK = {"none": 0, "free": 1, "paid": 2, "metered": 3}
SCALE_KEYS = ("concurrentPeople", "requestsPerDay", "storedMegabytes")


def read(path):
    return json.loads(Path(path).read_text())


class World:
    """The recipe, the components' manifests and suitability files, and the recipe's own manifest."""

    def __init__(self, recipe_directory=HERE, components_directory=COMPONENTS):
        self.recipe = read(Path(recipe_directory) / "recipe.json")
        self.manifests, self.suitability = {}, {}
        for component in self.recipe["components"]:
            directory = Path(components_directory) / component["name"].split("/")[1]
            if (directory / "component.json").is_file():
                self.manifests[component["id"]] = read(directory / "component.json")
                self.suitability[component["id"]] = read(directory / "suitability.json") if (directory / "suitability.json").is_file() else {"profiles": []}
        self.manifests[APPLICATION] = read(Path(recipe_directory) / "component.json")

    def with_recipe(self, recipe):
        other = object.__new__(World)
        other.recipe, other.manifests, other.suitability = recipe, self.manifests, self.suitability
        return other


def fits_grammar(grammar, value):
    return isinstance(value, str) and grammar in GRAMMARS and re.fullmatch(GRAMMARS[grammar], value) is not None


def truthy(value):
    return value is not UNSET and bool(value)


def evaluate(world, answers, application_id=None):
    return _Evaluation(world, answers, application_id).run()


class _Evaluation:
    def __init__(self, world, answers, application_id):
        self.world, self.recipe, self.supplied = world, world.recipe, answers
        self.application_id = application_id or self.recipe["name"].replace("/", ".")
        self.errors = []
        self.questions = {q["id"]: q for q in self.recipe["questions"]}
        self.components = {c["id"]: c for c in self.recipe["components"]}
        self.values, self.asked = {}, {}
        self.in_progress = set()

    def error(self, code, path):
        item = {"code": code, "path": path}
        if item not in self.errors:
            self.errors.append(item)

    # ---- rule 1, 2: answers and askWhen ----

    def resolve(self, qid):
        if qid in self.values:
            return self.values[qid]
        q = self.questions[qid]
        asked = True
        if q.get("askWhen") is not None:
            asked = self.holds(q["askWhen"])
        self.asked[qid] = asked
        if not asked:
            # Not asked: the default, or an unset reference. A supplied answer is ignored.
            value = UNSET if q["type"] == "secretRef" else q.get("default", UNSET)
        elif qid in self.supplied:
            value = self.checked(q, self.supplied[qid])
        elif q["type"] != "secretRef" and "default" in q:
            value = q["default"]
        else:
            self.error("unanswered", f"answers.{qid}")
            value = UNSET
        if q["type"] == "set" and isinstance(value, list):
            value = [o for o in q["options"] if o in value]  # rule 13: a set answer is kept in option order, without repeats, so equal answers give equal bytes
        self.values[qid] = value
        return value

    def checked(self, q, value):
        path = f"answers.{q['id']}"
        kind = q["type"]
        ok = False
        if kind == "boolean":
            ok = type(value) is bool
        elif kind == "integer":
            ok = type(value) is int and -(2 ** 31) <= value < 2 ** 31 and ("min" not in q or value >= q["min"]) and ("max" not in q or value <= q["max"])
        elif kind == "choice":
            ok = value in q["options"] and type(value) is type(q["options"][q["options"].index(value)])
        elif kind == "set":
            ok = isinstance(value, list) and all(v in q["options"] for v in value)
        elif kind in ("text", "account"):
            ok = isinstance(value, str) and len(value) <= 500
        elif kind == "secretRef":
            ok = isinstance(value, str) and re.fullmatch(SECRET_REFERENCE, value) is not None
        if not ok:
            self.error("invalid-answer", path)
            return UNSET
        return value

    # ---- rule 3: conditions ----

    def holds(self, c):
        if "all" in c:
            return all(self.holds(x) for x in c["all"])
        if "any" in c:
            return any(self.holds(x) for x in c["any"])
        if "not" in c:
            return not self.holds(c["not"])
        value = self.resolve(c["question"])
        if "equals" in c:
            return value is not UNSET and value == c["equals"] and type(value) is type(c["equals"])
        if "in" in c:
            return value is not UNSET and any(value == v and type(value) is type(v) for v in c["in"])
        if "contains" in c:
            return isinstance(value, list) and c["contains"] in value
        if "truthy" in c:
            return truthy(value) == bool(c["truthy"])
        raise ValueError(f"condition {c}")

    # ---- the run ----

    def run(self):
        recipe = self.recipe
        for qid in self.supplied:
            if qid not in self.questions:
                self.error("invalid-answer", f"answers.{qid}")
        for q in recipe["questions"]:
            self.resolve(q["id"])

        for c in recipe["components"]:  # unknown components
            if c["id"] not in self.world.manifests:
                self.error("unknown-component", c["id"])
        if self.errors:
            return self.failure()

        order = [c["id"] for c in recipe["components"] if c.get("includedWhen") is None or self.holds(c["includedWhen"])] + [APPLICATION]
        included = set(order)
        self.order = order

        selections, selected_settings = self.select(included)
        included_components = [c for c in recipe["components"] if c["id"] in included]

        settings = self.settings(included, selected_settings)
        connections = self.connections(included)
        if self.errors:
            return self.failure()

        design = {
            "format": 1,
            "id": self.application_id,
            "title": recipe["title"],
            "recipe": {"name": recipe["name"], "version": recipe["version"]},
            "components": [{"id": c["id"], "name": c["name"], "version": c["version"], "configuration": settings[c["id"]]} for c in included_components],
            "configuration": settings[APPLICATION],
            "design": {"definitions": [], "instances": [], "connections": connections},
            "updatePolicy": "patch",
            "answers": {qid: v for qid, v in self.values.items() if self.asked[qid] and v is not UNSET},
            "selections": selections,
        }
        return {"ok": True, "design": design}

    def failure(self):
        return {"ok": False, "errors": self.errors}

    # ---- rule 7: jobs and scale ----

    def band(self):
        scale = self.recipe.get("scale")
        if not scale:
            return None
        answer = self.values.get(scale["question"])
        return next((b for b in scale["bands"] if b["id"] == answer), None)

    @staticmethod
    def words(text):
        return re.sub(r"[^a-z0-9]+", " ", str(text).lower()).split()

    def names(self, answer, profile):
        """Rule 14: "the named profile or provider". The answer names a candidate when its words begin the words of the
        profile id or of the provider's name (`cloudflare` names cloudflare-free and a provider "Cloudflare Workers ...";
        `own-hardware` names the profile own-hardware)."""
        wanted = self.words(answer)
        for text in (profile["id"], (profile.get("provider") or {}).get("name") or ""):
            have = self.words(text)
            if wanted and have[: len(wanted)] == wanted:
                return True
        return False

    def select(self, included):
        selections, writes = {}, {}
        band = self.band()
        for job in self.recipe.get("jobs", []):
            candidates = []
            for candidate in job["candidates"]:
                cid = next((c["id"] for c in self.recipe["components"] if c["name"] == candidate["component"]), None)
                if cid is None:
                    self.error("unknown-component", f"jobs.{job['id']}.{candidate['component']}")
                    continue
                if cid not in included or (candidate.get("includedWhen") is not None and not self.holds(candidate["includedWhen"])):
                    continue  # rule 15: a job whose components are all left out selects nothing and cannot be uncovered
                profile = next((p for p in self.world.suitability[cid]["profiles"] if p["id"] == candidate["profile"]), None)
                if profile is None:
                    self.error("unknown-component", f"jobs.{job['id']}.{candidate['component']}.{candidate['profile']}")
                    continue
                candidates.append((cid, candidate, profile))
            if not candidates:
                continue
            override = job.get("overrideQuestion")
            restricted = candidates
            if override is not None and self.values.get(override) not in (None, UNSET):
                restricted = [c for c in candidates if self.names(self.values[override], c[2])]
            load = band["load"] if band else {}
            # rule 16: no source for a requested region or compliance; the recipe asks for neither.
            fitting = [c for c in restricted
                       if all(v >= load.get(k, 0) for k, v in c[2]["load"].items()) and "any" in c[2]["regions"]]
            if not fitting:
                self.error("uncovered", job["id"])
                continue
            best = min(COST_RANK[c[2]["cost"]] for c in fitting)
            winner = next(c for c in fitting if COST_RANK[c[2]["cost"]] == best)
            cid, candidate, profile = winner
            why = f"scale {band['id'] if band else 'unstated'}; {len(fitting)} of {len(candidates)} candidates fit"
            if len(restricted) != len(candidates):
                why += f"; the {override} answer {self.values[override]} named {len(restricted)}"
            why += f"; lowest cost {profile['cost']}"
            selections[job["id"]] = {"component": candidate["component"], "profile": profile["id"], "reason": why}
            # rule 23: a profile's own settings are applied after the recipe's configuration and before question sets.
            values = dict(profile.get("settings") or {})
            # rule 17: rule 7 says the selection writes `server-host.provider` from "the provider name"; the setting is a slug and
            # the provider name is prose, so the selected profile id (cloudflare-free, cloudflare-paid, own-hardware) is written.
            if any(s["id"] == "provider" for s in self.world.manifests[cid]["collect"]):
                values.setdefault("provider", profile["id"])
            writes[cid] = values
        return selections, writes

    # ---- rules 5, 6: settings ----

    def declaration(self, instance, setting):
        return next((s for s in self.world.manifests[instance]["collect"] if s["id"] == setting), None)

    def target(self, text):
        best = None
        for instance in list(self.components) + [APPLICATION]:
            if text.startswith(instance + ".") and (best is None or len(instance) > len(best)):
                best = instance
        return (best, text[len(best) + 1:]) if best else (None, None)

    def form_value(self, q, value, instance, setting):
        """The value one `sets` form gives, UNSET when it gives none (rule 6)."""
        answer = self.values[q["id"]]
        decl = self.declaration(instance, setting)
        if value == "$answer":
            if answer is UNSET:
                return UNSET
            if q["type"] == "set":
                return " ".join(answer)
            if q["type"] == "text" and answer == "":
                return UNSET  # rule 18: an empty text answer writes nothing, so the lower precedence value (or none) stays
            return answer
        if isinstance(value, dict):
            (kind, argument), = value.items()
            if kind == "map":
                return argument[str(answer)] if answer is not UNSET else UNSET
            if kind == "fromScale":
                band = self.band()
                return band["load"][argument] if band else UNSET
            if kind == "template":
                if answer is UNSET or answer == "":
                    return UNSET
                return argument.replace("{{answer}}", str(answer))
            if kind == "ref":
                return self.resolve(argument)
        return value  # a literal

    def settings(self, included, selected):
        """Effective settings of every included instance: collect default < recipe configuration < selection < question sets."""
        out, origin = {}, {}
        for instance in self.order:
            manifest = self.world.manifests[instance]
            values = {s["id"]: s["default"] for s in manifest["collect"] if "default" in s}
            configuration = {} if instance == APPLICATION else self.components[instance].get("configuration", {})
            for setting, value in {**configuration, **selected.get(instance, {})}.items():
                if self.declaration(instance, setting) is None:
                    self.error("unknown-setting", f"{instance}.{setting}")
                else:
                    values[setting] = value
            out[instance] = values
        # question sets, in question order
        records = {}
        for q in self.recipe["questions"]:
            for effect in q.get("effects", []):
                for target, form in effect.get("sets", {}).items():
                    instance, setting = self.target(target)
                    if instance is None:
                        self.error("unknown-component", target)
                        continue
                    if self.declaration(instance, setting) is None:
                        self.error("unknown-setting", target)
                        continue
                    if instance not in included:
                        continue  # rule 5: ignored on an excluded component
                    value = self.form_value(q, form, instance, setting)
                    if value is UNSET:
                        continue
                    records.setdefault((instance, setting), []).append((q["id"], self.asked[q["id"]], value))
        for (instance, setting), items in records.items():
            # rule 19: effects of unasked questions still apply (clarification c), so two questions that exclude each other by
            # askWhen both write; the asked one wins. Two asked questions giving different values conflict.
            winners = [i for i in items if i[1]] or items
            if len({json.dumps(i[2]) for i in winners if i[1]}) > 1:
                self.error("conflicting-sets", f"{instance}.{setting}")
            out[instance][setting] = winners[-1][2]
            origin[(instance, setting)] = f"answers.{winners[-1][0]}"
        # secret references and types; required settings
        for instance in self.order:
            for decl in self.world.manifests[instance]["collect"]:
                sid, path = decl["id"], f"{instance}.{decl['id']}"
                if sid not in out[instance]:
                    if decl["required"]:
                        self.error("missing-setting", path)
                    continue
                value = out[instance][sid]
                problem = self.setting_problem(decl, value)
                # rules 21 and 22: a text answer has no grammar of its own and a secretRef answer's grammar is that of the setting it fills (a
                # secret setting takes a reference name, a plain one such as accountReference its grammar), so both are checked here and a
                # failure is an `invalid-answer` at the answer.
                if problem:
                    self.error("invalid-answer", origin.get((instance, sid), path))
                elif decl["secret"] and not isinstance(value, dict):
                    out[instance][sid] = {"secretRef": value}
        return out

    @staticmethod
    def setting_problem(decl, value):
        if decl["secret"]:
            name = value["secretRef"] if isinstance(value, dict) and set(value) == {"secretRef"} else value
            return not (isinstance(name, str) and re.fullmatch(SECRET_REFERENCE, name))
        if decl["type"] == "boolean":
            return type(value) is not bool
        if decl["type"] == "integer":
            return not (type(value) is int and -(2 ** 31) <= value < 2 ** 31)
        return not fits_grammar(decl["grammar"], value)

    # ---- rules 8, 9: connections ----

    def connections(self, included):
        kept = []
        for c in self.recipe["connections"]:
            s, t = c["source"], c["target"]
            for end in (s, t):
                if end["instance"] != APPLICATION and end["instance"] not in self.components:
                    self.error("unknown-component", end["instance"])
            if s["instance"] in included and t["instance"] in included:
                kept.append({"source": dict(s), "target": dict(t)})
        count = {}
        for c in kept:
            key = (c["target"]["instance"], c["target"]["port"])
            count[key] = count.get(key, 0) + 1
        for instance in self.order:
            for port in self.world.manifests[instance]["requires"]:
                if port.get("optional"):
                    continue
                if count.get((instance, port["id"]), 0) != 1:  # rule 20: no code for "connected twice"; it is reported as unconnected too
                    self.error("unconnected", f"{instance}.{port['id']}")
        return kept


def to_json(result):
    """Canonical bytes: every object's keys sorted, two-space indent, a final newline."""
    return json.dumps(result, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def main(argv):
    world = World()
    answers = read(argv[0]) if argv else world.recipe["tests"]["defaultAnswers"]
    result = evaluate(world, answers)
    sys.stdout.write(to_json(result))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
