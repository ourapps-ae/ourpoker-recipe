import SwiftUI

// What the lessons are asked for. The lessons themselves are data (locales/lessons.json) run by the
// guided-tour component; this names them and says which moment of the game asks for which.
enum GuideID: String {
    case home, lobby, bots, table, blinds, call, bet, pot, flop, turn, river

    // The screen a guide belongs to; it goes when that screen does.
    var screen: String? {
        switch self {
        case .home: return "home"
        case .lobby, .bots: return "lobby"
        default: return nil
        }
    }
}

enum Guides {
    // Guides for the table, and for each thing the first time it happens.
    static func forTable(_ view: GameView) -> [GuideID] {
        guard !view.isDisplay, view.status == .running else { return [] }
        var out: [GuideID] = [.table]
        guard let hand = view.hand else { return out }
        if hand.event == "deal" { out.append(.blinds) }
        let kind = hand.event == "action" ? view.player(hand.lastActorId)?.lastAction?.kind : nil
        if kind == "call" { out.append(.call) }
        if kind == "bet" || kind == "raise" || kind == "allIn" { out.append(.bet) }
        if hand.pots.contains(where: { $0.amount > 0 }) { out.append(.pot) }
        if hand.board.count == 3 { out.append(.flop) }
        if hand.board.count == 4 { out.append(.turn) }
        if hand.board.count == 5 { out.append(.river) }
        return out
    }
}

// An anchor on one of several alike views, such as the first room or the first computer player.
struct GuideAnchorIf: ViewModifier {
    let name: String
    let on: Bool
    func body(content: Content) -> some View {
        if on { content.tourAnchor(name) } else { content }
    }
}

extension View {
    func guideAnchor(_ name: String) -> some View { tourAnchor(name) }
}

// Two dots side by side: a double tap.
struct DoubleTapDots: View {
    var size: CGFloat = 4
    var body: some View {
        HStack(spacing: size / 2) { Circle().frame(width: size, height: size); Circle().frame(width: size, height: size) }
    }
}
