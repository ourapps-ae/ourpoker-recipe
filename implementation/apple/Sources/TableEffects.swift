import SwiftUI

struct Flight: Identifiable {
    let id: Int
    let from: CGPoint
    let to: CGPoint
    let delay: Double
    let duration: Double
    let lands: String
    var amount = 0
    var card = false
    var pair = false
    var allIn = false
    var text: String? = nil
    // A face-up card of `size` points; dx and dy shift the destination by that many points.
    var code: String? = nil
    var dx: CGFloat = 0
    var dy: CGFloat = 0
    var size: CGFloat = 40
}

// Where things sit on a table, as fractions of the area the flights cross: the phone's table box,
// or the whole screen of the table viewer.
struct FlightSpots {
    var deck: CGPoint
    var burn: CGPoint
    var pot: CGPoint
    var board: (Int) -> CGPoint
    var seat: (PlayerView) -> CGPoint
    var cards: (PlayerView) -> CGPoint
    var shown: (PlayerView) -> CGPoint
    var bet: (PlayerView) -> CGPoint
    // Your own cards come from your hand below the table; nil where there is no hand of yours.
    var hand: (PlayerView) -> CGPoint? = { _ in nil }
    // Showdown cards fly over the pot into the showcase.
    var showcase = true

    static func phone(_ view: GameView) -> FlightSpots {
        let n = max(2, view.players.count)
        func k(_ p: PlayerView) -> Int { Spots.seatIndex(p, view) }
        return FlightSpots(
            deck: Spots.deck, burn: Spots.burn, pot: Spots.pot, board: Spots.board,
            seat: { Spots.seat(k($0), n) }, cards: { Spots.cards(k($0), n) }, shown: { Spots.shown(k($0), n) }, bet: { Spots.bet(k($0), n) },
            hand: { k($0) == 0 ? CGPoint(x: 0.5, y: 1.22) : nil })
    }
}

// A hand that ended in a showdown: how the main pot was won ("combination", "kicker" or "draw"),
// its winners and every hand that was shown.
struct Showdown {
    let kind: String
    let winners: [PlayerView]
    let players: [PlayerView]
    // What each winner took, all pots together.
    var won: [String: Int] = [:]

    static func of(_ view: GameView) -> Showdown? {
        guard view.phase == .handOver, let hand = view.hand, let r = view.lastResult, !r.uncontested, !r.voided, r.no == hand.no else { return nil }
        let players = view.players.filter { $0.inHand && !$0.folded && !($0.hand?.best ?? []).isEmpty }
        let ids = r.showdown?.winners ?? (r.pots.first?.winners.first.map { [$0.playerId] } ?? [])
        let winners = ids.compactMap { id in players.first { $0.id == id } }
        guard players.count >= 2, !winners.isEmpty else { return nil }
        return Showdown(kind: r.showdown?.kind ?? "combination", winners: winners, players: players, won: wonBy(r))
    }

    static func wonBy(_ r: HandResultView) -> [String: Int] {
        var out: [String: Int] = [:]
        for pot in r.pots { for w in pot.winners { out[w.playerId, default: 0] += w.amount } }
        return out
    }

    // Won with no cards shown: everyone else folded.
    static func uncontested(_ view: GameView) -> Bool {
        guard view.phase == .handOver, let hand = view.hand, let r = view.lastResult else { return false }
        return r.uncontested && !r.voided && r.no == hand.no
    }

    // Who took the pot nobody contested, and how much.
    static func uncontestedWinner(_ view: GameView) -> (name: String, amount: Int)? {
        guard uncontested(view), let r = view.lastResult, let id = r.pots.first?.winners.first?.playerId else { return nil }
        return (view.name(id), wonBy(r)[id] ?? 0)
    }

    func isWinner(_ id: String) -> Bool { winners.contains { $0.id == id } }

    // The showcase over the pot ring: one row per winner; a draw has smaller cards, a title and
    // each winner's name left of the row. Its top sits `top` above the pot's centre; a third row
    // on grows it upward, clear of your seat.
    var cardWidth: CGFloat { winners.count > 2 ? 22 : winners.count > 1 ? 26 : 34 }
    var cardHeight: CGFloat { cardWidth * 1.4 }
    // Community cards sit a fifth of a card higher than the hand's own, toward the board they came from.
    var raise: CGFloat { cardHeight * 0.2 }
    var titleHeight: CGFloat { kind == "draw" ? 18 : 0 }
    var rowHeight: CGFloat { raise + cardHeight + 10 }
    var top: CGFloat { 27 + CGFloat(max(0, winners.count - 2)) * rowHeight }
    // Row r's card centres, from the pot's centre.
    func cardDy(_ r: Int, board: Bool) -> CGFloat { -top + titleHeight + CGFloat(r) * rowHeight + (board ? 0 : raise) + cardHeight / 2 }

    static let gap: CGFloat = 4
    static let kickerGap: CGFloat = 10

    // Each card's offset from its row's centre: the combination, then a wider gap before the kickers.
    static func offsets(_ best: [OddsCard], _ size: CGFloat) -> [CGFloat] {
        var xs: [CGFloat] = []
        var x: CGFloat = 0
        for (i, c) in best.enumerated() {
            if i > 0 { x += size + gap + (c.spare && !best[i - 1].spare ? kickerGap : 0) }
            xs.append(x)
        }
        let width = (xs.last ?? 0) + size
        return xs.map { $0 + size / 2 - width / 2 }
    }
}

@Observable
@MainActor
final class TableEffects {
    var flights: [Flight] = []
    var landing: [String: Date] = [:]
    var now = Date()
    private var prev: GameView?
    private var nextId = 1

    // Three cards a second, as the server assumes (DEAL_CARD_MS).
    static let fly = 0.45, allIn = 0.7, deal = 0.35, dealGap = 0.34, callout = 2.2

    func isLanding(_ key: String) -> Bool { (landing[key] ?? .distantPast) > now }

    // Work out what moved between the last view and this one, as the web client does.
    func onView(_ view: GameView, spots given: FlightSpots? = nil) {
        let p = prev
        prev = view
        guard let hand = view.hand, let p, p.gameNumber == view.gameNumber, p.roomId == view.roomId else { return }
        let spots = given ?? .phone(view)
        let sameHand = p.hand != nil && p.hand!.no == hand.no
        var out: [Flight] = []
        var delay = 0.0
        func add(_ from: CGPoint, _ to: CGPoint, _ lands: String, _ dur: Double, amount: Int = 0, card: Bool = false, pair: Bool = false, allIn: Bool = false, text: String? = nil, after: Double = 0) {
            out.append(Flight(id: nextId, from: from, to: to, delay: delay + after, duration: dur, lands: lands, amount: amount, card: card, pair: pair, allIn: allIn, text: text))
            nextId += 1
        }
        if !sameHand {
            let dealt = view.players.filter(\.inHand).sorted { Self.dist($0.seat, hand.button) < Self.dist($1.seat, hand.button) }
            for _ in 0..<2 {
                for pl in dealt { add(spots.deck, spots.cards(pl), "cards:\(pl.id)", Self.deal, card: true); delay += Self.dealGap }
            }
            delay += Self.deal
        }
        let sweep = sameHand && (p.hand!.street != hand.street || (view.phase == .handOver && p.phase != .handOver))
        if sweep {
            var any = false
            for q in p.players where q.bet > 0 {
                let pl = view.players.first { $0.id == q.id } ?? q
                add(spots.bet(pl), spots.pot, "pot", Self.fly, amount: q.bet); any = true
            }
            if any { delay += Self.fly }
        }
        let newBoard = sameHand ? hand.board.count - p.hand!.board.count : hand.board.count
        if newBoard > 0 && view.phase != .handOver {
            add(spots.deck, spots.burn, "burn", Self.deal, card: true)
            delay += Self.deal * 0.6
            for i in (hand.board.count - newBoard)..<hand.board.count { add(spots.deck, spots.board(i), "board:\(i)", Self.deal, card: true); delay += Self.dealGap }
            delay += Self.deal
        }
        if view.phase == .handOver && p.phase != .handOver, let result = view.lastResult {
            var won: [String: Int] = [:]
            for pot in result.pots { for w in pot.winners { won[w.playerId, default: 0] += w.amount } }
            for (id, amount) in won { if let pl = view.players.first(where: { $0.id == id }) { add(spots.pot, spots.seat(pl), "stack:\(id)", Self.fly, amount: amount) } }
            // A showdown: each winner's cards that make the hand fly over the pot ring, then the
            // board cards that complete it slide in, each to its place in reading order; a draw,
            // row by row.
            if spots.showcase, let sd = Showdown.of(view) {
                var t = 0.0
                for (r, w) in sd.winners.enumerated() {
                    guard let best = w.hand?.best else { continue }
                    let xs = Showdown.offsets(best, sd.cardWidth)
                    let from = spots.hand(w) ?? spots.shown(w)
                    for (i, c) in best.enumerated() where c.from == "hole" {
                        out.append(Flight(id: nextId, from: from, to: spots.pot, delay: t, duration: 0.6, lands: "show:\(r):\(i)", code: c.code, dx: xs[i], dy: sd.cardDy(r, board: false), size: sd.cardWidth)); nextId += 1
                    }
                    t += 0.65
                    for (i, c) in best.enumerated() where c.from == "board" {
                        guard let code = c.code, let b = hand.board.firstIndex(of: code) else { continue }
                        out.append(Flight(id: nextId, from: spots.board(b), to: spots.pot, delay: t, duration: 0.5, lands: "show:\(r):\(i)", code: code, dx: xs[i], dy: sd.cardDy(r, board: true), size: sd.cardWidth)); nextId += 1
                        t += 0.18
                    }
                    t += 0.2
                }
            }
        } else {
            for pl in view.players {
                let q = sameHand ? p.players.first { $0.id == pl.id } : nil
                // A fold: the chips in front of the player go into the pot and the cards land where they were.
                if sameHand, let q, !q.folded, pl.folded {
                    if q.bet > 0 { add(spots.bet(pl), spots.pot, "pot", Self.fly, amount: q.bet) }
                    // Your own cards come up from your hand below the table.
                    let fromHand = spots.hand(pl)
                    add(fromHand ?? spots.cards(pl), spots.bet(pl), "fold:\(pl.id)", fromHand != nil ? Self.fly + 0.15 : Self.fly, pair: true, after: 0.2)
                    continue
                }
                // A check: nothing moves, so a word pops up at the seat.
                let checked = hand.event == "action" && hand.lastActorId == pl.id && pl.lastAction?.kind == "check"
                let shown = p.hand?.event == "action" && p.hand?.lastActorId == pl.id && q?.lastAction?.kind == "check"
                if checked && !shown { add(spots.cards(pl), spots.cards(pl), "callout:\(pl.id):\(view.version)", Self.callout, text: L("check")) }
                let before = (q != nil && !sweep) ? q!.bet : 0
                if pl.bet > before {
                    let allIn = pl.allIn && !(q?.allIn ?? false)
                    add(spots.seat(pl), spots.bet(pl), "bet:\(pl.id)", allIn ? Self.allIn : Self.fly, amount: pl.bet - before, allIn: allIn)
                }
            }
        }
        let start = Date()
        for f in out { landing[f.lands] = max(landing[f.lands] ?? .distantPast, start.addingTimeInterval(f.delay + f.duration)) }
        flights.append(contentsOf: out)
    }

    static func dist(_ seat: Int, _ from: Int) -> Int {
        let d = ((seat - from) % 9 + 9) % 9
        return d == 0 ? 9 : d
    }
}

// A decision clock that fills as the time is used: green, then orange past half, then flashing
// red for the last fifth. `left` is the time still to run of `total`.
struct GrowingClock: View {
    let left: Int
    let total: Int
    let now: Date
    let width: CGFloat
    var height: CGFloat = 8

    var body: some View {
        let used = min(1, max(0, 1 - Double(left) / Double(total)))
        let flash = used >= 0.8 && Int(now.timeIntervalSince1970 * 1000 / 300) % 2 == 0
        let colour: Color = flash ? Color(red: 1, green: 0.16, blue: 0.16) : used >= 0.8 ? Palette.danger : used >= 0.5 ? Color(red: 0.94, green: 0.63, blue: 0.19) : Palette.good
        ZStack(alignment: .leading) {
            Capsule().fill(Color.black.opacity(0.45)).overlay(Capsule().stroke(Color.white.opacity(0.25), lineWidth: 1))
            Capsule().fill(colour).frame(width: max(0, width * used))
        }
        .frame(width: width, height: height)
    }
}

// The gold glow behind the seat whose turn it is, gliding clockwise round the ring. The angle
// is unwrapped so every move goes forward, and kept between hands.
struct TurnLight: View {
    let actorK: Int?
    let n: Int
    let w: CGFloat
    let h: CGFloat
    @State private var angle: Double? = nil

    var body: some View {
        ZStack {
            if actorK != nil, let angle {
                LightGlow(angle: angle, w: w, h: h)
            }
        }
        .frame(width: w, height: h)
        .allowsHitTesting(false)
        .onChange(of: actorK, initial: true) { _, k in
            guard let k else { return }
            let a = Spots.angle(k, n)
            let prev = angle ?? a
            let target = prev + ((a - prev).truncatingRemainder(dividingBy: 2 * .pi) + 2 * .pi).truncatingRemainder(dividingBy: 2 * .pi)
            withAnimation(.easeInOut(duration: 0.6)) { angle = target }
        }
    }
}

// Positioned by angle so the animation follows the ring, not a straight line.
private struct LightGlow: View, Animatable {
    var angle: Double
    let w: CGFloat
    let h: CGFloat
    var animatableData: Double {
        get { angle }
        set { angle = newValue }
    }

    var body: some View {
        let p = Spots.ring(angle)
        Ellipse().fill(Palette.gold).frame(width: 96, height: 76).blur(radius: 14).opacity(0.6)
            .position(x: w * p.x, y: h * p.y)
    }
}

// Draws the flights over the table; `w` and `h` are the size of the area, `scale` the size of
// what flies against the phone's table.
struct FlightLayer: View {
    let fx: TableEffects
    let w: CGFloat
    let h: CGFloat
    var scale: CGFloat = 1

    var body: some View {
        ZStack {
            ForEach(fx.flights) { f in FlightView(fx: fx, f: f, w: w, h: h, scale: scale) }
        }
        .frame(width: w, height: h)
        .allowsHitTesting(false)
        .task(id: fx.flights.isEmpty) {
            // A clock while anything is in the air, so destinations appear on time.
            while !fx.flights.isEmpty {
                fx.now = Date()
                try? await Task.sleep(nanoseconds: 50_000_000)
            }
            fx.now = Date()
        }
    }
}

private struct FlightView: View {
    let fx: TableEffects
    let f: Flight
    let w: CGFloat
    let h: CGFloat
    let scale: CGFloat
    @State private var progress: CGFloat = 0
    @State private var visible = false

    var body: some View {
        let x = w * f.from.x + (w * f.to.x + f.dx - w * f.from.x) * progress
        let y = h * f.from.y + (h * f.to.y + f.dy - h * f.from.y) * progress
        Group {
            if let code = f.code {
                PlayingCard(code: code, width: f.size * scale)
            } else if let text = f.text {
                // A word that pops, rises and fades.
                let t = progress
                let fade = t < 0.15 ? t / 0.15 : t > 0.7 ? (1 - t) / 0.3 : 1
                Text(text).font(.system(size: 13 * scale, weight: .bold)).foregroundStyle(Palette.ink).padding(.horizontal, 10 * scale).padding(.vertical, 3 * scale)
                    .background(Palette.gold, in: Capsule()).shadow(color: .black.opacity(0.6), radius: 3, y: 2)
                    .scaleEffect(t < 0.15 ? 0.6 + 0.55 * (t / 0.15) : 1).offset(y: -26 * t * scale).opacity(min(1, max(0, fade)))
            } else if f.pair {
                HStack(spacing: 2 * scale) { PlayingCard(code: nil, width: 24 * scale); PlayingCard(code: nil, width: 24 * scale) }
            } else if f.card {
                PlayingCard(code: nil, width: 20 * scale)
            } else {
                ChipPile(amount: f.amount, size: 12 * scale, label: false)
                    .scaleEffect(f.allIn ? 1 + 0.5 * sin(progress * .pi) : 1)
                    .overlay(alignment: .top) {
                        if f.allIn {
                            Text(L("all_in")).font(.system(size: 11 * scale, weight: .bold)).foregroundStyle(.white).padding(.horizontal, 8 * scale).padding(.vertical, 1)
                                .background(Palette.danger, in: Capsule()).offset(y: -22 * scale)
                        }
                    }
            }
        }
        .opacity(visible ? 1 : 0)
        .position(x: x, y: y)
        .task(id: f.id) {
            if f.delay > 0 { try? await Task.sleep(nanoseconds: UInt64(f.delay * 1_000_000_000)) }
            visible = true
            withAnimation(f.text != nil ? .linear(duration: f.duration) : .easeInOut(duration: f.duration)) { progress = 1 }
            try? await Task.sleep(nanoseconds: UInt64((f.duration + 0.04) * 1_000_000_000))
            fx.flights.removeAll { $0.id == f.id }
        }
    }
}
