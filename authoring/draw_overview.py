"""Draws page/diagram.{svg,png}: every component of the recipe by name, grouped as in paper Section 5.3, with the connections of the default design.

Called by draw_default_design.py with the evaluated default design. Needs graphviz `dot` on the path.
"""
import json
import re
import subprocess
from pathlib import Path

POKER = {"holdem-rules", "poker-hand-ranking", "poker-odds", "poker-strategy"}
BACKGROUND, TEXT, MUTED = "#101722", "#e8eef7", "#9fb0c6"


def dot_source(design, groups, version):
    present = {i["id"] for i in design["instances"] if i["id"] != "application"}
    lines = [
        "digraph recipe {",
        f'  graph [rankdir=TB, bgcolor="{BACKGROUND}", fontname="Helvetica", fontcolor="{TEXT}", compound=true, nodesep=0.25, ranksep=0.8, pad=0.4, '
        f'labelloc=t, fontsize=26, label=<<b>OurPoker {version}: the {sum(len(s) for _, s in groups)} components of the recipe</b><br/>'
        f'<font point-size="15" color="{MUTED}">Each box is one component. An arrow runs from the component that provides an interface to the one that uses it, under the default answers.</font>>];',
        f'  node [shape=box, style="rounded,filled", fontname="Helvetica", fontsize=15, fontcolor="{TEXT}", fillcolor="#1d2a3d", color="#5b7aa3", penwidth=1.3, margin="0.18,0.08", height=0.42];',
        '  edge [color="#62c6f2", arrowsize=0.7, penwidth=1.1];',
        f'  application [label=<<b>Application-specific component</b><br/><font point-size="13" color="{MUTED}">screen flow, house rules, artwork, text in four languages,<br/>lessons and end-to-end tests</font>>, '
        'fillcolor="#3b2a5c", color="#9a7ed1", penwidth=1.8, margin="0.3,0.15"];',
    ]
    anchors = {}
    for index, (name, slugs) in enumerate(groups):
        poker = all(s in POKER for s in slugs)
        border, fill, edge = ("#e6be85", "#4a3515", "#c27c0e") if poker else ("#5b7aa3", "#1d2a3d", "#5b7aa3")
        lines.append(f'  subgraph cluster_{index} {{')
        lines.append(f'    label=<<b>{name} ({len(slugs)})</b>>; fontsize=17; fontcolor="{TEXT}"; style="rounded"; color="{border}"; penwidth=1.5;')
        lines.append(f'    node [fillcolor="{fill}", color="{edge}"];')
        for slug in slugs:
            extra = ""
            if slug not in present:
                extra = f', style="rounded,filled,dashed", label=<{slug}<br/><font point-size="11" color="{MUTED}">only when updates is yes</font>>'
            lines.append(f'    "{slug}" [label="{slug}"{extra}];' if not extra else f'    "{slug}" [{extra[2:]}];')
        lines.append("  }")
        anchors[name] = slugs[0]
    for name, slugs in groups:
        lines.append(f'  application -> "{anchors[name]}" [lhead=cluster_{[g for g, _ in groups].index(name)}, color="#9a7ed1", style=dashed];')
    seen = set()
    for c in design["connections"]:
        pair = (c["source"]["instance"], c["target"]["instance"])
        if "application" in pair or pair in seen:
            continue
        seen.add(pair)
        lines.append(f'  "{pair[0]}" -> "{pair[1]}";')
    lines.append("}")
    return "\n".join(lines) + "\n"


def render(design, groups, version, page):
    source = dot_source(design, groups, version)
    svg = subprocess.run(["dot", "-Tsvg"], input=source.encode(), capture_output=True, check=True).stdout.decode()
    svg = re.sub(r"<!DOCTYPE[^>]*>\s*", "", svg)
    (page / "diagram.svg").write_text(svg)
    (page / "diagram.png").write_bytes(subprocess.run(["dot", "-Tpng", "-Gdpi=110"], input=source.encode(), capture_output=True, check=True).stdout)
    return len(svg)
