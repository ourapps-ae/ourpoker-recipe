"""The document of the application's provided port `poker-game-adapter` (ae/game-adapter 1.0.0): OpenRPC 1.3.2, derived from
implementation/server/src/adapter.ts, wire.ts and contract.ts. Every GameAdapter member but view is turn-engine's, so those
members with their schemas and errors are read from turn-engine's provided document; the poker wire view (contract.ts) is
written here. scripts/make_component.py writes it to interfaces/poker-game-adapter.json."""
import copy
import os
import json
from pathlib import Path

COMPONENTS = Path(os.environ.get("OURPOKER_COMPONENTS") or Path(__file__).resolve().parent.parent.parent.parent / "components")  # the component checkouts
REF = "#/components/schemas/"
# turn-engine schemas that a poker schema of the same name replaces
RENAMED = {"View": "EngineView", "Legal": "EngineLegal"}


def ref(name):
    return {"$ref": REF + name}


def obj(properties, description=None):
    out = {"type": "object", "properties": properties, "required": list(properties), "additionalProperties": False}
    return {"description": description, **out} if description else out


def nullable(schema):
    return {"anyOf": [schema, {"type": "null"}]}


NAT = {"type": "integer", "minimum": 0}
STR = {"type": "string"}
BOOL = {"type": "boolean"}
CARD = {"type": "string", "pattern": "^[2-9TJQKA][cdhs]$", "description": "Rank 2-9, T, J, Q, K, A then suit c, d, h, s, for example As or Td."}
ODDS_CARD = obj({
    "code": nullable(ref("Card")), "rank": {"type": ["string", "null"]}, "suit": {"type": ["string", "null"]},
    "from": {"type": "string", "enum": ["hole", "board", "needed"]}, "spare": BOOL,
}, description="A card of a possible hand, in reading order: a known card (code) from the viewer's hand or the board, or one still to come (from needed, code null) known by rank, suit, both or neither. Spare cards are kickers.")

# server/src/contract.ts and wire.ts
POKER = {
    "Card": CARD,
    "Street": {"type": "string", "enum": ["preflop", "flop", "turn", "river"]},
    "Phase": {"type": "string", "enum": ["lobby", "betting", "runout", "handOver", "rebuy", "completed", "cancelled"],
              "description": "running splits into betting, runout (everyone left is all-in, board being dealt), handOver (result on show) and rebuy (offers pending)."},
    "PauseReason": {"type": "string", "enum": ["hostAbsent", "allOffline", "manual"]},
    "Action": {"description": "What a client sends; parseAction reads it.", "oneOf": [
        obj({"type": {"const": t}}) for t in ("start", "addBot", "leave", "sitOut", "return", "fold", "check", "call", "pause", "resume", "cancel", "newGame")
    ] + [
        obj({"type": {"const": "kick"}, "playerId": STR}),
        obj({"type": {"const": "bet"}, "to": {"type": "integer", "minimum": 0, "description": "The total for the street."}}),
        obj({"type": {"const": "rebuy"}, "accept": BOOL}),
        obj({"type": {"const": "show"}, "cards": {"type": "array", "items": NAT}}),
    ]},
    "LastAction": obj({
        "kind": {"type": "string", "enum": ["blind", "fold", "check", "call", "bet", "raise", "allIn"]},
        "amount": {"type": ["integer", "null"]},
        "auto": {"type": "boolean", "description": "True when the server acted for an absent or timed-out player."},
    }),
    "OddsCard": ODDS_CARD,
    "PlayerView": obj({
        "id": STR, "name": STR, "seat": NAT, "isBot": BOOL, "isHost": BOOL, "stack": NAT,
        "bet": {"type": "integer", "minimum": 0, "description": "Chips in front of the player this street."},
        "totalIn": {"type": "integer", "minimum": 0, "description": "Chips put in this hand."},
        "inHand": BOOL, "folded": BOOL, "allIn": BOOL,
        "cards": {"type": "array", "items": nullable(ref("Card")), "description": "null entries are face down; the viewer's own cards and shown cards carry the card."},
        "status": {"type": "string", "enum": ["in", "out"]}, "place": {"type": ["integer", "null"]}, "connected": BOOL, "sittingOut": BOOL,
        "rebuysUsed": NAT, "lastAction": nullable(ref("LastAction")),
        "hand": nullable(obj({"category": STR, "ranks": {"type": "array", "items": {"type": "integer", "minimum": 0, "maximum": 12}}, "name": STR,
                              "best": {"type": "array", "items": ref("OddsCard")}},
                             description="Best five-card hand once the cards are shown; name is English, category and ranks (0 a two, 12 an ace) let a client build its own text.")),
    }),
    "PotView": obj({"amount": NAT, "eligible": {"type": "array", "items": STR}}),
    "HandView": obj({
        "no": NAT, "level": NAT, "sb": NAT, "bb": NAT, "button": NAT, "sbSeat": NAT, "bbSeat": NAT, "street": ref("Street"),
        "board": {"type": "array", "items": ref("Card")}, "pots": {"type": "array", "items": ref("PotView")},
        "potTotal": {"type": "integer", "minimum": 0, "description": "Chips wagered this hand that are not yet in a pot."},
        "currentBet": NAT, "actorId": {"type": ["string", "null"]},
        "remainingMs": {"type": ["integer", "null"], "description": "Milliseconds left on a human actor's clock (with the settle), the next runout card or the result pause; frozen while paused; null for a computer player or a skipped player."},
        "settleMs": {"type": ["integer", "null"], "description": "Settle still to run before the actor's clock starts; null outside betting."},
        "event": {"type": ["string", "null"], "enum": ["deal", "flop", "turn", "river", "action", None]},
        "lastActorId": {"type": ["string", "null"]},
    }),
    "WinnerView": obj({"playerId": STR, "amount": NAT, "handName": {"type": ["string", "null"]}}),
    "HistoryEntry": obj({"no": NAT, "level": NAT, "winners": {"type": "array", "items": obj({"playerId": STR, "amount": NAT})}, "voided": BOOL}),
    "ShowdownView": obj({
        "kind": {"type": "string", "enum": ["combination", "kicker", "draw"]}, "winners": {"type": "array", "items": STR},
        "kickers": {"type": "object", "additionalProperties": NAT, "description": "Per hand, how many kickers its shown cards include after the combination."},
    }, description="How the main pot was won when cards were shown."),
    "HandResultView": obj({
        "no": NAT, "board": {"type": "array", "items": ref("Card")},
        "pots": {"type": "array", "items": obj({"amount": NAT, "winners": {"type": "array", "items": ref("WinnerView")}})},
        "uncontested": BOOL, "voided": BOOL, "showdown": nullable(ref("ShowdownView")),
        "holdMs": {"type": "integer", "minimum": 0, "description": "How long the result stays up, from the end of the hand."},
    }),
    "ClockView": obj({"level": NAT, "sb": NAT, "bb": NAT, "nextSb": NAT, "nextBb": NAT,
                      "nextLevelInMs": {"type": "integer", "minimum": 0, "description": "Unpaused milliseconds until the next level."}, "levelDurationMs": NAT}),
    "RebuyOfferView": obj({"playerId": STR, "remainingMs": NAT}),
    "OddsRow": obj({
        "category": STR, "rank": {"type": "integer", "minimum": 1, "description": "1 is a royal flush."},
        "probability": {"type": "number", "minimum": 0, "maximum": 1, "description": "Chance the needed cards turn up by the river; 1 for the hand already made."},
        "cards": {"type": "array", "items": ref("OddsCard")}, "more": {"type": "boolean", "description": "A row that groups rarer ways and shows no cards."},
    }, description="One way the viewer's hand can finish."),
    "Legal": obj({
        "start": BOOL, "addBot": BOOL, "kick": BOOL, "leave": BOOL, "sitOut": BOOL, "return": BOOL, "fold": BOOL, "check": BOOL,
        "call": {"type": ["integer", "null"], "minimum": 0, "description": "Chips to call, or null; may be less than the current bet when the player would be all-in."},
        "bet": nullable(obj({"min": NAT, "max": NAT, "opening": BOOL}, description="Range for a bet or raise as the street total; max is all-in.")),
        "rebuy": BOOL, "show": {"type": "array", "items": NAT}, "pause": BOOL, "resume": BOOL, "cancel": BOOL, "newGame": BOOL,
    }),
    "View": obj({
        "contractVersion": {"const": 1, "description": "CONTRACT_VERSION; changes only when the wire contract changes."},
        "version": NAT, "gameNumber": NAT, "roomId": STR,
        "you": {"type": "string", "description": "The viewer's player id; empty for a display."},
        "holds": {"type": "array", "items": obj({"playerId": STR, "kind": {"type": "string", "enum": ["look", "learn"]}}), "description": "Players holding the play clock; while any hold is on, every countdown stands still."},
        "display": BOOL, "status": ref("Status"), "phase": ref("Phase"), "pauseReasons": {"type": "array", "items": ref("PauseReason")},
        "hostId": {"type": ["string", "null"]}, "players": {"type": "array", "items": ref("PlayerView")}, "hand": nullable(ref("HandView")),
        "lastResult": nullable(ref("HandResultView")), "clock": nullable(ref("ClockView")), "rebuyOffers": {"type": "array", "items": ref("RebuyOfferView")},
        "winnerId": {"type": ["string", "null"]}, "history": {"type": "array", "items": ref("HistoryEntry")},
        "odds": {"description": "Only when the odds option is on and the viewer holds cards in a live hand.", "anyOf": [{"type": "array", "items": ref("OddsRow")}, {"type": "null"}]},
        "legal": ref("Legal"), "prompt": STR, "promptKey": STR, "promptArgs": {"type": "array", "items": {"type": ["string", "number"]}},
        "inviteUrl": {"type": ["string", "null"]}, "updateUrl": {"type": ["string", "null"]},
    }, description="The poker wire view every client decodes (server/src/contract.ts)."),
    "LinkExtras": obj({"inviteUrl": {"type": ["string", "null"]}, "updateUrl": {"type": ["string", "null"]}}, description="Links copied into every view."),
    "WireDeps": {"type": "object", "description": "What the wire view needs besides the engine's view: evaluate(cards) the best hand (poker-hand-ranking), shownCards(hole, board, kickers) and oddsRows(hole, board) (poker-odds), and levelDurationMs (level-schedule)."},
    "PokerGameAdapter": {"type": "object", "description": "turn-engine's GameAdapter over this recipe's parts with view replaced; its members are the `GameAdapter.<name>` methods."},
}


def renamed(node):
    if isinstance(node, dict):
        return {k: (REF + RENAMED[v[len(REF):]] if k == "$ref" and isinstance(v, str) and v[len(REF):] in RENAMED else renamed(v)) for k, v in node.items()}
    if isinstance(node, list):
        return [renamed(x) for x in node]
    return node


def refs(node, out):
    if isinstance(node, dict):
        for k, v in node.items():
            if k == "$ref" and isinstance(v, str) and v.startswith(REF):
                out.add(v[len(REF):])
            refs(v, out)
    elif isinstance(node, list):
        for x in node:
            refs(x, out)
    return out


def document():
    engine = json.loads((COMPONENTS / "turn-engine" / "interfaces" / "game-adapter.json").read_text())
    members = [renamed(m) for m in engine["methods"] if m["name"].startswith("GameAdapter.")]
    for m in members:
        if m["name"] == "GameAdapter.view":
            m["description"] = "What one viewer sees, in the poker wire view (toWireView over the engine's view); actor null or a display sees what everyone sees. The odds option adds the viewer's odds rows."
            m["result"] = {"name": "view", "schema": ref("View")}
    schemas = {RENAMED.get(k, k): renamed(v) for k, v in engine["components"]["schemas"].items()}
    assert not set(POKER) & set(schemas), set(POKER) & set(schemas)
    schemas.update(copy.deepcopy(POKER))
    document = {
        "openrpc": "1.3.2",
        "x-ourapps-modules": {"server": "server/src/adapter.ts"},
        "info": {
            "title": "ae/game-adapter",
            "version": "1.0.0",
            "description": "The game adapter realtime-rooms calls (recipe.json connects this port to realtime-rooms' `game` requirement): turn-engine's GameAdapter over the recipe's parts (server/src/parts.ts: holdem-rules, seating, game-clock, private-views, presence, tournament, computer players, round-history, the house rules), whose view answers in the poker wire view the web, Apple and Android clients decode. The application's own `game-adapter` requirement takes turn-engine's adapter, which pokerAdapter wraps. Methods named `GameAdapter.<name>` are members of the object pokerAdapter returns; every one but view is turn-engine's. TypeScript, `implementation/server/src/adapter.ts` (wire.ts, contract.ts).",
        },
        "x-ourapps-modules": {"server": "server/src/adapter.ts"},
        "methods": [
            {
                "name": "pokerAdapter",
                "tags": [{"name": "typescript"}],
                "description": "The adapter: turn-engine's createGameAdapter(parts, engineSettings) with view mapped by toWireView.",
                "tags": [{"name": "typescript"}],
                "paramStructure": "by-position",
                "params": [{"name": "links", "required": True, "schema": ref("LinkExtras")}],
                "result": {"name": "adapter", "schema": ref("PokerGameAdapter")},
                "errors": [{"$ref": "#/components/errors/BadSettings"}],
            },
            {
                "name": "toWireView",
                "tags": [{"name": "typescript"}],
                "description": "The poker wire view from the engine's view: phases renamed, the poker part of the game copied out, the best hand worked out for every face-up hand, the viewer's odds when asked, prompts that name the winner, and the links.",
                "tags": [{"name": "typescript"}],
                "paramStructure": "by-position",
                "params": [
                    {"name": "view", "required": True, "schema": ref("EngineView")},
                    {"name": "links", "required": True, "schema": ref("LinkExtras")},
                    {"name": "deps", "required": True, "schema": ref("WireDeps")},
                    {"name": "options", "required": False, "schema": ref("Options"), "description": "Defaults to {}; odds true adds the odds rows."},
                ],
                "result": {"name": "view", "schema": ref("View")},
            },
            *members,
        ],
        "components": {"schemas": schemas, "errors": {}},
    }
    # only the schemas and errors something refers to
    used = refs(document["methods"], set()) | set(POKER)
    while more := refs([schemas[n] for n in used], set()) - used:
        used |= more
    document["components"]["schemas"] = {k: v for k, v in schemas.items() if k in used}
    named = {e["$ref"].rsplit("/", 1)[1] for m in document["methods"] for e in m.get("errors", [])}
    document["components"]["errors"] = {k: v for k, v in engine["components"]["errors"].items() if k in named}
    return document
