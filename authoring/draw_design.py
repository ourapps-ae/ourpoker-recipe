#!/usr/bin/env python3
"""Turns an evaluated design (aepm.recipe) into a drawing for aepm's diagram generator.

The drawing is a diagram design (schemaVersion 1): each included component's visual definition, one instance per component
carrying its effective settings, the recipe's own component as `application`, and the design's connections. It draws only.
Usage (library): drawing(design, components_directory, recipe_directory) -> dict; check it with aepm.diagram.generate.validate_design.
"""
import os
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
COMPONENTS = Path(os.environ.get("OURPOKER_COMPONENTS") or HERE.parent.parent / "components")  # the component checkouts
APPLICATION = "application"


def _read(path):
    return json.loads(Path(path).read_text())


def drawing(design, components_directory=COMPONENTS, recipe_directory=HERE, drawing_id=None, title=None):
    definitions, instances = [], []
    for component in design["components"]:
        visual = _read(Path(components_directory) / component["name"].split("/")[1] / "visual" / "definition.json")
        definitions.append(visual)
        instances.append({"id": component["id"], "name": visual["name"], "definition": visual["id"], "configuration": component["configuration"]})
    own = _read(Path(recipe_directory) / "visual" / "definition.json")
    definitions.append(own)
    instances.append({"id": APPLICATION, "name": design["title"], "definition": own["id"], "configuration": design["configuration"]})
    return {"schemaVersion": 1, "id": drawing_id or design["id"].replace("/", "."), "title": title or f"{design['title']}: {design['id']}", "status": "example",
            "view": "application", "definitions": definitions, "instances": instances, "connections": design["design"]["connections"]}
