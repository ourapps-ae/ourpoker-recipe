#!/usr/bin/env python3
"""Writes recipe.json for ourapps-ae/ourpoker in the decided format (component-standard.md, "Recipe evaluation rules").

Everything that can be read from the components is read from them: names, versions, port ids and which requirements are
optional come from each component.json; connections are derived from the manifests. Settings, questions and answer sets
are written below. Nothing here evaluates the recipe (aepm's evaluator, aepm.recipe, does).
Usage: python3 -B authoring/make_recipe.py
"""
import os
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
COMPONENTS = Path(os.environ.get("OURPOKER_COMPONENTS") or HERE.parent.parent / "components")  # the component checkouts

# Order follows paper Section 5.3.
ORDER = [
    "web-host", "apple-host", "android-host", "windows-desktop", "server-host", "ourapps-release", "store-update",
    "realtime-rooms", "room-directory", "guest-identity", "presence", "invitations", "private-views", "display-mode",
    "video-calls", "preferences",
    "turn-engine", "game-clock", "seating", "fair-shuffle", "card-deck", "computer-players", "chip-ledger",
    "level-schedule", "tournament", "round-history", "rules-settings",
    "poker-hand-ranking", "poker-odds", "holdem-rules", "poker-strategy",
    "theme", "controls", "table-layout", "card-graphics", "chip-graphics", "sound-cues", "guided-tour", "translations",
]
APPLICATION = "application"

APPLICATION_ID = "ourpoker"
BUNDLE_ID = f"app.ourapps.{APPLICATION_ID}"  # the application derives it unless the bundleId question is answered
COMPUTER_NAMES = "Robin Sam Alex Jordan Casey Morgan Taylor Riley"
RULES_FILE = "texas-holdem-house-rules"

# Settings fixed by the recipe's author. A setting a question sets is given in QUESTIONS, never here, and no secret
# reference is written here (a secret setting is set only by a {"ref": ...} effect). Numbers the house rules file states
# (rules/texas-holdem-house-rules.json) are not repeated: the rules file is their one source and the application builds the
# components from it (tests/recipe.test.ts checks none is restated). guest-identity keeps its own defaults, which the
# application also uses.
CONFIGURATION = {
    "web-host": {"applicationId": APPLICATION_ID, "applicationName": "OurPoker", "shortName": "OurPoker",
                 "themeColour": "primary", "backgroundColour": "background"},
    "apple-host": {"bundleIdentifier": BUNDLE_ID, "displayName": "OurPoker", "scheme": "OurPoker"},
    "android-host": {"packageId": BUNDLE_ID, "applicationName": "OurPoker"},
    "server-host": {"roomPrefix": f"{APPLICATION_ID}-"},
    "ourapps-release": {"applicationId": APPLICATION_ID, "applicationName": "OurPoker", "bundleIdentifier": BUNDLE_ID},
    "presence": {"awayAfterSeconds": 30, "dropAfterSeconds": 1800, "hostAbsentRule": "pause"},
    "invitations": {"codeLength": 6},
    "turn-engine": {"settleMs": 4000, "staleMinutes": 30, "standingsSeconds": 20, "lobbyDropSeconds": 60},
    "seating": {"hostRemovesPeople": False},
    "fair-shuffle": {"source": "secure"},
    "card-deck": {"decks": 1, "jokers": False},
    "computer-players": {"names": COMPUTER_NAMES, "thinkMinMs": 300, "thinkSpreadMs": 1200, "minimumGapMs": 4000, "rebuyDelayMs": 4000},
    "tournament": {"tiebreak": "stackAtDeal"},
    "round-history": {"maxRounds": 50},
    "rules-settings": {"rulesFile": RULES_FILE, "strict": True},
    "poker-odds": {"sampleBoards": 2000, "cacheSize": 500},
    "holdem-rules": {"revealAtRunout": True},
    "poker-strategy": {"difficulty": 2, "aggression": 50},
    "sound-cues": {"soundManifest": "sounds", "defaultMuted": False},
    "card-graphics": {"cornerStyle": "rounded", "cardWidth": 56},
    "chip-graphics": {"denominations": "casino 5000 1000 500 100 25 5 1", "chipColours": "casino"},
    "preferences": {"defaultSound": True, "defaultMicrophoneOn": True, "defaultCameraOn": True},
}

ALL_TARGETS = ["web", "ios", "android", "macos", "windows", "tvos"]
ALL_LANGUAGES = ["en", "fr", "de", "es"]
COMPUTER_MODES = ["none", "on-request", "fill-empty"]


def contains(value):
    """CEL: the devices answer (a set) includes `value`."""
    return f"'{value}' in targets"


# Inclusion is only by includedWhen (rule 4), a CEL expression over the answers. The question "targets" is which devices.
INCLUDED_WHEN = {
    # the Windows build packs the web client, so the web project is in for Windows too
    "web-host": contains("web") + " || " + contains("windows"),
    "apple-host": " || ".join(contains(t) for t in ("ios", "macos", "tvos")),
    "android-host": contains("android"),
    "windows-desktop": contains("windows"),
    "guided-tour": "lessons",
    "video-calls": "video",
    "store-update": "updates",
}
# computer-players and poker-strategy are in the design unless the computer players answer is none (turn-engine's
# `computer-players` requirement is optional, so nothing is left unconnected; main() asserts it).
WITHOUT_COMPUTERS = "computerPlayers != 'none'"


def conditions(manifests):
    """includedWhen of every conditional component (the rest are always in the design)."""
    computers = next(p for p in manifests["turn-engine"]["requires"] if p["type"] == "ae/computer-players")
    assert computers.get("optional") is True, "turn-engine's computer-players requirement must be optional"
    return {**INCLUDED_WHEN, "computer-players": WITHOUT_COMPUTERS, "poker-strategy": WITHOUT_COMPUTERS}

QUESTIONS = [
    {"id": "targets", "ask": "Which devices should the game run on?",
     "askAgent": "Infer from the request (phone, tablet, television, computer, browser); ask only if no device is named.",
     "type": "set", "options": ALL_TARGETS, "default": ALL_TARGETS,
     "effects": [{"sets": {"ourapps-release.targets": "$answer", "apple-host.targets": "$answer"}}]},
    {"id": "webAddress", "ask": "At which web address will the web version be served?",
     "askAgent": "Ask only when the web is a target; keep http://localhost:5173 for local use, otherwise the developer's own https address (the server refuses a plain http origin other than localhost).",
     "askWhen": contains("web"), "type": "text", "default": "http://localhost:5173",
     "effects": [{"sets": {"web-host.webAddress": "$answer", "application.webAddress": "$answer", "server-host.allowedOrigins": "$answer", "invitations.inviteAddress": "$answer"}}]},
    {"id": "bundleId", "ask": "Which bundle identifier should the phone, tablet, television and Mac apps carry (for example com.yourname.poker)? Leave empty to use the one the application derives.",
     "askAgent": "Leave empty unless the developer names one; the application derives app.ourapps.<applicationId>.",
     "type": "text", "default": "",
     "effects": [{"sets": {"apple-host.bundleIdentifier": "$answer", "android-host.packageId": "$answer", "ourapps-release.bundleIdentifier": "$answer", "application.packageId": "$answer"}}]},
    {"id": "scale", "ask": "How many people will use it, and how often?",
     "askAgent": "Choose from the group size and rhythm described: a dozen friends meeting weekly is small; a club or a few dozen people playing daily is medium; 100 or more people playing continuously is large.",
     "type": "choice", "options": ["small", "medium", "large"], "default": "small", "effects": []},
    {"id": "languages", "ask": "Which languages should the game speak?",
     "askAgent": "Use the languages the request names; otherwise keep all four.",
     "type": "set", "options": ALL_LANGUAGES, "default": ALL_LANGUAGES, "effects": [{"sets": {"translations.languages": "$answer", "application.languages": "$answer"}}]},
    {"id": "look", "ask": "Which look should the game have?",
     "askAgent": "Pick night (dark) or lounge (warm) from any style the request gives; otherwise keep night.",
     "type": "choice", "options": ["night", "lounge"], "default": "night",
     "effects": [{"sets": {"theme.themeName": "$answer", "card-graphics.backStyle": {"map": {"night": "stripes", "lounge": "plain"}}}}]},
    {"id": "players", "ask": "What is the largest number of players at one table (2 to 9)?",
     "askAgent": "Use the largest group that will sit together; keep 9 if unstated.",
     "type": "integer", "min": 2, "max": 9, "default": 9,
     "effects": [{"sets": {"seating.maximumPlayers": "$answer", "holdem-rules.seats": "$answer", "chip-ledger.seats": "$answer", "room-directory.roomCapacity": "$answer", "application.maximumPlayers": "$answer"}}]},
    {"id": "startingChips", "ask": "How many chips does each player start with?",
     "askAgent": "Use the number in the request; keep 5000 if unstated.",
     "type": "integer", "min": 100, "max": 1000000, "default": 5000,
     "effects": [{"sets": {"tournament.startingStack": "$answer", "tournament.rebuyStack": "$answer", "application.startingStack": "$answer"}}]},
    {"id": "levelSeconds", "ask": "How many seconds does each blind level last?",
     "askAgent": "Convert minutes to seconds; keep 600 (10 minutes) if unstated.",
     "type": "integer", "min": 60, "max": 3600, "default": 600,
     "effects": [{"sets": {"level-schedule.levelSeconds": "$answer", "application.levelSeconds": "$answer"}}]},
    {"id": "rebuys", "ask": "How many rebuys may each player take (0 for none)?",
     "askAgent": "Use 0 if the request says no rebuys; keep 1 (until level 3) if unstated.",
     "type": "integer", "min": 0, "max": 5, "default": 1,
     "effects": [{"sets": {"tournament.rebuysPerPlayer": "$answer", "application.rebuysPerPlayer": "$answer"}}]},
    {"id": "decisionSeconds", "ask": "How many seconds does a player have to act before the game checks or folds for them?",
     "askAgent": "Keep 30 unless the request names a pace.",
     "type": "integer", "min": 5, "max": 300, "default": 30,
     "effects": [{"sets": {"game-clock.decisionSeconds": "$answer", "turn-engine.decisionSeconds": "$answer", "application.decisionSeconds": "$answer"}}]},
    {"id": "computerPlayers", "ask": "Should computer players be available? none: never; on-request: a person adds one and one plays for someone who is away; fill-empty: also fills every empty seat when the game starts.",
     "askAgent": "on-request unless the request says people only (none) or asks for full tables (fill-empty).",
     "type": "choice", "options": COMPUTER_MODES, "default": "on-request",
     "effects": [{"sets": {"computer-players.mode": "$answer", "application.computerPlayers": "$answer"}}]},
    {"id": "video", "ask": "Should players see and hear each other by video?",
     "askAgent": "No if the request says no video or the people share a room; when yes the developer supplies the video service address and the key and secret by reference.",
     "type": "boolean", "default": True, "effects": []},
    {"id": "videoServiceUrl", "ask": "What is the web address of your LiveKit video service (leave empty to set it later)?",
     "askAgent": "Ask only when video is on; the developer's own LiveKit address, never invented.",
     "askWhen": "video", "type": "text", "default": "",
     "effects": [{"sets": {"video-calls.serviceUrl": "$answer"}}]},
    {"id": "videoKey", "ask": "Under which name is the video service API key kept in your secret store?",
     "askAgent": "Ask only when video is on; a reference name, never the key.",
     "askWhen": "video", "type": "secretRef",
     "effects": [{"sets": {"video-calls.keyReference": {"ref": "videoKey"}}}]},
    {"id": "videoSecret", "ask": "Under which name is the video service API secret kept in your secret store?",
     "askAgent": "Ask only when video is on; a reference name, never the secret.",
     "askWhen": "video", "type": "secretRef",
     "effects": [{"sets": {"video-calls.secretReference": {"ref": "videoSecret"}}}]},
    {"id": "lessons", "ask": "Should the game teach new players with step-by-step lessons?",
     "askAgent": "Yes unless the request says players already know the game.",
     "type": "boolean", "default": True, "effects": []},
    {"id": "server", "ask": "Where should the server run: on a hosting provider (Cloudflare) or on your own hardware?",
     "askAgent": "Ask the developer; never guess a hosting account. cloudflare needs the developer's Cloudflare account; own-hardware needs a machine. The cost and size of the choice are picked from the scale answer.",
     "type": "choice", "options": ["cloudflare", "own-hardware"], "effects": []},
    {"id": "hostingAccount", "ask": "Under which name is your Cloudflare account kept in your secret store?",
     "askAgent": "Ask only for a hosting provider; a reference name (lowercase letters, digits, hyphens), never the account key.",
     "askWhen": "server == 'cloudflare'", "type": "secretRef",
     "effects": [{"sets": {"server-host.accountReference": {"ref": "hostingAccount"}}}]},
    {"id": "serverAddress", "ask": "At which address does the server answer? Keep http://localhost:8788 until the server is deployed; after the first deploy, give the address it reports.",
     "askAgent": "Keep http://localhost:8788 for local use and for the first install; after the server is deployed, answer with its https address (Cloudflare reports it, own hardware is the developer's own) and rebuild the clients. Never guess a domain.",
     "type": "text", "default": "http://localhost:8788",
     "effects": [{"sets": {"application.serverAddress": "$answer"}}]},
    {"id": "updates", "ask": "Should installed apps offer new versions through ourapps.app?",
     "askAgent": "No unless the request mentions updates or keeping the app current.",
     "type": "boolean", "default": False, "effects": [{"sets": {"application.updatesEnabled": "$answer"}}]},
    {"id": "storeInvitation", "ask": "What is your ourapps.app store invitation link (leave empty to set it later)?",
     "askAgent": "Ask only when updates are on; the developer's own link, never invented.",
     "askWhen": "updates", "type": "text", "default": "",
     "effects": [{"sets": {"store-update.inviteAddress": "$answer", "application.inviteAddress": "$answer"}}]},
    {"id": "storeCredentials", "ask": "Under which name are your app store credentials kept in your secret store?",
     "askAgent": "Ask only when updates are on or iPhone and iPad is a target (the release pipeline has no store call and no iOS job without it); a reference name, never the credentials.",
     "askWhen": "updates || " + contains("ios"), "type": "secretRef", "effects": [{"sets": {"ourapps-release.storeCredentials": {"ref": "storeCredentials"}}}]},
    {"id": "androidSigning", "ask": "Under which name is your Android signing key kept in your secret store?",
     "askAgent": "Ask only when Android is a target; a reference name, never the key.",
     "askWhen": contains("android"), "type": "secretRef",
     "effects": [{"sets": {"ourapps-release.androidSigning": {"ref": "androidSigning"}}}]},
    {"id": "webDeploy", "ask": "Under which name is your web deployment key kept in your secret store?",
     "askAgent": "Ask only when the web is a target; a reference name, never the key.",
     "askWhen": contains("web"), "type": "secretRef",
     "effects": [{"sets": {"ourapps-release.webDeploy": {"ref": "webDeploy"}}}]},
]

# Server provider and size are chosen by selection (rule 7); the server answer restricts the candidates.
JOBS = [
    {"id": "server", "overrideQuestion": "server",
     "candidates": [{"component": "ourapps-ae/server-host", "profile": p} for p in ("cloudflare-free", "cloudflare-paid", "own-hardware")]},
    {"id": "realtime", "overrideQuestion": "server",
     "candidates": [{"component": "ourapps-ae/realtime-rooms", "profile": p} for p in ("free", "paid", "own-hardware")]},
    {"id": "video", "candidates": [{"component": "ourapps-ae/video-calls", "profile": p} for p in ("free", "paid", "scale")]},
]

SCALE = {"question": "scale", "bands": [
    {"id": "small", "label": "small: fewer than 10 people, occasional use", "load": {"concurrentPeople": 10, "requestsPerDay": 2000, "storedMegabytes": 100}},
    {"id": "medium", "label": "medium: up to 100 people, daily use", "load": {"concurrentPeople": 100, "requestsPerDay": 50000, "storedMegabytes": 1000}},
    {"id": "large", "label": "large: 100 or more people, continuous use", "load": {"concurrentPeople": 1000, "requestsPerDay": 1000000, "storedMegabytes": 10000}},
]}

DEFAULT_ANSWERS = {
    "targets": ALL_TARGETS, "scale": "small", "languages": ALL_LANGUAGES, "look": "night", "players": 9, "startingChips": 5000,
    "levelSeconds": 600, "rebuys": 1, "decisionSeconds": 30, "computerPlayers": "on-request", "video": True, "lessons": True,
    "server": "cloudflare", "updates": False,
    # Reference names (never values). Each is used only where its question is asked; answer sets keep the ones that apply.
    "videoKey": "ourpoker/video-key", "videoSecret": "ourpoker/video-secret", "hostingAccount": "ourpoker-cloudflare-account",
    "storeCredentials": "ourpoker/store-credentials", "androidSigning": "ourpoker/android-signing", "webDeploy": "ourpoker/web-deploy",
}
REFERENCE_ASKED = {
    "videoKey": lambda a: a["video"], "videoSecret": lambda a: a["video"], "hostingAccount": lambda a: a["server"] == "cloudflare",
    "storeCredentials": lambda a: a["updates"] or "ios" in a["targets"], "androidSigning": lambda a: "android" in a["targets"], "webDeploy": lambda a: "web" in a["targets"],
}
INVITATION = "https://ourapps.app/l/0123456789abcdef01234567"


def answers(**changes):
    merged = {**DEFAULT_ANSWERS, **changes}
    return {k: v for k, v in merged.items() if k not in REFERENCE_ASKED or REFERENCE_ASKED[k](merged)}


ANSWER_SETS = [
    {"id": "book-club", "answers": answers(targets=["ios", "android", "tvos"], languages=["en", "fr"], video=False, startingChips=3000, scale="small")},
    {"id": "poker-league", "answers": answers(scale="medium", updates=True, storeInvitation=INVITATION, webAddress="https://poker.acme.io")},
    {"id": "company-event", "answers": answers(scale="large", server="own-hardware", updates=True, storeInvitation=INVITATION, webAddress="https://poker.acme.io")},
    {"id": "company-event-hosted", "answers": answers(scale="large", server="cloudflare", updates=True, storeInvitation=INVITATION, webAddress="https://poker.acme.io")},
    {"id": "tv-only", "answers": answers(targets=["tvos"], languages=["en"], video=False, lessons=False)},
    {"id": "browser-only-no-extras", "answers": answers(targets=["web"], computerPlayers="none", lessons=False, video=False, updates=False, rebuys=0)},
    {"id": "large-paid-host", "answers": answers(scale="large", server="cloudflare", look="lounge", players=6, rebuys=3, computerPlayers="fill-empty",
                                                 bundleId="io.acme.poker", webAddress="https://poker.acme.io", videoServiceUrl="https://video.acme.io")},
    {"id": "clinic", "answers": answers(targets=["web", "windows"], scale="small", server="own-hardware", languages=["en", "es"], video=False, lessons=False,
                                        webAddress="https://clinic.example")},
    {"id": "no-computers", "answers": answers(targets=["web", "android"], computerPlayers="none", webAddress="https://poker.acme.io")},
    {"id": "web-own-hardware", "answers": answers(targets=["web"], server="own-hardware", languages=["en", "fr"], video=False, lessons=False, computerPlayers="none")},
    {"id": "native-no-lessons", "answers": answers(targets=["ios", "android", "tvos"], languages=["en", "fr"], lessons=False, updates=True, storeInvitation=INVITATION)},
    {"id": "windows-only", "answers": answers(targets=["windows"], server="own-hardware", video=False, serverAddress="https://poker.clinic.example")},
]


def read(path):
    return json.loads(Path(path).read_text())


def connections_from(manifests, application, included_when):
    """One connection per requirement, from the manifests alone. A type with two providers (ae/game-adapter: turn-engine's
    adapter and the application's own poker adapter) is resolved by PREFERRED."""
    providers = {}
    for slug in ORDER:
        for port in manifests[slug]["provides"]:
            providers.setdefault(port["type"], []).append((slug, port["id"]))
    for port in application["provides"]:
        providers.setdefault(port["type"], []).append((APPLICATION, port["id"]))
    # realtime-rooms serves the clients through the application's adapter, which wraps turn-engine's; the application in turn
    # takes turn-engine's own adapter.
    preferred = {("realtime-rooms", "game"): (APPLICATION, "poker-game-adapter"), (APPLICATION, "game-adapter"): ("turn-engine", "game-adapter")}
    out = []
    for consumer, manifest in [(slug, manifests[slug]) for slug in ORDER] + [(APPLICATION, application)]:
        for port in manifest["requires"]:
            found = [p for p in providers.get(port["type"], []) if p[0] != consumer]
            if (consumer, port["id"]) in preferred:
                found = [preferred[(consumer, port["id"])]]
            if not found and port.get("optional"):
                continue  # nobody provides it and the component works without it (display-mode, video-calls, windows-desktop configuration)
            if len(found) != 1:
                raise SystemExit(f"{consumer}.{port['id']} ({port['type']}): providers {found}")
            source, source_port = found[0]
            out.append({"source": {"instance": source, "port": source_port}, "target": {"instance": consumer, "port": port["id"]}})
    # The application's requirement is optional exactly when its provider can be left out of the design.
    for connection in out:
        if connection["target"]["instance"] != APPLICATION:
            continue
        provider = connection["source"]["instance"]
        requirement = next(p for p in application["requires"] if p["id"] == connection["target"]["port"])
        assert bool(requirement.get("optional")) == (included_when.get(provider) is not None), f"application.{requirement['id']} optional flag disagrees with {provider}'s includedWhen"
    return out


def main() -> None:
    manifests = {s: read(COMPONENTS / s / "component.json") for s in ORDER}
    assert len(manifests) == 39 and sorted(p.name for p in COMPONENTS.iterdir() if p.is_dir()) == sorted(ORDER)
    application = read(HERE / "component.json")

    included_when = conditions(manifests)

    components = []
    for slug in ORDER:
        ident = manifests[slug]["identity"]
        assert ident["name"] == f"ourapps-ae/{slug}"
        components.append({"id": slug, "name": ident["name"], "version": ident["version"],
                           "configuration": CONFIGURATION.get(slug, {}), "includedWhen": included_when.get(slug)})
    connections = connections_from(manifests, application, included_when)

    recipe = {
        "format": 1, "name": "ourapps-ae/ourpoker", "version": "0.4.1", "title": "OurPoker",
        "summary": "A complete Texas hold'em game for two to nine players: phones, tablets, computers, the web and a television as a shared table, optional video, computer players, lessons, rebuys and rising blinds.",
        "category": "games", "tags": ["cards", "multiplayer", "poker", "texas-holdem", "tournament"],
        "targets": {"client": ALL_TARGETS, "server": ["hosting-provider", "own-hardware"]},
        "components": components, "jobs": JOBS, "scale": SCALE, "questions": QUESTIONS, "connections": connections,
        "tests": {"defaultAnswers": DEFAULT_ANSWERS, "answerSets": ANSWER_SETS},
        "page": {"description": "page/description.md", "diagram": "page/diagram.svg", "screenshots": []},
        "instructions": "INSTRUCTIONS.md",
    }
    (HERE / "recipe.json").write_text(json.dumps(recipe, indent=2, ensure_ascii=False) + "\n")
    print(f"recipe.json: {len(components)} components, {len(connections)} connections, {len(QUESTIONS)} questions, {len(ANSWER_SETS)} answer sets"
          + "; computer-players and poker-strategy are conditional (turn-engine's computer-players requirement is optional)")


if __name__ == "__main__":
    main()
