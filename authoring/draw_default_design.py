#!/usr/bin/env python3
"""Draws the OurPoker design for the DEFAULT answers with aepm's diagram generator.

The design comes from aepm's evaluator (aepm.recipe) applied to the default answers; this script only
draws it. It does not assemble, resolve, install or run anything.

Writes authoring/designs/*.json and renders page/diagram.{svg,png} (every component by name, grouped as in paper Section 5.3), page/diagram-<group>.{svg,png}
(each group's components) and page/diagram-full.svg (every included component; over the generator's PNG size limit, so SVG only).
Usage: PYTHONPATH=/Users/george/Projects/com/my/aepm python3.12 -B authoring/draw_default_design.py
"""
import copy
import os
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
COMPONENTS = Path(os.environ.get("OURPOKER_COMPONENTS") or HERE.parent.parent / "components")  # the component checkouts
sys.path.insert(0, str(HERE.parent.parent / "aepm"))
from aepm.diagram import generate as diagram  # noqa: E402

sys.path.insert(0, str(HERE / "authoring"))
import draw_design  # noqa: E402
import draw_overview  # noqa: E402
from aepm import recipe as evaluator  # noqa: E402
import recipe_world  # noqa: E402

recipe = json.loads((HERE / "recipe.json").read_text())

# The default answers (recipe.json tests.defaultAnswers) are evaluated by aepm's evaluator and the result is drawn:
# all six devices, small, video yes, computer players on request, lessons yes, updates no, Cloudflare. Under these answers every
# component is present except store-update (updates is no).
GROUPS = [
    ("Delivery and hosts", ["web-host", "apple-host", "android-host", "windows-desktop", "server-host", "ourapps-release", "store-update"]),
    ("Rooms, people and sessions", ["realtime-rooms", "room-directory", "guest-identity", "presence", "invitations", "private-views", "display-mode", "video-calls", "preferences"]),
    ("Turn-based game framework", ["turn-engine", "game-clock", "seating", "fair-shuffle", "card-deck", "computer-players", "chip-ledger", "level-schedule", "tournament", "round-history", "rules-settings"]),
    ("Poker", ["poker-hand-ranking", "poker-odds", "holdem-rules", "poker-strategy"]),
    ("Interface and presentation", ["theme", "controls", "table-layout", "card-graphics", "chip-graphics", "sound-cues", "guided-tour", "translations"]),
]
APP_REVISION = recipe["version"]


def publishable(path):
    """The generator writes a DOCTYPE line; the ourapps catalogue (isSafeSvg) refuses any DOCTYPE, so drop it."""
    text = Path(path).read_text()
    Path(path).write_text(re.sub(r"<!DOCTYPE[^>]*>\s*", "", text))


def port(pid, name, direction, ptype, version, required=True):
    entry = {"id": pid, "name": name, "direction": direction, "kind": "interface", "type": ptype, "version": version}
    if direction == "input":
        entry.update({"required": required, "cardinality": "one"})
    return entry


def build():
    result = evaluator.evaluate(recipe_world.world(), recipe["tests"]["defaultAnswers"])
    if not result["ok"]:
        raise SystemExit(f"the default answers do not evaluate: {result['errors']}")
    design = result["design"]
    full = draw_design.drawing(design, drawing_id="ourpoker-default", title="OurPoker: default answers")
    included = [{"id": i["id"]} for i in full["instances"] if i["id"] != "application"]
    return full, included


def application_design(full):
    """The application-specific component with the components it connects to; their other inputs are drawn as optional."""
    neighbours = {c["source"]["instance"] for c in full["connections"] if c["target"]["instance"] == "application"}
    neighbours |= {c["target"]["instance"] for c in full["connections"] if c["source"]["instance"] == "application"}
    return group_design(full, "Application", sorted(neighbours | {"application"}), "ourpoker-application", "OurPoker: the application-specific component and what it connects to, default answers")[1]


def group_design(full, name, members, design_id=None, title=None):
    """One group's components with the connections between them; inputs fed from other groups are drawn as optional."""
    inside = set(members)
    connections = [c for c in full["connections"] if c["source"]["instance"] in inside and c["target"]["instance"] in inside]
    fed = {(c["target"]["instance"], c["target"]["port"]) for c in connections}
    instance_def = {i["id"]: i["definition"] for i in full["instances"]}
    wanted = {instance_def[m] for m in members}
    definitions = []
    for d in full["definitions"]:
        if d["id"] not in wanted:
            continue
        d = copy.deepcopy(d)
        for p in d["ports"]:
            if p["direction"] == "input" and not any(instance_def[m] == d["id"] and (m, p["id"]) in fed for m in members):
                p["required"] = False
        definitions.append(d)
    slug = name.lower().replace(",", "").replace(" ", "-")
    return slug, {"schemaVersion": 1, "id": design_id or f"ourpoker-{slug}", "title": title or f"OurPoker: {name}, default answers", "status": "example", "view": "application",
                  "definitions": definitions, "instances": [i for i in full["instances"] if i["id"] in inside], "connections": connections}


def main():
    full, included = build()
    out = HERE / "authoring" / "designs"
    out.mkdir(parents=True, exist_ok=True)
    findings = []
    try:
        diagram.validate_design(copy.deepcopy(full))
    except diagram.DesignError as error:
        findings.append(str(error))
    (out / "default.json").write_text(json.dumps(full, indent=2) + "\n")
    print(f"full design: {len(full['definitions'])} definitions, {len(full['instances'])} instances, {len(full['connections'])} connections")
    if findings:
        print("FINDINGS (validate_design):")
        for f in findings:
            print("  " + f)
    else:
        print("validate_design: ok (every connection has matching kind, type and version; every required input is connected)")

    # The aepm generator refuses images over 8192 pixels on an axis; the full drawing is about 9544 x 5200.
    dot = diagram.to_dot(copy.deepcopy(full))
    svg = diagram.run_renderer(diagram.resolve_dot(), "svg", dot).decode()
    print("full drawing size:", svg[svg.index("<svg width"):svg.index(">", svg.index("<svg width"))])
    (HERE / "page" / "diagram-full.svg").write_text(svg)
    publishable(HERE / "page" / "diagram-full.svg")  # the generator's PNG limit (8192 pixels an axis) does not apply to SVG

    size = draw_overview.render(full, GROUPS, APP_REVISION, HERE / "page")
    print(f"rendered page/diagram.svg and page/diagram.png: every component by name, {size} characters")

    for name, slugs in GROUPS:
        members = [s for s in slugs if s in {c["id"] for c in included}]
        slug, design = group_design(full, name, members)
        diagram.validate_design(copy.deepcopy(design))
        (out / f"{slug}.json").write_text(json.dumps(design, indent=2) + "\n")
        paths = diagram.generate(out / f"{slug}.json", HERE / "page" / f"diagram-{slug}")
        publishable(paths[0])
        print("rendered", *paths)
    design = application_design(full)
    diagram.validate_design(copy.deepcopy(design))
    (out / "application.json").write_text(json.dumps(design, indent=2) + "\n")
    # Over the generator's image size limit as a PNG (the application has 21 neighbours), so SVG only, like diagram-full.svg.
    svg = diagram.run_renderer(diagram.resolve_dot(), "svg", diagram.to_dot(copy.deepcopy(design))).decode()
    (HERE / "page" / "diagram-application.svg").write_text(svg)
    publishable(HERE / "page" / "diagram-application.svg")
    print("rendered page/diagram-application.svg")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
