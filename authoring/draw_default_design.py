#!/usr/bin/env python3
"""Draws the OurPoker design for the DEFAULT answers with aepm's diagram generator.

The design comes from authoring/evaluate_recipe.py (the reference evaluator) applied to the default answers; this script only
draws it. It does not assemble, resolve, install or run anything.

Writes authoring/designs/*.json and renders page/diagram.{svg,png} (components grouped as in paper Section 5.3), page/diagram-<group>.{svg,png}
(each group's components) and page/diagram-full.svg (every included component; over the generator's PNG size limit, so SVG only).
Usage: PYTHONPATH=/Users/george/Projects/com/my/aepm python3.12 -B authoring/draw_default_design.py
"""
import copy
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
COMPONENTS = HERE.parent.parent / "components"
sys.path.insert(0, str(HERE.parent.parent / "aepm"))
from aepm.diagram import generate as diagram  # noqa: E402

sys.path.insert(0, str(HERE / "authoring"))
import draw_design  # noqa: E402
import evaluate_recipe  # noqa: E402

recipe = json.loads((HERE / "recipe.json").read_text())

# The default answers (recipe.json tests.defaultAnswers) are evaluated by authoring/evaluate_recipe.py and the result is drawn:
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
    result = evaluate_recipe.evaluate(evaluate_recipe.World(), recipe["tests"]["defaultAnswers"])
    if not result["ok"]:
        raise SystemExit(f"the default answers do not evaluate: {result['errors']}")
    design = result["design"]
    full = draw_design.drawing(design, drawing_id="ourpoker-default", title="OurPoker: default answers")
    included = [{"id": i["id"]} for i in full["instances"] if i["id"] != "application"]
    return full, included


def overview(full, included):
    group_of = {slug: name for name, slugs in GROUPS for slug in slugs}
    ids = {c["id"] for c in included}
    # a group is shown as one block; its ports are the connections that cross a group boundary
    ports = {name: [] for name, _ in GROUPS}
    connections, seen_out = [], set()
    kinds = {}
    for c in full["definitions"]:
        for p in c["ports"]:
            kinds[(c["id"], p["id"])] = p
    instance_def = {i["id"]: i["definition"] for i in full["instances"]}

    def block(slug):
        return "application" if slug == "application" else group_of[slug]

    for c in full["connections"]:
        s, t = c["source"], c["target"]
        a, b = block(s["instance"]), block(t["instance"])
        # The application is drawn on its own (application_design): with it the overview exceeds the generator's size limit.
        if a == b or "application" in (a, b):
            continue
        sp = kinds[(instance_def[s["instance"]], s["port"])]
        tp = kinds[(instance_def[t["instance"]], t["port"])]
        out_id = f"{s['instance']}-{s['port']}"
        in_id = f"{t['instance']}-{t['port']}"
        if (a, out_id) not in seen_out:
            seen_out.add((a, out_id))
            ports[a].append(port(out_id, f"{s['instance']}: {s['port']}", "output", sp["type"], sp["version"]))
        ports[b].append(port(in_id, f"{t['instance']}: {t['port']}", "input", tp["type"], tp["version"], required=False))
        connections.append({"source": {"instance": a, "port": out_id}, "target": {"instance": b, "port": in_id}})

    names = {name: slugs for name, slugs in GROUPS}
    definitions, instances = [], []
    for index, (name, slugs) in enumerate(GROUPS):
        members = [s for s in slugs if s in ids]
        definitions.append({"id": f"group-{index + 1}", "name": f"{name} ({len(members)} components)", "kind": "application", "status": "example",
                            "revision": APP_REVISION, "ports": ports[name][:32], "settings": []})
        instances.append({"id": name.lower().replace(",", "").replace(" ", "-"), "name": name, "definition": f"group-{index + 1}", "configuration": {}})
    slug_of = {name: name.lower().replace(",", "").replace(" ", "-") for name, _ in GROUPS}
    wired = [{"source": {"instance": slug_of[c["source"]["instance"]], "port": c["source"]["port"]},
              "target": {"instance": slug_of[c["target"]["instance"]], "port": c["target"]["port"]}} for c in connections]
    counts = {name: len(ports[name]) for name in ports}
    return {"schemaVersion": 1, "id": "ourpoker-default-overview", "title": "OurPoker: default answers, the five groups (the application connects to every group)", "status": "example", "view": "application",
            "definitions": definitions, "instances": instances, "connections": wired}, counts


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

    over, counts = overview(full, included)
    (out / "overview.json").write_text(json.dumps(over, indent=2) + "\n")
    diagram.validate_design(copy.deepcopy(over))
    paths = diagram.generate(out / "overview.json", HERE / "page" / "diagram")
    publishable(paths[0])
    print("rendered", *paths, "ports per block", counts)

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
