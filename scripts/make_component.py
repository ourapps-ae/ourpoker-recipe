#!/usr/bin/env python3.12
"""Write the recipe component's manifest, asset list and visual files from what is on disk.

Usage (from anywhere):
  PYTHONPATH=<aepm checkout> python3.12 -B scripts/make_component.py [--render]

Computes `files` (everything packaged), `artefacts` (the destination map below), the asset list
(assets/ASSETS.json) and the visual definition and example, and checks every template against the
installer's own substitution rules with the default settings. Nothing here runs the recipe.
"""
import hashlib
import importlib.util
import json
import os
import re
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parent.parent
WORKSPACE = ROOT.parent.parent
COMPONENTS = Path(os.environ.get("OURPOKER_COMPONENTS") or WORKSPACE / "components")  # the component checkouts
sys.path.insert(0, str(WORKSPACE / "aepm"))  # a sibling checkout, unless PYTHONPATH already names one
from aepm import application, model  # noqa: E402
AEPM = Path(application.__file__).resolve().parent.parent

sys.path.insert(0, str(ROOT / "authoring"))
import component_imports  # noqa: E402
import make_recipe  # noqa: E402
import poker_game_adapter  # noqa: E402

NAME = "ourapps-ae/ourpoker"
# Tool pins are MAJOR.MINOR: aepm matches an installed tool's version by its leading components.
TOOLS = {"node": "26.5", "python3": "3.12", "swiftc": "6.4", "kotlinc": "2.2", "java": "26.0"}
VERSION = json.loads((Path(__file__).resolve().parent.parent / "recipe.json").read_text(encoding="utf-8"))["version"]
TITLE = "OurPoker"
SOURCE_REVISION = "19905b75dbea89fbfd424d67fe26c81aaed0e018"
KOTLIN = "app/ourapps/ourpoker"

NOT_PACKAGED_TOP = {".git", ".gitattributes", ".gitignore", ".opencode", "authoring", "scripts", "component.json", "AGENTS.md", "releases", "REVIEW.md"}
SKIPPED = {".DS_Store", "__pycache__"}

COLLECT = [
    ("applicationId", "string", "slug", "ourpoker"),
    ("applicationName", "string", "label", "OurPoker"),
    ("packageId", "string", "qualified", "app.ourapps.ourpoker"),
    ("scheme", "string", "slug", "ourpoker"),
    ("serverAddress", "string", "address", "http://localhost:8788"),
    ("webAddress", "string", "address", "http://localhost:5173"),
    ("roomPrefix", "string", "slug", "ourpoker-"),
    # The store invitation when updates are on; until one is answered it is the local web address, which is no invitation and is never offered.
    ("inviteAddress", "string", "address", "http://localhost:5173"),
    ("updatesEnabled", "boolean", "boolean", False),
    ("modeEvent", "string", "slug", "ourpoker-mode"),
    ("signingEnvironmentPrefix", "string", "environment", "OURPOKER"),
    # The answers that change the house rules (server/src/rules.ts writes them over the rules file); each is set from the recipe's question of the same meaning.
    ("maximumPlayers", "integer", "integer", 9),
    ("startingStack", "integer", "integer", 5000),
    ("levelSeconds", "integer", "integer", 600),
    ("rebuysPerPlayer", "integer", "integer", 1),
    ("decisionSeconds", "integer", "integer", 30),
    ("computerPlayers", "string", "slug", "on-request"),
    # The look answer (a theme name) and its card back, for every client: both rooms and every screen.
    ("look", "string", "slug", "night"),
    ("cardBack", "string", "identifier", "stripes"),
    # The languages answer, space-separated: the native projects carry only these.
    ("languages", "string", "label", "en fr de es"),
]

# The three configuration requirements of display-mode, video-calls and windows-desktop are optional (0.3.1), so the application
# provides no configuration port: it passes the documents in code (web/src/configuration.ts, desktop/src/configuration.cjs).
PROVIDES = [
    ("poker-game-adapter", "ae/game-adapter"),
]

# Requirements whose provider the recipe can leave out of a design (its includedWhen is not null): optional in this manifest, so
# the assembler drops the connection and the requirement may stay open (rule 8). authoring/make_recipe.py checks this list.
OPTIONAL = {"web-shell", "apple-shell", "android-shell", "desktop-host", "media-session", "guided-tour", "updates", "release-pipeline"}

# Port id (the type's last segment) -> providing component.
REQUIRES = [
    ("game-adapter", "turn-engine"), ("web-shell", "web-host"), ("apple-shell", "apple-host"), ("android-shell", "android-host"),
    ("desktop-host", "windows-desktop"), ("server-host", "server-host"), ("release-pipeline", "ourapps-release"),
    ("invitations", "invitations"), ("display-policy", "display-mode"), ("media-session", "video-calls"),
    ("table-layout", "table-layout"), ("card-graphics", "card-graphics"), ("chip-graphics", "chip-graphics"),
    ("sound-cues", "sound-cues"), ("guided-tour", "guided-tour"), ("updates", "store-update"), ("controls", "controls"),
    ("preferences", "preferences"), ("language", "translations"), ("theme", "theme"),
]


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def dump(path, value, sort=False):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(value, indent=2, ensure_ascii=False, sort_keys=sort) + "\n", encoding="utf-8")


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def walk(directory):
    out = []
    for path in sorted(Path(directory).rglob("*")):
        if path.is_file() and not any(part in SKIPPED for part in path.parts):
            out.append(path.relative_to(ROOT).as_posix())
    return out


def listed_files():
    out = []
    for entry in sorted(os.listdir(ROOT)):
        if entry in NOT_PACKAGED_TOP or entry in SKIPPED:
            continue
        path = ROOT / entry
        out.extend(walk(path) if path.is_dir() else [entry])
    return out


# ---- the asset list ----

def assets_list():
    files = [f for f in walk(ROOT / "assets") if f != "assets/ASSETS.json"]
    entries = [{"path": f[len("assets/"):], "bytes": (ROOT / f).stat().st_size, "sha256": sha256(ROOT / f)} for f in files]
    return {"format": 1, "maximumBytes": 5 * 1024 * 1024, "files": entries}


# ---- the destination map ----

def kotlin(name):
    return f"implementation/android/app/src/main/java/{KOTLIN}/{name}"


def artefact_pairs(files):
    pairs = []

    def add(source, destination):
        pairs.append((source, destination))

    for f in files:
        if f.startswith("implementation/stand-ins/apple/Sources/"):
            add(f, "ios/OurPoker/Sources/" + f[len("implementation/stand-ins/apple/Sources/"):])
        elif f.startswith("implementation/stand-ins/android/"):
            add(f, "android/" + f[len("implementation/stand-ins/android/"):])
        elif f.startswith("implementation/stand-ins/"):
            # a stand-in has the destination of the real module it replaces (stand_ins() pairs them)
            add(f, f[len("implementation/stand-ins/"):])
        elif f.startswith(("implementation/server/", "implementation/web/")):
            add(f, f[len("implementation/"):])
        elif f.startswith("implementation/apple/Sources/"):
            add(f, "ios/OurPoker/Sources/" + f[len("implementation/apple/Sources/"):])
        elif f.startswith("implementation/apple/"):
            add(f, "ios/" + f[len("implementation/apple/"):])
        elif f.startswith("implementation/android/"):
            add(f, "android/" + f[len("implementation/android/"):])
        elif f.startswith("implementation/desktop/"):
            add(f, "desktop/" + f[len("implementation/desktop/"):])
        elif f.startswith("rules/"):
            add(f, f)
        elif f.startswith("tests/e2e/server/"):
            add(f, "server/test/" + f[len("tests/e2e/server/"):])
        elif f.startswith("tests/e2e/web/"):
            add(f, "web/test/" + f[len("tests/e2e/web/"):])
        elif f.startswith("tests/e2e/verification/"):
            add(f, "verification/" + f[len("tests/e2e/verification/"):])
        elif f.startswith("tests/e2e/apple/"):
            name = f[len("tests/e2e/apple/"):]
            folder = "ios/OurPokerUITests/" if "UITests" in name else "ios/VerificationSupport/" if name == "ServerAddress.swift" else "ios/OurPokerTests/"
            add(f, folder + name)
        elif f == "tests/e2e/android/FixtureScreenTest.kt":
            add(f, f"android/app/src/androidTest/java/{KOTLIN}/FixtureScreenTest.kt")
        elif f.startswith("tests/e2e/android/"):
            add(f, f"android/app/src/test/java/{KOTLIN}/" + f[len("tests/e2e/android/"):])
        elif f.startswith("tests/fixtures/"):
            add(f, "server/fixtures/" + f[len("tests/fixtures/"):])
        elif f.startswith("implementation/repository/workflows/"):
            add(f, ".github/workflows/" + f[len("implementation/repository/workflows/"):])
        elif f == "implementation/repository/gitignore":
            add(f, ".gitignore")
        elif f.startswith("implementation/repository/"):
            add(f, f[len("implementation/repository/"):])
    add("locales/strings.json", "resources/strings.json")
    # the translations component's generator output (generate_translations), shipped so install alone gives every client its text
    for f in files:
        # the web client offers the answered languages from the full table; the native projects take theirs when
        # generate-project.ts copies the answered languages' files into the project
        if f == "locales/generated/web/strings.json":
            add(f, "web/src/strings.json")
        elif f == "locales/generated/apple/Localizable.xcstrings":
            add(f, "ios/strings/Localizable.xcstrings")
        elif f.startswith("locales/generated/android/"):
            add(f, "android/strings/" + f[len("locales/generated/android/"):])
    add("locales/lessons.json", "web/src/lessons.json")
    add("locales/lessons.json", "ios/OurPoker/Resources/lessons.json")
    add("locales/lessons.json", "android/app/src/main/res/raw/lessons.json")
    sounds = sorted(f for f in files if f.startswith("assets/sounds/"))
    for f in sounds:
        base = Path(f).name
        add(f, "web/public/sounds/" + base)
        add(f, "ios/OurPoker/Art/Sounds/" + base)
        add(f, "android/app/src/main/res/raw/snd_" + base)
    add("assets/web/sounds-manifest.json", "web/public/sounds/manifest.json")
    add("assets/web/sounds-manifest.json", "ios/OurPoker/Art/Sounds/sounds-manifest.json")
    add("assets/web/sounds-manifest.json", "android/app/src/main/res/raw/sounds_manifest.json")
    for f in files:
        if f.startswith("assets/web/art/"):
            add(f, "web/public/art/" + f[len("assets/web/art/"):])
        elif f.startswith("assets/art/") and f != "assets/art/icon.png":
            base = Path(f).name
            add(f, "ios/OurPoker/Art/" + base)
            add(f, "android/app/src/main/res/drawable-nodpi/" + base.replace("-", "_"))
    add("assets/web/manifest.json", "web/public/art/manifest.json")
    add("assets/web/icon.png", "web/public/icon.png")
    add("assets/web/icon-192.png", "web/public/icon-192.png")
    for f in files:
        if f.startswith("assets/apple/Resources/"):
            add(f, "ios/OurPoker/Resources/Assets.xcassets/" + f[len("assets/apple/Resources/"):])
        elif f.startswith("assets/apple/tv/Assets.xcassets/") and f.endswith(".png"):
            add(f, "ios/OurPokerTV/Assets.xcassets/" + f[len("assets/apple/tv/Assets.xcassets/"):])
        elif f.startswith("assets/android/"):
            add(f, "android/app/src/main/res/drawable/" + Path(f).name)
    return pairs


# ---- the manifest ----

def suite():
    return {"id": "portable", "root": "package", "argv": ["node", "--test", "tests/portable.test.ts"], "cwd": ".", "prepare": [],
            "tools": {"node": TOOLS["node"]}, "fixtures": ["locales/strings.json", "rules/texas-holdem-house-rules.json", "tests/fixtures"],
            "locks": ["tools.lock.json"], "network": False, "timeoutSeconds": 120, "expectedExit": 0, "scope": "required-local", "requirements": []}


def provided_port(component, type_):
    manifest = read(COMPONENTS / component / "component.json")
    for p in manifest["provides"]:
        if p["type"] == type_:
            return p["id"]
    raise SystemExit(f"{component} provides no {type_}")


def port_type(component):
    return None


def conditional_components():
    """Components the recipe can leave out (their includedWhen is not null), with that condition as canonical JSON."""
    manifests = {s: read(COMPONENTS / s / "component.json") for s in make_recipe.ORDER}
    return {s: json.dumps(c, sort_keys=True) for s, c in make_recipe.conditions(manifests).items() if c is not None}


# Files that need an optional component without naming its path: the web project's package files declare livekit-client,
# which only video-calls' web code imports (the stand-in package files at the same destinations declare no livekit-client).
# Swift and Kotlin name a component's types, not its path; each of these has a stand-in at the same destination.
SWIFT_SOURCES = "implementation/apple/Sources/"
KOTLIN_SOURCES = f"implementation/android/app/src/main/java/{KOTLIN}/"
DECLARED = {
    "implementation/web/package.json": "video-calls", "implementation/web/package-lock.json": "video-calls",
    SWIFT_SOURCES + "Video.swift": "video-calls", SWIFT_SOURCES + "SeatScreen.swift": "video-calls",
    SWIFT_SOURCES + "Lessons.swift": "guided-tour", SWIFT_SOURCES + "Updates.swift": "store-update",
    KOTLIN_SOURCES + "Video.kt": "video-calls", KOTLIN_SOURCES + "ui/SeatScreen.kt": "video-calls",
    KOTLIN_SOURCES + "ui/Lessons.kt": "guided-tour", KOTLIN_SOURCES + "Updates.kt": "store-update",
    # the desktop project exists only for Windows
    "implementation/desktop/package.json": "windows-desktop", "implementation/desktop/package-lock.json": "windows-desktop",
    "implementation/desktop/src/configuration.cjs": "windows-desktop",
}


# The repository files (GitHub Actions, their scripts, the release description): installed with the release pipeline
# (ourapps-release, in the design when builds are published or the releases answer is yes) and the host each one builds.
RELEASE = "ourapps-release"
REPOSITORY = {
    "workflows/ci-server.yml": [], "workflows/release.yml": [], "release/app.json": [],
    "workflows/ci-web.yml": ["web-host"], "workflows/ci-android.yml": ["android-host"],
    "workflows/platform-packages.yml": ["windows-desktop"], "scripts/build-windows.sh": ["windows-desktop"], "scripts/inspect-windows.ps1": ["windows-desktop"],
    "workflows/apple-testflight.yml": ["apple-host"], "scripts/build-apple-testflight.sh": ["apple-host"], "scripts/build-ipa.sh": ["apple-host"],
}


def repository_condition(source):
    """The `component` of a repository file: the release pipeline, and with it the host the file builds (a list: all of them)."""
    hosts = REPOSITORY[source[len("implementation/repository/"):]]
    return RELEASE if not hosts else sorted([RELEASE, *hosts])


def stand_ins(pairs, conditions):
    """source -> the component whose absence installs it: a stand-in under implementation/stand-ins/ replaces the real file
    with its destination, which must be conditional (aepm installs one when the component is in, the other when it is not)."""
    real = {d: s for s, d in pairs if not s.startswith("implementation/stand-ins/")}
    out = {}
    for source, destination in pairs:
        if source.startswith("implementation/stand-ins/"):
            twin = real.get(destination)
            if twin is None or twin not in conditions:
                raise SystemExit(f"{source}: no conditional file at {destination} to stand in for")
            out[source] = conditions[twin]
    return out


def conditions_of(pairs):
    """source -> the `component` its artefact is installed for, or nothing. A file is conditional on the optional components its
    paths name; a test file also on those of the application files it imports (a test of an optional part is installed with the
    part). Components the recipe includes under the same condition (computer-players and poker-strategy) count as one: the first by
    name. Components under different conditions cannot be one value: a host component (web, Apple, Android, Windows) wins, then
    the first by name, and authoring/check_conditional_artefacts.py reports the file for any design that leaves out another."""
    conditional = conditional_components()
    destinations = {d: s for s, d in pairs if not s.startswith("implementation/stand-ins/")}
    reached = {s: {c for c, _ in component_imports.references(ROOT / s) if c in conditional} | ({DECLARED[s]} if s in DECLARED else set())
               for s, _ in pairs if not s.startswith("implementation/stand-ins/")}
    changed = True
    while changed:
        changed = False
        for source, destination in pairs:
            if not source.startswith("tests/"):
                continue
            for specifier in component_imports.relative_imports(ROOT / source):
                for target in component_imports.relative_match(destination, specifier, set(destinations)):
                    extra = reached[destinations[target]] - reached[source]
                    if extra:
                        reached[source] |= extra
                        changed = True
    hosts = {"web-host", "apple-host", "android-host", "windows-desktop"}
    same = {}  # components under one condition are one choice
    for c, condition in conditional.items():
        same.setdefault(condition, []).append(c)
    out = {}
    for source, names in reached.items():
        choices = {min(same[conditional[c]]) for c in names}
        if choices:
            out[source] = min(choices, key=lambda c: (c not in hosts, c))
    return out


def build_manifest(files):
    collect = [{"id": i, "type": t, "grammar": g, "required": True, "secret": False, "default": d} for i, t, g, d in COLLECT]
    requires = []
    for port, component in REQUIRES:
        type_ = "ae/" + port
        # the type is the providing port's type; check it is real
        provided_port(component, type_)
        entry = {"id": port, "type": type_, "version": "1.0.0", "path": f"interfaces/required-{port}.json"}
        if port in OPTIONAL:
            entry["optional"] = True
        requires.append(entry)
    provides = [{"id": i, "type": t, "version": "1.0.0", "path": f"interfaces/{i}.json"} for i, t in PROVIDES]
    pairs = artefact_pairs(files)
    settings = {s[0] for s in COLLECT}
    # templates are exactly the files that name a setting as {{id}}; GitHub's ${{ ... }} expressions are not tokens
    templated = {src for src in {p[0] for p in pairs} if (ROOT / src).suffix not in (".png", ".jpg", ".wav")
                 and settings & set(application.TOKEN.findall((ROOT / src).read_text(encoding="utf-8", errors="ignore")))}
    conditions = conditions_of(pairs)
    without = stand_ins(pairs, conditions)
    artefacts = []
    for s, d in pairs:
        item = {"source": s, "destination": d, "template": s in templated, "executable": False}
        if s.startswith("implementation/repository/") and s != "implementation/repository/gitignore":
            item["component"] = repository_condition(s)
        elif s in conditions:
            item["component"] = conditions[s]
        if s in without:
            item["withoutComponent"] = without[s]
        artefacts.append(item)
    packaged = sorted(set(files) | {"INSTRUCTIONS.md"})
    return {
        "format": 1, "kind": "recipe",
        "identity": {"name": NAME, "version": VERSION, "sourceRevision": SOURCE_REVISION, "sourceTreeDigest": "0" * 64, "licence": "Apache-2.0"},
        "facilities": [{"id": "application", "description": "OurPoker application-specific component: screen flow, house rules, text, lessons, artwork, wiring and end-to-end tests"}],
        "documents": {"contract": "CONTRACT.md", "interfaces": sorted(f for f in files if f.startswith("interfaces/")) + ["suitability.json"],
                      "examples": ["examples/configuration.ts"], "licenceNotice": "LICENCE"},
        "collect": collect,
        "files": [{"path": p, "executable": False} for p in packaged],
        "artefacts": artefacts, "dependencies": [], "provides": provides, "requires": requires,
        "visual": {"definition": "visual/definition.json", "examples": ["visual/examples/connected.json"],
                   "outputs": ["visual/output/connected.svg", "visual/output/connected.png"], "descriptions": ["visual/output/description.md"]},
        "capabilities": {"hosts": [], "secrets": [], "writes": sorted({a["destination"] for a in artefacts})},
        "infrastructure": {"accounts": [], "costStatus": "unmeasured",
                           "deployedReason": "Deploys nothing itself: the server, web, native and desktop builds are produced by the components the recipe selects."},
        "verification": [suite()],
        "upgrade": {"policy": "patch", "migration": "files-only"},
    }


def check_templates(manifest):
    """Run the installer's own substitution on every template, and on every destination."""
    values = {s["id"]: s["default"] for s in manifest["collect"]}
    for a in manifest["artefacts"]:
        application.substitute(a["destination"], manifest["collect"], values, destination=True)
        if a["template"]:
            text = (ROOT / a["source"]).read_text(encoding="utf-8")
            application.substitute(text, manifest["collect"], values, shell=application.shell_template(a["destination"], text))


# ---- the visual files ----

def app_definition(manifest):
    ports = []
    for r in manifest["requires"]:
        ports.append({"id": r["id"], "name": r["id"].replace("-", " ").capitalize(), "direction": "input", "kind": "interface", "type": r["type"],
                      "version": r["version"], "required": not r.get("optional", False), "cardinality": "one"})
    for p in manifest["provides"]:
        ports.append({"id": p["id"], "name": p["id"].replace("-", " ").capitalize(), "direction": "output", "kind": "interface", "type": p["type"], "version": p["version"]})
    settings = []
    for s in manifest["collect"]:
        entry = {"id": s["id"], "name": s["id"], "type": "number" if s["type"] == "integer" else s["type"], "required": s["required"], "secret": s["secret"]}
        if "default" in s:
            entry["default"] = s["default"]
        settings.append(entry)
    return {"id": "ourapps-ae.ourpoker", "name": TITLE, "kind": "application", "status": "example", "revision": VERSION, "ports": ports, "settings": settings}


def connected_example(manifest, definition):
    """The component beside one stand-in for the rest of the application: it supplies every required
    interface and takes the provided ones (the 39 components are drawn in page/ and authoring/designs)."""
    stand_in_ports = []
    for r in manifest["requires"]:
        stand_in_ports.append({"id": r["id"], "name": r["id"].replace("-", " ").capitalize(), "direction": "output", "kind": "interface", "type": r["type"], "version": r["version"]})
    for p in manifest["provides"]:
        stand_in_ports.append({"id": p["id"], "name": p["id"].replace("-", " ").capitalize(), "direction": "input", "kind": "interface", "type": p["type"],
                               "version": p["version"], "required": p["id"] != "poker-game-adapter", "cardinality": "one"})
    connections = [{"source": {"instance": "rest", "port": r["id"]}, "target": {"instance": "application", "port": r["id"]}} for r in manifest["requires"]]
    connections += [{"source": {"instance": "application", "port": p["id"]}, "target": {"instance": "rest", "port": p["id"]}} for p in manifest["provides"]]
    return {"schemaVersion": 1, "id": "ourpoker-connected", "title": "OurPoker application-specific component: connected", "status": "example",
            "view": "application",
            "definitions": [definition, {"id": "rest", "name": "The recipe's other components", "kind": "application", "status": "example", "revision": "0.1.0", "ports": stand_in_ports, "settings": []}],
            "instances": [{"id": "application", "name": TITLE, "definition": definition["id"], "configuration": {}},
                          {"id": "rest", "name": "Other components", "definition": "rest", "configuration": {}}],
            "connections": connections}


def render(example):
    generator = AEPM / "aepm" / "diagram" / "generate.py"
    env = {"PATH": os.environ.get("PATH", os.defpath), "PYTHONDONTWRITEBYTECODE": "1", "PYTHONPATH": str(AEPM), "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8", "HOME": os.environ.get("HOME", "/")}
    out = ROOT / "visual/output"
    out.mkdir(parents=True, exist_ok=True)
    result = subprocess.run([sys.executable, "-B", str(generator), str(ROOT / "visual/examples/connected.json"), "--output-prefix", str(out / "connected")], env=env, capture_output=True, text=True, timeout=180)
    if result.returncode:
        raise SystemExit("diagram generator failed: " + (result.stderr.strip() or result.stdout.strip()))
    svg = out / "connected.svg"
    svg.write_text(re.sub(r"<!DOCTYPE[^>]*>\s*", "", svg.read_text()))


# ---- the interface files ----

def interfaces_json(manifest):
    """One standard document per provided port (interfaces/<port>.json), and interfaces/required-<port>.json, a byte copy of the
    providing component's document."""
    documents = {"poker-game-adapter": poker_game_adapter.document()}
    out = {}
    for port, component in REQUIRES:
        provider = read(COMPONENTS / component / "component.json")
        source = next(q["path"] for q in provider["provides"] if q["type"] == "ae/" + port)
        (ROOT / f"interfaces/required-{port}.json").write_bytes((COMPONENTS / component / source).read_bytes())
    for p in manifest["provides"]:
        document = documents[p["id"]]
        assert (document["info"]["title"], document["info"]["version"]) == (p["type"], p["version"]), p["id"]
        out[f"interfaces/{p['id']}.json"] = document
    return out


def generate_translations():
    """Run the translations component's generator on locales/strings.json into locales/generated/ (web, apple, android)."""
    out = ROOT / "locales/generated"
    generator = COMPONENTS / "translations/implementation/scripts/generate.py"
    if out.exists():
        import shutil
        shutil.rmtree(out)
    result = subprocess.run([sys.executable, "-B", str(generator), "--strings", str(ROOT / "locales/strings.json"), "--web", str(out / "web"),
                             "--apple", str(out / "apple"), "--android", str(out / "android")], capture_output=True, text=True, timeout=120)
    if result.returncode:
        raise SystemExit("translations generator failed: " + (result.stderr.strip() or result.stdout.strip()))


# Every place a document names the package's own version, rewritten from recipe.json's version on each run.
VERSION_PLACES = {
    "INSTRUCTIONS.md": [r"(Package `ourapps-ae/ourpoker` )\d+\.\d+\.\d+", r"(this file belongs to )\d+\.\d+\.\d+", r"(ourpoker@)\d+\.\d+\.\d+"],
    "CONTRACT.md": [r"(Package `ourapps-ae/ourpoker` version )\d+\.\d+\.\d+"],
    "INTEGRATION-GAPS.md": [r"(# OurPoker integration status \(recipe )\d+\.\d+\.\d+"],
    "REVIEW.md": [r"(package `ourapps-ae/ourpoker` )\d+\.\d+\.\d+", r"(ourpoker@)\d+\.\d+\.\d+"],
    "page/description.md": [r"(Version )\d+\.\d+\.\d+", r"(ourpoker@)\d+\.\d+\.\d+", r"(STORE )\d+\.\d+\.\d+"],
    "AGENTS.md": [r"(Version )\d+\.\d+\.\d+"],
    ".opencode/knowledge/00-index.md": [r"(Package `ourapps-ae/ourpoker` version )\d+\.\d+\.\d+"],
}


def stamp_versions():
    for name, patterns in VERSION_PLACES.items():
        path = ROOT / name
        text = path.read_text(encoding="utf-8")
        for pattern in patterns:
            text = re.sub(pattern, lambda m: m.group(1) + VERSION, text)
        path.write_text(text, encoding="utf-8")


def tools_lock():
    return {"format": 1, "dependencies": [], "tools": TOOLS}


def main(argv):
    do_render = "--render" in argv
    dump(ROOT / "tools.lock.json", tools_lock())
    stamp_versions()
    generate_translations()
    dump(ROOT / "assets/ASSETS.json", assets_list())
    manifest = build_manifest(listed_files())
    for path, document in interfaces_json(manifest).items():
        dump(ROOT / path, document)
    definition = app_definition(manifest)
    dump(ROOT / "visual/definition.json", definition)
    dump(ROOT / "visual/examples/connected.json", connected_example(manifest, definition))
    if do_render:
        render(None)
    # the manifest lists the visual outputs and the asset list, so they exist before the file list is computed
    manifest = build_manifest(listed_files())
    check_templates(manifest)
    dump(ROOT / "component.json", manifest, sort=True)
    marked = [a for a in manifest["artefacts"] if "component" in a]
    print("stand-ins", sum(1 for a in manifest["artefacts"] if "withoutComponent" in a))
    print("files", len(manifest["files"]), "artefacts", len(manifest["artefacts"]), "templates", sum(a["template"] for a in manifest["artefacts"]),
          "conditional", len(marked), {c: sum(1 for a in marked if a["component"] == c) for c in sorted({a["component"] for a in marked if isinstance(a["component"], str)})},
          "with the release pipeline", {"+".join(a["component"]): sum(1 for b in marked if b["component"] == a["component"]) for a in marked if isinstance(a["component"], list)})


if __name__ == "__main__":
    main(sys.argv[1:])
