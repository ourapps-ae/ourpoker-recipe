import AVFoundation
import Observation
import SwiftUI

// The names the screens use, over the components that now provide them: the apple-host's platform
// rules, the sound-cues player with this game's sound list, the preferences, and the table-layout
// component's portrait spots. Nothing here is poker.

enum RoomMode: String, CaseIterable {
    case player, board
}

extension View {
    @ViewBuilder func tableStatusBarHidden() -> some View { shellStatusBarHidden() }
    @ViewBuilder func playerNameInput() -> some View { shellNameInput() }
    @ViewBuilder func platformButtonStyle() -> some View { shellButtonStyle() }
}

let isPad = Platform.family == .pad

// ---- sound: the game's sounds, played by the sound-cues component ----

enum SoundName: String, CaseIterable {
    case click, enter, exit, start, end, deal, burn, flip, check, fold, chips, allin, win, turn
    case botAdd = "bot_add", botRemove = "bot_remove"
}

// Sounds on or off on this device: the game's sounds and other players' voices, never your microphone.
@Observable
@MainActor
final class SoundSetting {
    static let shared = SoundSetting()
    private let preferences = DevicePreferences()
    private(set) var on: Bool

    init() { on = preferences.sound }

    func set(_ value: Bool) {
        on = value
        preferences.sound = value
        if !value { Sound.stopAll() }
    }
}

@MainActor
enum Sound {
    // The manifest and files are the recipe's (assets/sounds, assets/web/sounds-manifest.json), placed under the
    // project's Art folder, which apple-host copies into the bundle as a folder.
    private static let player: SoundCuePlayer = {
        let data = Bundle.main.url(forResource: "sounds-manifest", withExtension: "json", subdirectory: "Art/Sounds").flatMap { try? Data(contentsOf: $0) } ?? Data()
        let manifest = (try? SoundCueModel.parseManifest(data)) ?? SoundManifest(cues: [:], events: [:])
        return SoundCuePlayer(
            manifest: manifest,
            locate: { file in
                let name = (file as NSString).deletingPathExtension, ext = (file as NSString).pathExtension
                return Bundle.main.url(forResource: name, withExtension: ext, subdirectory: "Art/Sounds") ?? Bundle.main.url(forResource: name, withExtension: ext)
            },
            isMuted: { !SoundSetting.shared.on })
    }()

    static func stopAll() { player.stopAll() }
    static func play(_ name: SoundName, after delay: Double = 0) { player.play(name.rawValue, delayMs: delay * 1000) }
}

// ---- table geometry: the portrait spots, over table-layout's placed seats ----

enum Spots {
    private static func layout(_ n: Int) -> TableLayout { TableGeometry.tableLayout(seats: max(2, n), orientation: .portrait) }
    private static func point(_ p: TablePoint) -> CGPoint { CGPoint(x: p.x, y: p.y) }
    private static func seatSpot(_ k: Int, _ n: Int) -> SeatSpot? { let l = layout(n); return k >= 0 && k < l.seatSpots.count ? l.seatSpots[k] : nil }

    static var pot: CGPoint { point(layout(2).pot) }
    static var deck: CGPoint { point(layout(2).deck) }
    static var burn: CGPoint { point(layout(2).burn) }

    static func angle(_ k: Int, _ n: Int) -> Double { TableGeometry.seatAngle(k, n) }
    static func seat(_ k: Int, _ n: Int) -> CGPoint { seatSpot(k, n).map { CGPoint(x: $0.x, y: $0.y) } ?? CGPoint(x: 0.5, y: 0.7) }
    static func cards(_ k: Int, _ n: Int) -> CGPoint { seatSpot(k, n).map { point($0.cards) } ?? CGPoint(x: 0.5, y: 0.7) }
    static func shown(_ k: Int, _ n: Int) -> CGPoint { seatSpot(k, n).map { point($0.shown) } ?? CGPoint(x: 0.5, y: 0.7) }
    static func bet(_ k: Int, _ n: Int) -> CGPoint { seatSpot(k, n).map { point($0.bet) } ?? CGPoint(x: 0.5, y: 0.7) }
    static func tableCard(_ n: Int, faceUp: Bool) -> CGFloat { CGFloat(TableGeometry.tableCardWidth(n, faceUp: faceUp)) }
    static func board(_ i: Int) -> CGPoint { let l = layout(2); return i < l.board.count ? point(l.board[i]) : CGPoint(x: 0.5, y: 0.5) }
    static func ring(_ a: Double) -> CGPoint { point(TableGeometry.ringPoint(a)) }
    static func seatIndex(_ p: PlayerView, _ view: GameView) -> Int {
        TableGeometry.relativeSeat(p.seat, mySeat: view.me?.seat ?? 0, count: view.players.count)
    }
}

// ---- the table viewer's ring: the component's Ring with the point type the viewer draws in ----

extension Ring {
    func cgPoint(_ t: Double) -> CGPoint { let p = point(t); return CGPoint(x: p.x, y: p.y) }
    func fraction(toward p: CGPoint, from c: CGPoint) -> Double { fractionToward(TablePoint(x: p.x, y: p.y), from: TablePoint(x: c.x, y: c.y)) }
}

// A local point turned by an angle (clockwise on screen) about a centre.
func turned(_ p: CGPoint, by a: Double, about c: CGPoint) -> CGPoint {
    CGPoint(x: c.x + p.x * cos(a) - p.y * sin(a), y: c.y + p.x * sin(a) + p.y * cos(a))
}
