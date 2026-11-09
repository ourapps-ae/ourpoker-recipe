import Foundation

// Mirrors server/src/contract.ts. Unknown enum strings decode to .unknown.
let contractVersion = 1

enum Status: String, Decodable {
    case lobby, running, completed, cancelled, unknown

    init(from decoder: Decoder) throws {
        self = Status(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

enum Phase: String, Decodable {
    case lobby, betting, runout, handOver, rebuy, completed, cancelled, unknown

    init(from decoder: Decoder) throws {
        self = Phase(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

struct LastAction: Decodable, Hashable {
    let kind: String
    let amount: Int?
    let auto: Bool
}

struct HandRank: Decodable, Hashable {
    let category: String
    let ranks: [Int]
    let name: String
    // The combination's cards in reading order, from the hand or the board, then (spare) the
    // kickers that decided the showdown.
    var best: [OddsCard]? = nil
}

struct PlayerView: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let seat: Int
    let isBot: Bool
    let isHost: Bool
    let stack: Int
    let bet: Int
    let totalIn: Int
    let inHand: Bool
    let folded: Bool
    let allIn: Bool
    // nil entries are face down.
    let cards: [String?]
    let status: String
    let place: Int?
    let connected: Bool
    let sittingOut: Bool
    let rebuysUsed: Int
    let lastAction: LastAction?
    let hand: HandRank?

    var out: Bool { status == "out" }
}

struct PotView: Decodable, Hashable {
    let amount: Int
    let eligible: [String]
}

struct HandView: Decodable, Hashable {
    let no: Int
    let level: Int
    let sb: Int
    let bb: Int
    let button: Int
    let sbSeat: Int
    let bbSeat: Int
    let street: String
    let board: [String]
    let pots: [PotView]
    let potTotal: Int
    let currentBet: Int
    let actorId: String?
    let remainingMs: Int?
    let settleMs: Int?
    let event: String?
    let lastActorId: String?
}

struct WinnerView: Decodable, Hashable {
    let playerId: String
    let amount: Int
    let handName: String?
}

struct ResultPot: Decodable, Hashable {
    let amount: Int
    let winners: [WinnerView]
}

// How the main pot was won at a showdown: "combination", "kicker" or "draw"; per hand, how many
// kickers its shown cards include.
struct ShowdownView: Decodable, Hashable {
    let kind: String
    let winners: [String]
    let kickers: [String: Int]
}

struct HandResultView: Decodable, Hashable {
    let no: Int
    let board: [String]
    let pots: [ResultPot]
    let uncontested: Bool
    let voided: Bool
    var showdown: ShowdownView? = nil
    // How long the result stays up, from the end of the hand.
    var holdMs: Int? = nil
}

struct ClockView: Decodable, Hashable {
    let level: Int
    let sb: Int
    let bb: Int
    let nextSb: Int
    let nextBb: Int
    let nextLevelInMs: Int
    let levelDurationMs: Int
}

struct RebuyOfferView: Decodable, Hashable {
    let playerId: String
    let remainingMs: Int
}

// A card of a possible hand in reading order: known (`code`) or still needed (code nil, rank
// and suit as far as known); spare cards are kickers outside the pattern.
struct OddsCard: Decodable, Hashable {
    let code: String?
    let rank: String?
    let suit: String?
    let from: String
    let spare: Bool
}

struct OddsRow: Decodable, Hashable {
    let category: String
    let rank: Int
    let probability: Double
    let cards: [OddsCard]
    let more: Bool
}

// BetRange is holdem-rules'. GAP: G9.2 it is not Decodable there, so the wire decoding is added here.
extension BetRange: Decodable {
    private enum Keys: String, CodingKey { case min, max, opening }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        self.init(min: try c.decode(Int.self, forKey: .min), max: try c.decode(Int.self, forKey: .max), opening: try c.decode(Bool.self, forKey: .opening))
    }
}

struct Legal: Decodable, Hashable {
    let start: Bool
    let addBot: Bool
    let kick: Bool
    let leave: Bool
    let sitOut: Bool
    let back: Bool
    let fold: Bool
    let check: Bool
    let call: Int?
    let bet: BetRange?
    let rebuy: Bool
    let show: [Int]
    let pause: Bool
    let resume: Bool
    let cancel: Bool
    let newGame: Bool

    enum CodingKeys: String, CodingKey {
        case start, addBot, kick, leave, sitOut, fold, check, call, bet, rebuy, show, pause, resume, cancel, newGame
        case back = "return"
    }
}

// A prompt argument is a player name or a number.
enum PromptArg: Decodable, Hashable {
    case text(String)
    case number(Int)

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let n = try? c.decode(Int.self) { self = .number(n) } else { self = .text(try c.decode(String.self)) }
    }

    var text: String {
        switch self {
        case .text(let s): return s
        case .number(let n): return chips(n)
        }
    }
}

// HistoryWinner, HistoryEntry (round-history) and RoomInfo (room-directory) come from their components.

struct GameView: Decodable, Hashable {
    let contractVersion: Int
    let version: Int
    let gameNumber: Int
    let roomId: String
    // Your player id; "" for a display (the table viewer).
    let you: String
    var display: Bool? = nil
    // Players holding the play clock (looking at cards, reading a guide); every countdown waits.
    var holds: [ClockHold]? = nil
    let status: Status
    let phase: Phase
    let pauseReasons: [String]
    let hostId: String?
    let players: [PlayerView]
    let hand: HandView?
    let lastResult: HandResultView?
    let clock: ClockView?
    let rebuyOffers: [RebuyOfferView]
    let winnerId: String?
    let history: [HistoryEntry]
    let odds: [OddsRow]?
    let legal: Legal
    let prompt: String
    let promptKey: String
    let promptArgs: [PromptArg]
    let inviteUrl: String?

    func player(_ id: String?) -> PlayerView? { players.first { $0.id == id } }
    func name(_ id: String?) -> String { player(id)?.name ?? "someone" }
    var me: PlayerView? { player(you) }
    var paused: Bool { !pauseReasons.isEmpty }
    var isDisplay: Bool { display ?? false }
    var held: Bool { !(holds ?? []).isEmpty }
    // Only you and computer players: nobody else to see or hear, so the game shows no video.
    var soloGame: Bool { status != .lobby && players.filter { !$0.isBot }.count <= 1 }
}

struct UpdateInfo: Decodable {
    let name: String?
    let version: String
    // Opens TestFlight, which installs the update.
    let testflightUrl: String?
    // The newest build TestFlight can give: the version an iPhone or iPad compares with.
    let testflightVersion: String?
}

struct VideoGrant: Decodable {
    let url: String
    let token: String
    let room: String
}

struct JoinResponse: Decodable {
    let token: String
    let playerId: String
    let spectator: Bool
    let view: GameView
    let video: VideoGrant?
}

struct ClockHold: Decodable, Hashable {
    let playerId: String
    let kind: String
}

struct DisplayJoinResponse: Decodable {
    let token: String
    let view: GameView
}

struct ErrorBody: Decodable {
    let error: String
    let message: String
    let view: GameView?
}
