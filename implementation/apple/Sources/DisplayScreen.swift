import CoreImage.CIFilterBuiltins
import SwiftUI

// The table viewer: a screen lying in the middle of the table shows the game to everyone sitting
// round it while each player plays on a phone. It holds no seat, sees no hidden cards and shows no
// video. Each name plate faces its player; the board, the pot and the news in the middle face both
// long sides. The only controls: turning the seats to where people sit (drag a name plate round
// the edge, or the labelled arrows in the corner), and stopping.
struct DisplayScreen: View {
    @Bindable var model: TableModel
    @State private var confirmStop = false
    @State private var fx = TableEffects()
    // How far the seats are turned round the table, in whole turns; kept on this device.
    @AppStorage("viewerTurn") private var turn: Double = 0
    // While a name plate is dragged round the edge: the turn under the finger, and where the
    // finger last was, as a fraction of the way round.
    @State private var dragTurn: Double? = nil
    @State private var dragLast: Double? = nil

    var body: some View {
        let view = model.view
        ZStack {
            PokerBackground(theme: themeFor(view?.roomId ?? model.roomId), figures: false)
            if let view, view.isDisplay {
                GeometryReader { geo in
                    let g = ViewerGeometry(view: view, size: geo.size, turn: dragTurn ?? turn)
                    TimelineView(.periodic(from: .now, by: 0.25)) { tl in
                        // Countdowns stand still while a player holds the play clock.
                        ViewerTable(view: view, viewAt: model.viewAt, now: view.held ? model.viewAt : tl.date, g: g, fx: fx,
                                    onDrag: { drag(to: $0, g) }, onDragEnd: { settle(g) })
                    }
                    .onChange(of: view.version, initial: true) { _, _ in fx.onView(view, spots: g.spots) }
                }
                .environment(\.cardTheme, view.roomId)
            } else {
                ProgressView().controlSize(.large)
            }
        }
        .ignoresSafeArea()
        .overlay(alignment: .topLeading) {
            HStack(spacing: 14) {
                corner("xmark", L("viewer_stop")) { confirmStop = true }
                // Half a seat at a time either way, so a seat or the gap between two can face any side.
                if !Platform.uprightBoard {
                let step = 1 / Double(2 * max(2, view?.players.count ?? 2))
                HStack(spacing: 0) {
                    turnButton("chevron.left", L("viewer_turn_back")) { turn -= step }
                    Text(L("viewer_turn")).font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.gold.opacity(0.85)).padding(.horizontal, 2)
                    turnButton("chevron.right", L("viewer_turn_on")) { turn += step }
                }
                .background(Color.black.opacity(0.35), in: Capsule())
                .overlay(Capsule().stroke(Palette.gold.opacity(0.3), lineWidth: 1))
                }
            }
            .padding(18)
        }
        .tableStatusBarHidden()
        .persistentSystemOverlays(.hidden)
        // Nobody touches the viewer; it must not go to sleep on the table.
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
        .alert(L("viewer_stop"), isPresented: $confirmStop) {
            Button(L("viewer_stop"), role: .destructive) { model.stopDisplay() }
            Button(L("cancel"), role: .cancel) {}
        } message: { Text(L("viewer_stop_confirm")) }
        #if os(tvOS)
        .onExitCommand { confirmStop = true }
        #endif
    }

    // A name plate dragged round the edge: every seat follows the finger.
    private func drag(to p: CGPoint, _ g: ViewerGeometry) {
        let f = g.ring.fraction(toward: p, from: g.centre)
        guard let last = dragLast else {
            dragLast = f
            dragTurn = turn
            return
        }
        var d = f - last
        d -= (d + 0.5).rounded(.down)
        dragLast = f
        dragTurn = (dragTurn ?? turn) + d
    }

    // Let go: the seats settle on the nearest half seat.
    private func settle(_ g: ViewerGeometry) {
        let step = 1 / Double(2 * g.n)
        let snapped = ((dragTurn ?? turn) / step).rounded() * step
        dragLast = nil
        withAnimation(.easeOut(duration: 0.3)) {
            turn = snapped
            dragTurn = nil
        }
    }

    private func turnButton(_ symbol: String, _ label: String, action: @escaping () -> Void) -> some View {
        Button { withAnimation(.easeInOut(duration: 0.5), action) } label: {
            Image(systemName: symbol).font(.system(size: 17, weight: .bold)).foregroundStyle(Palette.gold.opacity(0.85)).frame(width: 44, height: 44)
        }
        .platformButtonStyle()
        .accessibilityLabel(label)
    }

    private func corner(_ symbol: String, _ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol).font(.system(size: 18, weight: .semibold)).foregroundStyle(Palette.gold.opacity(0.75))
                .frame(width: 44, height: 44).background(Color.black.opacity(0.35), in: Circle())
                .overlay(Circle().stroke(Palette.gold.opacity(0.3), lineWidth: 1))
        }
        .platformButtonStyle()
        .accessibilityLabel(label)
    }
}

// Points round an ellipse at equal distances along it, from the bottom, clockwise on screen.
// Ring (points round an ellipse) is table-layout's; see ViewerBridge.swift.

struct ViewerGeometry {
    let size: CGSize
    let u: CGFloat
    let n: Int
    let turn: Double
    let ring: Ring
    let plate: CGSize
    let gap: CGFloat
    let front: CGFloat
    let upright: Bool
    private let showdown: Showdown?
    private let uncontested: Bool
    private let places: [String: Int]

    init(view: GameView, size: CGSize, turn: Double, upright: Bool = Platform.uprightBoard) {
        self.size = size
        self.upright = upright
        showdown = Showdown.of(view)
        uncontested = Showdown.uncontested(view)
        self.turn = upright ? 0 : turn
        u = upright ? min(min(size.width, size.height) / 560, size.width / 760) : min(size.width, size.height) / 560
        let players = view.players.sorted { $0.seat < $1.seat }
        n = max(2, players.count)
        places = Dictionary(uniqueKeysWithValues: players.enumerated().map { ($1.id, $0) })
        plate = CGSize(width: (n >= 8 ? 172 : 200) * u, height: 60 * u)
        gap = 6 * u
        front = 50 * u
        ring = Ring(rx: max(1, size.width / 2 - 14 * u - (upright ? plate.width : plate.height) / 2), ry: max(1, size.height / 2 - (upright ? 72 : 14) * u - plate.height / 2))
    }

    var centre: CGPoint { CGPoint(x: size.width / 2, y: size.height / 2) }
    func place(_ p: PlayerView) -> Int { places[p.id] ?? 0 }
    func fraction(_ i: Int) -> Double { turn + Double(i) / Double(n) }

    // A seat: its plate's centre and how far it is turned so its foot faces out.
    func seat(_ i: Int) -> (centre: CGPoint, angle: Double) {
        if upright {
            let point = Self.uprightSeats(n)[i % n]
            return (CGPoint(x: point.x * size.width, y: point.y * size.height), 0)
        }
        let t = ring.angle(fraction(i))
        let p = ring.point(t)
        return (CGPoint(x: centre.x + p.x, y: centre.y + p.y), ring.outward(t) - .pi / 2)
    }

    private static func uprightSeats(_ count: Int) -> [CGPoint] {
        let points: [(Double, Double)]
        switch count {
        case 2: points = [(0.5, 0.86), (0.5, 0.14)]
        case 3: points = [(0.5, 0.86), (0.25, 0.14), (0.75, 0.14)]
        case 4: points = [(0.5, 0.86), (0.14, 0.5), (0.5, 0.14), (0.86, 0.5)]
        case 5: points = [(0.5, 0.86), (0.14, 0.5), (0.32, 0.14), (0.68, 0.14), (0.86, 0.5)]
        case 6: points = [(0.3, 0.86), (0.14, 0.5), (0.3, 0.14), (0.7, 0.14), (0.86, 0.5), (0.7, 0.86)]
        case 7: points = [(0.5, 0.86), (0.22, 0.74), (0.14, 0.4), (0.32, 0.14), (0.68, 0.14), (0.86, 0.4), (0.78, 0.74)]
        case 8: points = [(0.3, 0.86), (0.14, 0.62), (0.14, 0.36), (0.3, 0.14), (0.7, 0.14), (0.86, 0.36), (0.86, 0.62), (0.7, 0.86)]
        default: points = [(0.5, 0.86), (0.22, 0.86), (0.14, 0.6), (0.14, 0.34), (0.34, 0.14), (0.66, 0.14), (0.86, 0.34), (0.86, 0.6), (0.78, 0.86)]
        }
        return points.map { CGPoint(x: $0.0, y: $0.1) }
    }

    // In a seat's own frame (x along the plate, y out toward the player, from the plate's centre):
    // the two cards at the plate's left, the chips in front of the plate.
    var cardWidth: CGFloat { 26 * u }
    var cardsAt: CGPoint { CGPoint(x: -plate.width / 2 + 10 * u + cardWidth + 1.5 * u, y: -3 * u) }
    var frontAt: CGPoint { CGPoint(x: 0, y: -(plate.height / 2 + gap + front / 2)) }
    func onScreen(_ i: Int, _ local: CGPoint) -> CGPoint {
        let s = seat(i)
        return turned(local, by: s.angle, about: s.centre)
    }

    // The middle, inside the seats' reach, turned to lie along the long sides.
    var middleAngle: Double { !upright && size.height > size.width ? .pi / 2 : 0 }
    var middle: CGSize {
        if upright {
            return CGSize(width: max(120 * u, size.width * 0.72 - plate.width - 2 * gap), height: max(120 * u, size.height * 0.72 - plate.height - front - gap))
        }
        let reach = plate.height / 2 + gap + front + 16 * u
        return CGSize(width: 2 * (max(ring.rx, ring.ry) - reach), height: 2 * (min(ring.rx, ring.ry) - reach))
    }
    var middleUnit: CGFloat { upright ? u * min(1, middle.width / (420 * u)) : u }
    var middleBelow: CGFloat { showdown.map { showcaseHeight($0) } ?? (uncontested ? 46 * middleUnit : 0) }
    var middleFit: CGFloat {
        let inner = middle.height - (upright ? 1 : 2) * 50 * middleUnit
        return min(1, max(0.3, (inner - boardCard * 1.4 - 8 * middleUnit) / max(1, middleBelow)))
    }
    var middleRowY: CGFloat {
        (upright ? 25 * middleUnit : 0) - (middleBelow > 0 ? (middleBelow * middleFit + 8 * middleUnit) / 2 : 0)
    }
    func showcaseCard(_ sd: Showdown) -> CGFloat { (sd.winners.count > 2 ? 22 : sd.winners.count > 1 ? 26 : 32) * middleUnit }
    func showcaseHeight(_ sd: Showdown) -> CGFloat {
        let rows = CGFloat(sd.winners.count)
        return (sd.kind == "draw" ? 24 : 22) * middleUnit + rows * (showcaseCard(sd) * 1.4 * 1.2 + 7 * middleUnit) + (rows - 1) * 6 * middleUnit
    }
    func inMiddle(_ local: CGPoint) -> CGPoint { turned(local, by: middleAngle, about: centre) }
    // Along the middle's row: the burn pile and the deck, the five board cards, the pot ring.
    var boardCard: CGFloat { 44 * middleUnit }
    func boardX(_ i: Int) -> CGFloat { CGFloat(i - 2) * (boardCard + 6 * middleUnit) }
    var deckX: CGFloat { boardX(0) - boardCard / 2 - 27 * middleUnit }
    var burnX: CGFloat { deckX - 38 * middleUnit }
    var potX: CGFloat { boardX(4) + boardCard / 2 + 50 * middleUnit }

    // The same spots for the flights, as fractions of the screen.
    var spots: FlightSpots {
        func f(_ p: CGPoint) -> CGPoint { CGPoint(x: p.x / size.width, y: p.y / size.height) }
        return FlightSpots(
            deck: f(inMiddle(CGPoint(x: deckX, y: middleRowY))), burn: f(inMiddle(CGPoint(x: burnX, y: middleRowY))), pot: f(inMiddle(CGPoint(x: potX, y: middleRowY))),
            board: { i in f(inMiddle(CGPoint(x: boardX(i), y: middleRowY))) },
            seat: { f(seat(place($0)).centre) },
            cards: { f(onScreen(place($0), cardsAt)) },
            shown: { f(onScreen(place($0), cardsAt)) },
            bet: { f(onScreen(place($0), frontAt)) },
            showcase: false)
    }
}

// A seat's place on the ring, `inset` points in from it, turned so its foot faces out; moves round
// the ring, not across it, when the seats are turned.
private struct RingPlace: ViewModifier, Animatable {
    var fraction: Double
    let ring: Ring
    let centre: CGPoint
    let inset: CGFloat
    var upright = false
    var uprightCentre: CGPoint? = nil

    var animatableData: Double {
        get { fraction }
        set { fraction = newValue }
    }

    func body(content: Content) -> some View {
        let t = ring.angle(fraction)
        let p = ring.point(t)
        let out = ring.outward(t)
        content
            .rotationEffect(.radians(upright ? 0 : out - .pi / 2))
            .position(x: uprightCentre?.x ?? (centre.x + p.x - inset * CGFloat(cos(out))), y: uprightCentre.map { $0.y - inset } ?? (centre.y + p.y - inset * CGFloat(sin(out))))
    }
}

private struct ViewerTable: View {
    let view: GameView
    let viewAt: Date
    let now: Date
    let g: ViewerGeometry
    let fx: TableEffects
    // A name plate dragged round the edge, in the table's own coordinates.
    let onDrag: (CGPoint) -> Void
    let onDragEnd: () -> Void

    var body: some View {
        let w = g.size.width, h = g.size.height, u = g.u
        let players = view.players.sorted { $0.seat < $1.seat }
        let theme = themeFor(view.roomId)
        ZStack {
            Ellipse()
                .fill(RadialGradient(colors: [theme.felt, theme.felt, Color.black.opacity(0.35)], center: .center, startRadius: 0, endRadius: max(w, h) * 0.6))
                .overlay(Ellipse().stroke(Palette.feltEdge, lineWidth: 12 * u))
                .frame(width: w - 10 * u, height: h - 10 * u)
                .shadow(color: .black.opacity(0.6), radius: 14 * u, y: 8 * u)
                .position(x: w / 2, y: h / 2)
            ViewerMiddle(view: view, viewAt: viewAt, now: now, g: g, fx: fx)
                .frame(width: g.middle.width, height: g.middle.height)
                .rotationEffect(.radians(g.middleAngle))
                .position(x: w / 2, y: h / 2)
            ForEach(Array(players.enumerated()), id: \.element.id) { i, p in
                ViewerSeat(view: view, p: p, viewAt: viewAt, now: now, g: g, fx: fx)
                    .frame(width: g.plate.width, height: g.front + g.gap + g.plate.height)
                    .contentShape(Rectangle())
                    .modifier(ViewerDrag(enabled: !g.upright, onDrag: onDrag, onEnd: onDragEnd))
                    .modifier(RingPlace(fraction: g.fraction(i), ring: g.ring, centre: g.centre, inset: (g.front + g.gap) / 2, upright: g.upright, uprightCentre: g.upright ? g.seat(i).centre : nil))
            }
            FlightLayer(fx: fx, w: w, h: h, scale: 1.3 * u).position(x: w / 2, y: h / 2)
        }
        .frame(width: w, height: h)
        .coordinateSpace(name: "viewer")
    }
}

// One seat, the player's side at the foot: in front (toward the middle) the chips bet this street
// or the folded cards; then the name plate with the cards, the name, the chips left and what the
// player last did.
private struct ViewerSeat: View {
    let view: GameView
    let p: PlayerView
    let viewAt: Date
    let now: Date
    let g: ViewerGeometry
    let fx: TableEffects

    var body: some View {
        let u = g.u
        VStack(spacing: g.gap) {
            ZStack {
                if p.inHand && p.folded {
                    if !fx.isLanding("fold:\(p.id)") && view.phase != .handOver {
                        HStack(spacing: 3 * u) {
                            PlayingCard(code: nil, width: 24 * u)
                            PlayingCard(code: nil, width: 24 * u).rotationEffect(.degrees(8))
                        }
                        .opacity(0.75)
                    }
                } else if p.bet > 0 && !fx.isLanding("bet:\(p.id)") {
                    ChipPile(amount: p.bet, size: 15 * u, labelSize: 13 * u)
                }
            }
            .frame(width: g.plate.width, height: g.front)
            namePlate
        }
    }

    private var namePlate: some View {
        let u = g.u
        let hand = view.hand
        let acting = view.phase == .betting && hand?.actorId == p.id
        let shown = p.cards.contains { $0 != nil }
        let corner = 12 * u
        return HStack(spacing: 8 * u) {
            // The cards, each underlined green (the colour for a player's hand), face down until
            // shown; a fixed space, so the flights know where they land.
            let holding = p.inHand && (!p.folded || shown) && !p.cards.isEmpty && !fx.isLanding("cards:\(p.id)")
            HStack(spacing: 3 * u) {
                if holding {
                    ForEach(Array(p.cards.enumerated()), id: \.offset) { _, c in
                        PlayingCard(code: c, width: g.cardWidth).legendLine(Palette.good, width: g.cardWidth)
                    }
                }
            }
            .frame(width: g.cardWidth * 2 + 3 * u, height: g.cardWidth * 1.4, alignment: .leading)
            .offset(y: -3 * u)
            VStack(alignment: .leading, spacing: 1 * u) {
                Text(p.name + (p.isHost ? " \u{2605}" : "")).font(.system(size: 16 * u, weight: .semibold)).foregroundStyle(acting ? Palette.gold : .white).lineLimit(1).minimumScaleFactor(0.6)
                if view.status != .lobby {
                    HStack(spacing: 5 * u) {
                        // The chips left; at a full table only their amount, for room.
                        if g.n < 8 { ChipPile(amount: p.stack, size: 9 * u, label: false) }
                        Text(chips(p.stack)).font(.system(size: 15 * u, weight: .bold)).foregroundStyle(.white).fixedSize()
                    }
                }
                if let line = statusLine(hand: hand) {
                    Text(line.text).font(.system(size: 12 * u, weight: line.gold ? .semibold : .regular)).foregroundStyle(line.gold ? Palette.gold : .white.opacity(0.75)).lineLimit(1).minimumScaleFactor(0.6)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 10 * u)
        .frame(width: g.plate.width, height: g.plate.height)
        .background(Color.black.opacity(0.55), in: RoundedRectangle(cornerRadius: corner))
        // Whose turn it is: a gold edge and glow, and the clock along the plate's foot.
        .overlay(alignment: .bottom) {
            if acting, !p.isBot, !view.paused, let left = remaining(hand?.remainingMs, viewAt: viewAt, now: now, paused: false), left <= 30000 {
                GrowingClock(left: left, total: 30000, now: now, width: g.plate.width - 24 * u, height: 5 * u).padding(.bottom, 4 * u)
            }
        }
        .overlay(RoundedRectangle(cornerRadius: corner).stroke(acting ? Palette.gold : Palette.gold.opacity(0.25), lineWidth: acting ? 3 * u : 1))
        .shadow(color: acting ? Palette.gold.opacity(0.7) : .black.opacity(0.5), radius: acting ? 14 * u : 4 * u)
        .overlay(alignment: .topTrailing) {
            if let hand, hand.button == p.seat, view.status == .running {
                Text(L("dealer")).font(.system(size: 13 * u, weight: .bold)).foregroundStyle(Palette.ink)
                    .frame(width: 24 * u, height: 24 * u).background(Palette.cardFace, in: Circle()).overlay(Circle().stroke(Color(red: 0.2, green: 0.2, blue: 0.2), lineWidth: 1))
                    .offset(x: 8 * u, y: -8 * u)
            }
        }
        .opacity(p.out || p.folded ? 0.55 : 1)
    }

    // At the end, the place; else a shown hand's name; else where the player stands; else the last
    // thing they did.
    private func statusLine(hand: HandView?) -> (text: String, gold: Bool)? {
        if view.status == .completed || view.status == .cancelled {
            guard let place = p.place else { return nil }
            return (place == 1 ? L("winner") : L("place", place), place == 1)
        }
        if let rank = p.hand, !p.cards.isEmpty, p.cards.allSatisfy({ $0 != nil }) { return (rank.name, true) }
        if p.out { return (L("out"), false) }
        if p.sittingOut { return (L("sitting_out"), false) }
        if !p.connected && !p.isBot { return (L("away"), false) }
        if p.allIn { return (L("all_in_mark"), true) }
        if p.folded { return (L("folded"), false) }
        if let a = p.lastAction, hand != nil { return (actionText(a), true) }
        return nil
    }
}

// The middle of the table, laid along a long side: the news facing one long side and again facing
// the other; between them a row of burn pile, deck, board and pot, and at a showdown the winning
// hands under it; before the game, how to join.
private struct ViewerMiddle: View {
    let view: GameView
    let viewAt: Date
    let now: Date
    let g: ViewerGeometry
    let fx: TableEffects

    private var u: CGFloat { g.middleUnit }
    private var newsHeight: CGFloat { 44 * u }
    private var sd: Showdown? { Showdown.of(view) }

    var body: some View {
        let size = g.middle
        ZStack {
            if !g.upright { news.rotationEffect(.degrees(180)).position(x: size.width / 2, y: newsHeight / 2) }
            news.position(x: size.width / 2, y: g.upright ? newsHeight / 2 : size.height - newsHeight / 2)
            if view.status == .lobby {
                lobby.scaleEffect(g.upright ? min(1, max(0.3, (size.height - newsHeight - 12 * u) / (130 * u))) : 1)
                    .position(x: size.width / 2, y: (size.height + (g.upright ? newsHeight : 0)) / 2)
            } else if let hand = view.hand {
                // The row moves up to make room for the winning hands under it.
                let below = g.middleBelow
                let fit = g.middleFit
                let rowY = g.middleRowY
                row(hand).position(x: size.width / 2, y: size.height / 2 + rowY)
                if let sd {
                    showcase(sd).scaleEffect(fit).position(x: size.width / 2, y: size.height / 2 + rowY + g.boardCard * 0.7 + 8 * u + below * fit / 2)
                } else if Showdown.uncontested(view) {
                    VStack(spacing: 6 * u) {
                        Text(L("uncontested")).textCase(.uppercase).font(.system(size: 18 * u, weight: .bold)).tracking(2).foregroundStyle(Palette.gold)
                        Text(L("everyone_folded")).font(.system(size: 14 * u)).foregroundStyle(.white.opacity(0.85))
                    }
                    .position(x: size.width / 2, y: size.height / 2 + rowY + g.boardCard * 0.7 + 8 * u + below / 2)
                }
            }
        }
        .frame(width: size.width, height: size.height)
    }

    // Burn pile, deck, the five board cards and the pot ring, at the spots the flights use.
    private func row(_ hand: HandView) -> some View {
        let height = g.boardCard * 1.4
        let mid = g.middle.width / 2
        let burns = max(0, (hand.board.count >= 3 ? 1 : 0) + (hand.board.count >= 4 ? 1 : 0) + (hand.board.count >= 5 ? 1 : 0) - (fx.isLanding("burn") ? 1 : 0))
        let pots = hand.pots.reduce(0) { $0 + $1.amount }
        return ZStack {
            ZStack { ForEach(0..<burns, id: \.self) { i in PlayingCard(code: nil, width: 26 * u).rotationEffect(.degrees(Double(i - 1) * 7)).offset(x: CGFloat(i) * 3 * u, y: CGFloat(i) * 2 * u) } }
                .position(x: mid + g.burnX, y: height / 2)
            ZStack { ForEach(0..<3, id: \.self) { i in PlayingCard(code: nil, width: 26 * u).offset(x: CGFloat(i) * u, y: -CGFloat(i) * 1.5 * u) } }
                .position(x: mid + g.deckX, y: height / 2)
            // The community cards, every place underlined gold, the colour for them.
            ForEach(0..<5, id: \.self) { i in
                Group {
                    if let c = hand.board[safe: i], !fx.isLanding("board:\(i)") { PlayingCard(code: c, width: g.boardCard) } else { CardSlot(width: g.boardCard) }
                }
                .legendLine(Palette.gold, width: g.boardCard)
                .position(x: mid + g.boardX(i), y: height / 2)
            }
            // The pot ring, always there so the pot has an obvious home; empty once the hand is won.
            ZStack {
                Circle().stroke(Color.white.opacity(0.3), lineWidth: 1.5 * u)
                Text(L("pot")).textCase(.uppercase).font(.system(size: 10 * u)).tracking(1).foregroundStyle(.white.opacity(0.5)).offset(y: -24 * u)
                if view.phase != .handOver, pots > 0, !fx.isLanding("pot") {
                    ChipPile(amount: pots, size: 13 * u, labelSize: 12 * u).offset(y: 6 * u)
                }
            }
            .frame(width: 72 * u, height: 72 * u)
            .position(x: mid + g.potX, y: height / 2)
        }
        .frame(width: g.middle.width, height: height)
    }

    private func showcaseCard(_ sd: Showdown) -> CGFloat { g.showcaseCard(sd) }

    // The winning hands in reading order, underlined green from the hand and gold from the board,
    // kickers after a gap; a draw is titled and names each hand; one winner's hand is named under it.
    private func showcase(_ sd: Showdown) -> some View {
        let cw = showcaseCard(sd)
        return VStack(spacing: 6 * u) {
            if sd.kind == "draw" { Text(L("split_pot")).textCase(.uppercase).font(.system(size: 15 * u, weight: .bold)).tracking(2).foregroundStyle(Palette.gold).frame(height: 18 * u) }
            ForEach(Array(sd.winners.enumerated()), id: \.offset) { _, w in
                let best = w.hand?.best ?? []
                HStack(alignment: .top, spacing: 4 * u) {
                    if sd.kind == "draw" { Text(w.name).font(.system(size: 14 * u, weight: .semibold)).foregroundStyle(.white).lineLimit(1).frame(width: 90 * u, alignment: .trailing).padding(.trailing, 6 * u) }
                    ForEach(Array(best.enumerated()), id: \.offset) { i, c in
                        VStack(spacing: 3 * u) {
                            PlayingCard(code: c.code, width: cw)
                            Capsule().fill(c.from == "hole" ? Palette.good : Palette.gold).frame(width: cw, height: 4 * u)
                        }
                        // Community cards higher, toward the board; the hand's own a fifth of a card lower.
                        .padding(.top, c.from == "board" ? 0 : cw * 1.4 * 0.2)
                        .padding(.leading, c.spare && i > 0 && !best[i - 1].spare ? 10 * u : 0)
                    }
                    if sd.kind == "draw" { Spacer().frame(width: 96 * u) }
                }
            }
            if sd.kind != "draw", let name = sd.winners.first?.hand?.name {
                Text(name + (sd.kind == "kicker" ? " \u{00B7} " + L("won_on_kicker") : "")).font(.system(size: 14 * u, weight: .semibold)).foregroundStyle(.white.opacity(0.9)).frame(height: 16 * u)
            }
        }
    }

    // Before the game: the room, how to join, and a code to scan for the app.
    private var lobby: some View {
        HStack(spacing: 20 * u) {
            if let url = view.inviteUrl, let qr = qrCode(url) {
                Image(uiImage: qr).interpolation(.none).resizable().frame(width: 110 * u, height: 110 * u)
                    .padding(8 * u).background(Color.white, in: RoundedRectangle(cornerRadius: 10 * u))
            }
            VStack(alignment: .leading, spacing: 6 * u) {
                Text(roomName(view.roomId)).font(.system(size: 30 * u, weight: .bold)).foregroundStyle(Palette.gold)
                if view.inviteUrl != nil { Text(L("viewer_scan")).font(.system(size: 15 * u)).foregroundStyle(.white.opacity(0.85)) }
                Text(L("viewer_join", roomName(view.roomId))).font(.system(size: 15 * u)).foregroundStyle(.white.opacity(0.85))
                if !g.upright { Text(L("viewer_drag")).font(.system(size: 15 * u)).foregroundStyle(Palette.gold.opacity(0.9)).fixedSize(horizontal: false, vertical: true) }
            }
            .frame(maxWidth: 300 * u, alignment: .leading)
        }
    }

    // What is happening: the last event while the table settles, else the prompt; under it the
    // blinds. Narrow enough to stay clear of the seats.
    private var news: some View {
        let settling = (remaining(view.hand?.settleMs, viewAt: viewAt, now: now, paused: view.paused) ?? 0) > 0
        let main = (settling && !view.paused ? eventText(view) : nil) ?? promptText(view)
        return VStack(spacing: 2 * u) {
            Text(main).font(.system(size: 19 * u, weight: .bold)).foregroundStyle(Palette.gold).lineLimit(1).minimumScaleFactor(0.5)
            if let details { Text(details).font(.system(size: 12 * u)).foregroundStyle(.white.opacity(0.75)).lineLimit(1).minimumScaleFactor(0.5) }
        }
        .padding(.horizontal, 16 * u)
        .frame(height: newsHeight)
        .background(Color.black.opacity(0.4), in: Capsule())
        .frame(maxWidth: g.middle.width * 0.56)
    }

    private var details: String? {
        guard view.status == .running, let c = view.clock else { return nil }
        let left = remaining(c.nextLevelInMs, viewAt: viewAt, now: now, paused: view.paused || view.phase == .rebuy) ?? 0
        return L("level", c.level) + " \u{00B7} " + L("blinds", chips(c.sb), chips(c.bb)) + " \u{00B7} " + L("next_level", chips(c.nextSb), chips(c.nextBb), mmss(left))
    }
}

private func qrCode(_ text: String) -> UIImage? {
    let filter = CIFilter.qrCodeGenerator()
    filter.message = Data(text.utf8)
    filter.correctionLevel = "M"
    guard let out = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 8, y: 8)),
          let cg = CIContext().createCGImage(out, from: out.extent) else { return nil }
    return UIImage(cgImage: cg)
}

private struct ViewerDrag: ViewModifier {
    let enabled: Bool
    let onDrag: (CGPoint) -> Void
    let onEnd: () -> Void

    func body(content: Content) -> some View {
        #if os(tvOS)
        content
        #else
        if enabled {
            content.gesture(DragGesture(minimumDistance: 6, coordinateSpace: .named("viewer")).onChanged { onDrag($0.location) }.onEnded { _ in onEnd() })
        } else { content }
        #endif
    }
}
