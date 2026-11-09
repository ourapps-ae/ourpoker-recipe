import SwiftUI

struct TableScreen: View {
    @Bindable var model: TableModel
    @State private var confirmEnd = false
    @State private var fx = TableEffects()

    var body: some View {
        guard let view = model.view else { return AnyView(EmptyView()) }
        return AnyView(
            TimelineView(.periodic(from: .now, by: 0.25)) { timeline in
                // While anyone holds the play clock (looking at cards, reading a guide), every
                // countdown stands still where the server left it.
                let now = view.held ? model.viewAt : timeline.date
                // The settle after a deal or an action: the event is announced and nobody's clock runs.
                let settling = (remaining(view.hand?.settleMs, viewAt: model.viewAt, now: now, paused: view.paused) ?? 0) > 0
                ZStack {
                    PokerBackground(theme: themeFor(view.roomId), figures: false)
                    GeometryReader { geo in
                        let size = geo.size
                        if size.width < 600 {
                            // A phone, or a narrow window: everything in one scrolling column.
                            ScrollView {
                                VStack(spacing: 8) {
                                    header(view, now: now)
                                    levelCard(view, now: now)
                                    banner(view, now: now, settling: settling)
                                    ShowCardsButton(model: model, view: view)
                                    table(view, now: now)
                                    mine(view, now: now, settling: settling, cardWidth: 72)
                                    if let me = view.me { HandPanel(model: model, view: view, me: me) }
                                    rest(view)
                                }
                                .padding(12)
                            }
                            .safeAreaInset(edge: .bottom, spacing: 0) { pinnedBet(view) }
                        } else if size.width > size.height {
                            // A wide screen: the table as tall as it allows on the left, the rest beside it.
                            let tableHeight = size.height - 24 - 58
                            HStack(alignment: .top, spacing: 16) {
                                VStack(spacing: 8) {
                                    header(view, now: now)
                                    scaled(table(view, now: now), width: tableHeight / 1.3)
                                }
                                .frame(width: tableHeight / 1.3)
                                ScrollView {
                                    VStack(spacing: 12) {
                                        levelCard(view, now: now)
                                        banner(view, now: now, settling: settling)
                                        ShowCardsButton(model: model, view: view)
                                        mine(view, now: now, settling: settling, cardWidth: 96)
                                        if let me = view.me { HandPanel(model: model, view: view, me: me) }
                                        rest(view)
                                    }
                                }
                            }
                            .padding(12)
                            // Over the column beside the table, where your cards are.
                            .overlay(alignment: .bottomTrailing) {
                                pinnedBet(view).frame(width: size.width - tableHeight / 1.3 - 16)
                            }
                        } else {
                            // A tall screen: the table as large as leaves room for your cards below.
                            let tableWidth = min(size.width - 24, (size.height - 24 - 58 - 42 - 16 - 290) / 1.3)
                            VStack(spacing: 8) {
                                header(view, now: now)
                                levelCard(view, now: now)
                                banner(view, now: now, settling: settling)
                                ShowCardsButton(model: model, view: view)
                                scaled(table(view, now: now), width: tableWidth)
                                HStack(alignment: .top, spacing: 16) {
                                    VStack(spacing: 8) {
                                        mine(view, now: now, settling: settling, cardWidth: 88)
                                        rest(view)
                                    }
                                    .frame(maxWidth: .infinity)
                                    if let me = view.me { ScrollView { HandPanel(model: model, view: view, me: me) }.frame(maxWidth: .infinity) }
                                }
                            }
                            .padding(12)
                            .overlay(alignment: .bottom) { pinnedBet(view).frame(maxWidth: 560) }
                        }
                    }
                }
                #if os(tvOS)
                .disabled(model.zoom != nil || view.legal.rebuy)
                #endif
                .environment(\.cardTheme, view.roomId)
                .onChange(of: view.version, initial: true) { _, _ in fx.onView(view) }
                .onChange(of: timeline.date) { _, date in model.warnIfTimeIsShort(now: date) }
                .alert(L("end_game"), isPresented: $confirmEnd) {
                    Button(L("end_game"), role: .destructive) { model.cancel() }
                    Button(L("cancel"), role: .cancel) {}
                } message: { Text(L("end_game_confirm")) }
                .overlay { if view.legal.rebuy { RebuyDialog(model: model, view: view, now: now) } }
                // Cards large over the screen until tapped away.
                .overlay {
                    if let zoom = model.zoom, !ZoomOverlay.rows(view, zoom).isEmpty {
                        ZoomOverlay(model: model, view: view, zoom: zoom, now: now, landing: fx.isLanding("cards:\(view.you)"))
                    }
                }
                .onChange(of: view.hand?.no) { _, _ in model.zoom = nil }
                .alert(L("update_needed"), isPresented: .constant(view.phase == .unknown)) {} message: { Text(L("update_body", currentVersion)) }
            }
        )
    }

    private func banner(_ view: GameView, now: Date, settling: Bool) -> some View {
        PromptBanner((settling && !view.paused ? eventText(view) : nil) ?? promptText(view)) {
            if let hand = view.hand, view.phase == .betting, let actor = view.player(hand.actorId), !actor.isBot, !view.paused,
               let left = remaining(hand.remainingMs, viewAt: model.viewAt, now: now, paused: false), left <= 30000 {
                Text(String((left + 999) / 1000)).font(.caption.bold()).foregroundStyle(left < 8000 ? Palette.danger : .white)
                    .frame(width: 44, height: 22).background(Color.black.opacity(0.4), in: Capsule())
            }
        }
    }

    private func table(_ view: GameView, now: Date) -> some View {
        PokerTable(model: model, view: view, now: now, fx: fx)
            // Back up a level from the top left: leave the table (a running game keeps
            // your seat, sitting out, until you come back).
            .overlay(alignment: .topLeading) {
                if view.legal.leave {
                    RoundIconButton(label: L("leave"), enabled: !model.busy, filled: false, action: model.leave) { fg in BackGlyph(tint: fg) }
                        .background(Color.black.opacity(0.35), in: Circle()).padding(4)
                }
            }
            .overlay(alignment: .topTrailing) {
                // End game: the gold circle with a cross in the table's corner, as in Skull.
                if view.legal.cancel {
                    RoundIconButton(label: L("end_game"), enabled: !model.busy, filled: true, action: { confirmEnd = true }) { fg in
                        Image(systemName: "xmark").font(.system(size: 18, weight: .bold)).foregroundStyle(fg)
                    }
                    .padding(4)
                }
            }
    }

    // The table is laid out at a phone's size and scaled up, so cards, chips and names grow with it.
    private func scaled(_ content: some View, width: CGFloat) -> some View {
        let base: CGFloat = 400
        let s = width / base
        return content
            .frame(width: base, height: base * 1.3)
            .scaleEffect(s, anchor: .topLeading)
            .frame(width: width, height: width * 1.3, alignment: .topLeading)
    }

    @ViewBuilder
    private func mine(_ view: GameView, now: Date, settling: Bool, cardWidth: CGFloat) -> some View {
        if let me = view.me { MyArea(model: model, view: view, me: me, hideCards: fx.isLanding("cards:\(me.id)"), now: now, cardWidth: cardWidth) }
        #if os(tvOS)
        HStack {
            if !(view.me?.cards.isEmpty ?? true) { Button(L("zoom_cards")) { model.zoom = view.me?.folded == true ? .folded : .mine } }
            if !(view.hand?.board.isEmpty ?? true) { Button(L("on_table")) { model.zoom = .board } }
        }.buttonStyle(.bordered)
        HStack {
            ForEach(view.legal.show, id: \.self) { index in
                Button(L("show_cards") + " \(index + 1)") { model.show([index]) }.disabled(model.busy)
            }
        }.buttonStyle(.bordered)
        ForEach(view.players.filter { $0.id != view.you && !$0.cards.isEmpty && $0.cards.allSatisfy { $0 != nil } }) { p in
            Button(p.name) { model.zoom = .hand(p.id) }.buttonStyle(.bordered)
        }
        #endif
    }

    @ViewBuilder
    private func rest(_ view: GameView) -> some View {
        ResultPanel(model: model, view: view)
        controls(view)
        if let error = errorText(model.error) { Text(error).foregroundStyle(.red).font(.footnote) }
    }

    private func header(_ view: GameView, now: Date) -> some View {
        HStack(alignment: .center) {
            Text(roomName(view.roomId)).font(.title.bold()).lineLimit(1).minimumScaleFactor(0.5)
            Spacer()
            if !view.soloGame {
                if model.video.connected { MediaToggles(session: model.video) }
                else if model.video.canReconnect { ReconnectButton(action: model.resumeVideo) }
            }
            SoundToggle(session: model.video)
            HelpBulb { Sound.play(.click); model.showHelp = true }
        }
        .padding(.horizontal, 4)
    }

    // Choosing a bet, pinned to the bottom of the screen; the large cards keep their own.
    @ViewBuilder
    private func pinnedBet(_ view: GameView) -> some View {
        if !(model.zoom.map { !ZoomOverlay.rows(view, $0).isEmpty } ?? false) {
            BetPanel(model: model, view: view)
                .background(Palette.surface, in: RoundedRectangle(cornerRadius: 16))
                .padding(.horizontal, 12).padding(.bottom, 8)
        }
    }

    // The level, the blinds and the time to the next level, in a card above the prompt; the
    // blinds and the time in bold. Under it, who holds the play clock.
    @ViewBuilder
    private func levelCard(_ view: GameView, now: Date) -> some View {
        if let c = view.clock {
            let left = remaining(c.nextLevelInMs, viewAt: model.viewAt, now: now, paused: view.paused || view.phase == .rebuy) ?? 0
            let holds = (view.holds ?? []).filter { $0.playerId != view.you }
            VStack(alignment: .leading, spacing: 2) {
                Text(boldParts(L("level", c.level) + " \u{00B7} " + L("blinds", "\u{1}" + chips(c.sb) + "\u{2}", "\u{1}" + chips(c.bb) + "\u{2}") + " \u{00B7} " + L("next_level", chips(c.nextSb), chips(c.nextBb), "\u{1}" + mmss(left) + "\u{2}")))
                    .font(.caption).foregroundStyle(.white.opacity(0.85)).lineLimit(1).minimumScaleFactor(0.7)
                ForEach(Array(holds.enumerated()), id: \.offset) { _, x in
                    Text(L(x.kind == "look" ? "hold_look" : "hold_learn", view.name(x.playerId))).font(.caption2).foregroundStyle(Palette.gold)
                }
            }
            .padding(.horizontal, 12).padding(.vertical, 5)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.ultraThinMaterial.opacity(0.55), in: RoundedRectangle(cornerRadius: 12))
            .background(Palette.surface.opacity(0.2), in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Palette.gold.opacity(0.3), lineWidth: 1))
            .guideAnchor("level")
        }
    }

    // Text with the parts between \u{1} and \u{2} in bold white.
    private func boldParts(_ s: String) -> AttributedString {
        var out = AttributedString()
        var bold = false
        for part in s.split(omittingEmptySubsequences: false, whereSeparator: { $0 == "\u{1}" || $0 == "\u{2}" }).enumerated().map({ $0 }) {
            var a = AttributedString(String(part.element))
            if bold { a.font = .caption.weight(.heavy); a.foregroundColor = .white }
            out += a
            bold.toggle()
        }
        return out
    }

    private func controls(_ view: GameView) -> some View {
        let legal = view.legal
        return HStack {
            if legal.pause { Button(L("pause"), action: model.pause) }
            if legal.resume { Button(L("resume"), action: model.resume) }
            if legal.sitOut { Button(L("sit_out"), action: model.sitOut) }
            Spacer()
        }
        .font(.subheadline)
        .disabled(model.busy)
        .frame(minHeight: 44)
    }
}

// Seats on an ellipse, yours at the bottom; board and pots in the middle.
private struct PokerTable: View {
    let model: TableModel
    let view: GameView
    let now: Date
    let fx: TableEffects

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width, h = geo.size.height
            let hand = view.hand
            let n = max(2, view.players.count)
            let mySeat = view.me?.seat ?? 0
            ZStack {
                Ellipse()
                    .fill(RadialGradient(colors: [themeFor(view.roomId).felt, themeFor(view.roomId).felt, Color.black.opacity(0.35)], center: .center, startRadius: 0, endRadius: w * 0.55))
                    .overlay(Ellipse().stroke(Palette.feltEdge, lineWidth: 7))
                    .frame(width: w * 0.9, height: h * 0.82)
                    .position(x: w / 2, y: h / 2)
                    .shadow(color: .black.opacity(0.6), radius: 10, y: 6)
                // Whose turn it is: the light glides to their seat.
                let actorK: Int? = view.phase == .betting ? hand?.actorId.flatMap { id in view.player(id).map { Spots.seatIndex($0, view) } } : nil
                TurnLight(actorK: actorK, n: n, w: w, h: h).position(x: w / 2, y: h / 2)
                // The deck and the burn pile above the board.
                ZStack { ForEach(0..<3, id: \.self) { i in PlayingCard(code: nil, width: 20).offset(x: CGFloat(i), y: CGFloat(-i) * 1.5) } }
                    .position(x: w * Spots.deck.x, y: h * Spots.deck.y)
                if let hand {
                    let burns = (hand.board.count >= 3 ? 1 : 0) + (hand.board.count >= 4 ? 1 : 0) + (hand.board.count >= 5 ? 1 : 0) - (fx.isLanding("burn") ? 1 : 0)
                    ZStack { ForEach(0..<max(0, burns), id: \.self) { i in PlayingCard(code: nil, width: 20).rotationEffect(.degrees(Double(i - 1) * 7)).offset(x: CGFloat(i) * 3, y: CGFloat(i) * 2) } }
                        .position(x: w * Spots.burn.x, y: h * Spots.burn.y)
                }
                // Centre: the board, with the pot below it. Tap the board to see the community cards large.
                // The community cards, every place underlined gold, the legend's colour for them.
                HStack(spacing: 4) {
                    ForEach(0..<5, id: \.self) { i in
                        Group {
                            if let c = hand?.board[safe: i], !fx.isLanding("board:\(i)") { PlayingCard(code: c, width: 40) } else { CardSlot(width: 40) }
                        }
                        .legendLine(Palette.gold, width: 40)
                    }
                }
                .contentShape(Rectangle())
                .onTapGesture { if let board = hand?.board, !board.isEmpty { model.zoom = .board } }
                .guideAnchor("board")
                .position(x: w / 2, y: h / 2)
                .zIndex(1)
                // The pot ring, marked on the felt below the board, always there so the pot has an obvious
                // home: one pile per pot, hidden while chips are on their way, gone once the hand is over.
                ZStack {
                    Text(L("pot")).textCase(.uppercase).font(.system(size: 9)).tracking(1).foregroundStyle(.white.opacity(0.45))
                        .frame(maxHeight: .infinity, alignment: .top).padding(.top, 4)
                    if let hand, view.phase != .handOver, !hand.pots.isEmpty {
                        HStack(alignment: .bottom, spacing: 10) {
                            ForEach(Array(hand.pots.enumerated()), id: \.offset) { _, p in ChipPile(amount: p.amount) }
                        }
                        .opacity(fx.isLanding("pot") ? 0 : 1)
                        .padding(.top, 8)
                    }
                }
                .padding(.horizontal, 8)
                .frame(minWidth: 56)
                .frame(height: 56)
                .overlay(Capsule().stroke(.white.opacity(0.3), lineWidth: 1.5))
                .guideAnchor("pot")
                .position(x: w * Spots.pot.x, y: h * Spots.pot.y)
                .zIndex(1)
                // A showdown: the winning hands over the pot ring; a pot nobody contested says so
                // there. Under either, the time to the next hand.
                let sd = Showdown.of(view)
                // Where every shown hand goes, clear of each other and of the winning cards.
                let challenges = ChallengeLayout.place(sd, view: view, n: n, w: w, h: h)
                let left = view.phase == .handOver ? remaining(hand?.remainingMs, viewAt: model.viewAt, now: now, paused: view.paused) : nil
                let hold = view.lastResult?.holdMs ?? ((view.lastResult?.uncontested ?? false) ? 6000 : 22000)
                if let sd {
                    Showcase(sd: sd, fx: fx, left: left, total: hold) { model.zoom = .showcase }
                        .frame(width: w, height: 0, alignment: .top)
                        .position(x: w * Spots.pot.x, y: h * Spots.pot.y - sd.top)
                        .zIndex(5)
                } else if let winner = Showdown.uncontestedWinner(view) {
                    UncontestedNote(name: winner.name, amount: winner.amount, left: left, total: hold)
                        .position(x: w * Spots.pot.x, y: h * Spots.pot.y)
                        .zIndex(5)
                }
                ForEach(view.players) { p in
                    let k = ((p.seat - mySeat) % n + n) % n
                    let me = p.id == view.you
                    let isActor = hand?.actorId == p.id && view.phase == .betting
                    // Live cards by the seat; folded ones lie face down where the bet was. At a
                    // showdown every shown hand is laid out as its challenge instead.
                    if let sd, sd.players.contains(where: { $0.id == p.id }) {
                        if let spot = challenges[p.id] {
                            // Tap it to see the hand large; a winner's row shows every winning hand.
                            ChallengeRow(p: p, winner: sd.isWinner(p.id), outward: k != 0 && Spots.seat(k, n).y < 0.495 ? -1 : 1, name: spot.named ? p.name : nil)
                                .contentShape(Rectangle())
                                .onTapGesture { model.zoom = sd.isWinner(p.id) ? .showcase : .hand(p.id) }
                                .position(spot.at)
                                .zIndex(5)
                        }
                    } else if let spot = challenges[p.id] {
                        // Cards shown face up at the end of a hand lie in front of the player; tap to see them large.
                        ShownHand(p: p, name: spot.named ? p.name : nil)
                            .contentShape(Rectangle())
                            .onTapGesture { model.zoom = .hand(p.id) }
                            .position(spot.at)
                            .zIndex(5)
                    } else if p.inHand && p.folded {
                        // Folded cards leave the table while the result is up, clear of the winning hands.
                        if !fx.isLanding("fold:\(p.id)") && view.phase != .handOver {
                            let bp = Spots.bet(k, n)
                            FoldedCards(model: model, p: p, mine: me).position(x: w * bp.x, y: h * bp.y)
                        }
                    } else if p.inHand && !me && !fx.isLanding("cards:\(p.id)") && challenges[p.id] == nil {
                        // Hidden cards tuck in beside the monitor, behind it; shown cards grow and come to the front.
                        let shown = !p.cards.isEmpty && p.cards.allSatisfy { $0 != nil }
                        let cp = shown ? Spots.shown(k, n) : Spots.cards(k, n)
                        HStack(spacing: 2) {
                            ForEach(Array(p.cards.enumerated()), id: \.offset) { _, c in PlayingCard(code: shown ? c : nil, width: Spots.tableCard(n, faceUp: shown)) }
                        }
                        .shadow(color: .black.opacity(shown ? 0.7 : 0), radius: 3, y: 2)
                        .position(x: w * cp.x, y: h * cp.y)
                        .zIndex(shown ? 5 : 0)
                        // The actor's clock, under their cards.
                        if isActor, !p.isBot, !view.paused, let hand, let left = remaining(hand.remainingMs, viewAt: model.viewAt, now: now, paused: false), left <= 30000 {
                            GrowingClock(left: left, total: 30000, now: now, width: 40).position(x: w * cp.x, y: h * cp.y + 26).zIndex(3)
                        }
                    }
                    if p.bet > 0 {
                        let bp = Spots.bet(k, n)
                        ChipPile(amount: p.bet).opacity(fx.isLanding("bet:\(p.id)") ? 0 : 1).position(x: w * bp.x, y: h * bp.y).zIndex(2)
                    }
                    // The monitor's centre sits on the ring; the text hangs below it.
                    let sp = Spots.seat(k, n)
                    Seat(model: model, view: view, p: p, isMe: me, isActor: isActor, now: now)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(width: 86, height: 0, alignment: .top)
                        .position(x: w * sp.x, y: h * sp.y - 21)
                        .zIndex(2)
                }
                FlightLayer(fx: fx, w: w, h: h).position(x: w / 2, y: h / 2).zIndex(6)
            }
        }
        .aspectRatio(1 / 1.3, contentMode: .fit)
    }
}

// Cards shown face up in front of a player at the end of a hand: community-card size,
// underlined green.
private struct ShownHand: View {
    let p: PlayerView
    var name: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            if let name { Text(name).font(.system(size: 10, weight: .semibold)).foregroundStyle(Palette.gold).lineLimit(1).frame(height: 11) }
            HStack(spacing: 6) {
                ForEach(Array(p.cards.enumerated()), id: \.offset) { _, c in
                    VStack(spacing: 4) {
                        PlayingCard(code: c, width: 40)
                        Capsule().fill(Palette.good).frame(width: 40, height: 3)
                    }
                }
            }
        }
        .padding(6)
        .background(Color.black.opacity(0.45), in: RoundedRectangle(cornerRadius: 10))
    }
}

// The winning hands over the pot ring, in reading order, each card underlined green (from the
// winner's hand) or gold (from the board); kickers after a gap. Left of each hand who won it and
// how much; under them the hand's name, and whether a kicker decided it. A draw is titled.
struct Showcase: View {
    let sd: Showdown
    let fx: TableEffects
    let left: Int?
    let total: Int
    var onTap: () -> Void = {}

    var body: some View {
        let cw = sd.cardWidth
        VStack(spacing: 0) {
            if sd.kind == "draw" {
                // A split pot names the shared hand in its title.
                Text(L("split_pot") + (sd.winners.first?.hand.map { " \u{00B7} " + $0.name } ?? "")).textCase(.uppercase).font(.system(size: 13, weight: .bold)).tracking(1).foregroundStyle(Palette.gold)
                    .lineLimit(1).minimumScaleFactor(0.6).frame(height: sd.titleHeight)
            }
            ForEach(Array(sd.winners.enumerated()), id: \.offset) { r, w in
                let best = w.hand?.best ?? []
                HStack(alignment: .top, spacing: Showdown.gap) {
                    ForEach(Array(best.enumerated()), id: \.offset) { i, c in
                        VStack(spacing: 3) {
                            PlayingCard(code: c.code, width: cw)
                            Capsule().fill(c.from == "hole" ? Palette.good : Palette.gold).frame(width: cw, height: 4)
                        }
                        // Community cards higher, toward the board; the hand's own a fifth of a card lower.
                        .padding(.top, c.from == "board" ? 0 : sd.raise)
                        .padding(.leading, c.spare && i > 0 && !best[i - 1].spare ? Showdown.kickerGap : 0)
                        .opacity(fx.isLanding("show:\(r):\(i)") ? 0 : 1)
                    }
                }
                .frame(height: sd.rowHeight, alignment: .top)
                .overlay(alignment: .leading) {
                    VStack(alignment: .trailing, spacing: 1) {
                        Text(w.name).font(.system(size: 12, weight: .semibold)).foregroundStyle(.white).lineLimit(1).minimumScaleFactor(0.6)
                        Text("+" + chips(sd.won[w.id] ?? 0)).font(.system(size: 11, weight: .bold)).foregroundStyle(Palette.gold).lineLimit(1).minimumScaleFactor(0.6)
                    }
                    .frame(width: 64, alignment: .trailing).alignmentGuide(.leading) { d in d[.trailing] + 8 }.offset(y: -6)
                }
            }
            if sd.kind != "draw", let name = sd.winners.first?.hand?.name {
                Text(name + (sd.kind == "kicker" ? " \u{00B7} " + L("won_on_kicker") : "")).font(.system(size: 12, weight: .semibold)).foregroundStyle(.white.opacity(0.9))
                    .lineLimit(1).minimumScaleFactor(0.6).frame(height: 14)
            }
            NextHandBar(left: left, total: total).padding(.top, 3)
        }
        // Tap to see the winning hands large.
        .contentShape(Rectangle())
        .onTapGesture(perform: onTap)
    }
}

// Won with no cards shown: who won and why, where the winning cards would be.
struct UncontestedNote: View {
    let name: String
    let amount: Int
    let left: Int?
    let total: Int

    var body: some View {
        VStack(spacing: 4) {
            Text(L("wins_amount", name, chips(amount))).font(.system(size: 16, weight: .bold)).foregroundStyle(Palette.gold).lineLimit(1).minimumScaleFactor(0.6)
            Text(L("everyone_folded")).font(.system(size: 12)).foregroundStyle(.white.opacity(0.85))
            NextHandBar(left: left, total: total)
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .background(Color.black.opacity(0.45), in: RoundedRectangle(cornerRadius: 12))
    }
}

// The time to the next hand, shrinking.
struct NextHandBar: View {
    let left: Int?
    let total: Int
    var width: CGFloat = 60

    var body: some View {
        if let left, left <= total {
            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.15))
                Capsule().fill(Palette.gold).frame(width: width * CGFloat(left) / CGFloat(max(1, total)))
            }
            .frame(width: width, height: 4)
        }
    }
}

// A shown hand by its seat at a showdown: the combination in reading order, cards from the hand
// nudged toward the table's edge and underlined green, the board's nudged toward the middle and
// underlined gold, then any deciding kickers; after a gap, the hand's cards it does not use,
// greyed. A winner's hand is over the pot ring, so only its unused cards stay.
private struct ChallengeRow: View {
    let p: PlayerView
    let winner: Bool
    let outward: CGFloat
    // Given when the row had to go away from its seat, so it says whose hand it is.
    var name: String? = nil

    var body: some View {
        let parts = ChallengeLayout.parts(p, winner: winner)
        let combo = parts.combo
        if !combo.isEmpty || !parts.unused.isEmpty {
            VStack(alignment: .leading, spacing: 2) {
                if let name { Text(name).font(.system(size: 10, weight: .semibold)).foregroundStyle(Palette.gold).lineLimit(1).frame(height: 11) }
                HStack(spacing: 3) {
                    ForEach(Array(combo.enumerated()), id: \.offset) { i, c in
                        CardToken(code: c.code ?? "", underline: c.from == "hole" ? Palette.good : Palette.gold)
                            .offset(y: (c.from == "hole" ? outward : -outward) * 4)
                            .padding(.leading, c.spare && i > 0 && !combo[i - 1].spare ? 6 : 0)
                    }
                    if !combo.isEmpty && !parts.unused.isEmpty { Spacer().frame(width: 5) }
                    // Cards the hand does not use: still underlined green (they are the player's), a little dimmed.
                    ForEach(parts.unused, id: \.self) { c in CardToken(code: c, underline: Palette.good).opacity(0.85) }
                }
                .frame(height: 27)
            }
            .padding(.horizontal, 6).padding(.vertical, 8)
            .background(Color.black.opacity(0.45), in: RoundedRectangle(cornerRadius: 10))
        }
    }
}

// Where each shown hand goes at a showdown. Every row takes the free spot nearest its usual
// place (above or below its seat; yours above your seat), clear of the board, the winning hands,
// the seats of everyone in the showdown (its own too) and the rows already placed; a folded
// player's seat counts against a spot but does not rule it out. A row that has to go far from
// its seat says whose it is, and its spot is found again with the name's height.
enum ChallengeLayout {
    static let rowHeight: CGFloat = 43, nameHeight: CGFloat = 13, pitch: CGFloat = 35
    static let step: CGFloat = 10, far: CGFloat = 100, foldedSeat: CGFloat = 200, touch: CGFloat = 4

    struct Spot { let at: CGPoint; let named: Bool }

    // A shown hand's row: its combination (none for a winner, whose hand is over the pot) and
    // the cards from its hand that the combination does not use.
    static func parts(_ p: PlayerView, winner: Bool) -> (combo: [OddsCard], unused: [String]) {
        let best = p.hand?.best ?? []
        let used = Set(best.compactMap(\.code))
        return (winner ? [] : best, p.cards.compactMap { $0 }.filter { !used.contains($0) })
    }

    static func size(_ combo: [OddsCard], _ unused: Int, named: Bool) -> CGSize {
        let kicker = combo.enumerated().contains { i, c in c.spare && i > 0 && !combo[i - 1].spare }
        let count = CGFloat(combo.count + unused)
        let w = count * pitch - 3 + (!combo.isEmpty && unused > 0 ? 8 : 0) + (kicker ? 6 : 0) + 12
        return CGSize(width: w, height: rowHeight + (named ? nameHeight : 0))
    }

    // Two community-size cards with their lines, in a padded box.
    static let shownSize = CGSize(width: 2 * 40 + 6 + 12, height: 56 + 7 + 12)

    // Players whose cards are face up at the end of a hand outside the showdown's rows: a winner
    // nobody contested, or anyone who chose to show.
    static func shownPlayers(_ view: GameView, _ sd: Showdown?) -> [PlayerView] {
        guard view.phase == .handOver else { return [] }
        return view.players.filter { p in
            p.inHand && p.cards.count == 2 && p.cards.allSatisfy { $0 != nil } && !(sd?.players.contains { $0.id == p.id } ?? false)
        }
    }

    // Where the showdown's rows and any cards shown face up go, in points of the table box. Shown
    // cards try the spot in front of their player first.
    static func place(_ sd: Showdown?, view: GameView, n: Int, w: CGFloat, h: CGFloat) -> [String: Spot] {
        func k(_ p: PlayerView) -> Int { Spots.seatIndex(p, view) }
        func seatRect(_ k: Int) -> CGRect {
            let s = Spots.seat(k, n)
            return CGRect(x: w * s.x - 43, y: h * s.y - 21, width: 86, height: 86)
        }
        let shown = shownPlayers(view, sd)
        let showing = Set(((sd?.players ?? []) + shown).map(k))
        let board = CGRect(x: w / 2 - 108, y: h / 2 - 28, width: 216, height: 63)
        var fixed = [board] + showing.map(seatRect)
        if let sd {
            let rowWidth = 5 * sd.cardWidth + 4 * Showdown.gap + Showdown.kickerGap
            fixed.append(CGRect(x: w * Spots.pot.x - rowWidth / 2 - 72, y: h * Spots.pot.y - sd.top, width: rowWidth + 72,
                                height: sd.titleHeight + CGFloat(sd.winners.count) * sd.rowHeight + (sd.kind == "draw" ? 0 : 14) + 7))
        } else if !shown.isEmpty {
            // The note of an uncontested win over the pot ring.
            fixed.append(CGRect(x: w * Spots.pot.x - 100, y: h * Spots.pot.y - 38, width: 200, height: 76))
        }
        let folded = (0..<n).filter { !showing.contains($0) }.map(seatRect)
        struct Item { let p: PlayerView; let size: (Bool) -> CGSize; let anchor: (CGFloat) -> CGPoint }
        var items: [Item] = []
        for p in sd?.players ?? [] {
            let parts = parts(p, winner: sd?.isWinner(p.id) ?? false)
            if parts.combo.isEmpty && parts.unused.isEmpty { continue }
            let s = Spots.seat(k(p), n)
            let above = (s.y > 0.15 && s.y < 0.495) || s.y > 0.8
            let mine = k(p) == 0
            items.append(Item(p: p, size: { named in size(parts.combo, parts.unused.count, named: named) }, anchor: { hh in
                mine ? CGPoint(x: w / 2, y: h * 0.79) : CGPoint(x: w * s.x, y: above ? h * s.y - 21 - hh / 2 - 2 : h * s.y + 65 + hh / 2 + 2)
            }))
        }
        for p in shown {
            let b = Spots.bet(k(p), n)
            items.append(Item(p: p, size: { named in CGSize(width: shownSize.width, height: shownSize.height + (named ? nameHeight : 0)) }, anchor: { _ in CGPoint(x: w * b.x, y: h * b.y) }))
        }
        items.sort { a, b in (k(a.p) == 0 ? 0 : 1, abs(Spots.seat(k(a.p), n).y - 0.5)) < (k(b.p) == 0 ? 0 : 1, abs(Spots.seat(k(b.p), n).y - 0.5)) }
        var placed: [CGRect] = []
        var out: [String: Spot] = [:]
        for it in items {
            var chosen: (at: CGPoint, size: CGSize, named: Bool)?
            for named in [false, true] {
                let size = it.size(named)
                let anchor = it.anchor(size.height)
                var best: (cost: CGFloat, at: CGPoint, distance: CGFloat)?
                for cy in stride(from: size.height / 2, through: h - size.height / 2, by: step) {
                    for cx in stride(from: size.width / 2, through: max(size.width / 2, w - size.width / 2), by: step) {
                        let r = CGRect(x: cx - size.width / 2, y: cy - size.height / 2, width: size.width, height: size.height)
                        if fixed.contains(where: { hits(r, $0) }) || placed.contains(where: { hits(r, $0) }) { continue }
                        let distance = hypot(cx - anchor.x, cy - anchor.y)
                        let cost = distance + foldedSeat * CGFloat(folded.filter { hits(r, $0) }.count)
                        if best == nil || cost < best!.cost { best = (cost, CGPoint(x: cx, y: cy), distance) }
                    }
                }
                let at = best?.at ?? CGPoint(x: min(max(anchor.x, size.width / 2), w - size.width / 2), y: min(max(anchor.y, size.height / 2), h - size.height / 2))
                chosen = (at, size, named)
                if (best?.distance ?? 0) <= far { break }
            }
            guard let chosen else { continue }
            out[it.p.id] = Spot(at: chosen.at, named: chosen.named)
            placed.append(CGRect(x: chosen.at.x - chosen.size.width / 2, y: chosen.at.y - chosen.size.height / 2, width: chosen.size.width, height: chosen.size.height))
        }
        return out
    }

    // Overlapping by more than a touch.
    static func hits(_ a: CGRect, _ b: CGRect) -> Bool {
        a.minX < b.maxX - touch && b.minX < a.maxX - touch && a.minY < b.maxY - touch && b.minY < a.maxY - touch
    }
}

// Folded cards face down where the bet was; tap your own to see them large.
private struct FoldedCards: View {
    let model: TableModel
    let p: PlayerView
    let mine: Bool

    var body: some View {
        HStack(spacing: 2) {
            PlayingCard(code: nil, width: 20)
            PlayingCard(code: nil, width: 20).rotationEffect(.degrees(8))
        }
        .opacity(mine ? 1 : 0.75)
        .padding(8)
        .contentShape(Rectangle())
        .onTapGesture { if mine { model.zoom = .folded } }
    }
}

private struct Seat: View {
    let model: TableModel
    let view: GameView
    let p: PlayerView
    let isMe: Bool
    let isActor: Bool
    let now: Date

    var body: some View {
        let hand = view.hand
        VStack(spacing: 1) {
            ZStack(alignment: .topTrailing) {
                Group {
                    if model.video.hasVideo(p.id, isMe: isMe) {
                        VideoContent(session: model.video, playerId: p.id, isMe: isMe, name: p.name, initialSize: 16)
                    } else {
                        ZStack {
                            Color(red: 0.06, green: 0.06, blue: 0.06)
                            if p.isBot { SVGIcon(d: IconPath.robot).fill(Color(red: 0.6, green: 0.6, blue: 0.6)).frame(width: 22, height: 22) }
                            else { Text(String(p.name.prefix(1))).font(.system(size: 16, weight: .bold)).foregroundStyle(Color(red: 0.6, green: 0.6, blue: 0.6)) }
                        }
                    }
                }
                .frame(width: 56, height: 42)
                .clipShape(RoundedRectangle(cornerRadius: 6))
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(isActor ? Palette.gold : Color(red: 0.23, green: 0.23, blue: 0.23), lineWidth: 2))
                .opacity(p.folded ? 0.55 : 1)
                .contentShape(Rectangle())
                .onTapGesture { if model.video.hasVideo(p.id, isMe: isMe) { model.videoPlayerId = p.id } }
                if let hand, hand.button == p.seat {
                    Text(L("dealer")).font(.system(size: 11, weight: .bold)).foregroundStyle(Palette.ink)
                        .frame(width: 18, height: 18).background(Palette.cardFace, in: Circle()).overlay(Circle().stroke(Color(red: 0.2, green: 0.2, blue: 0.2), lineWidth: 1))
                        .offset(x: 8, y: -8)
                }
            }
            Text(p.name + (p.isHost ? " \u{2605}" : "")).font(.system(size: 11, weight: isActor ? .bold : .regular)).foregroundStyle(isActor ? Palette.gold : .white.opacity(0.9)).lineLimit(1)
            Text(chips(p.stack)).font(.system(size: 12, weight: .bold)).foregroundStyle(.white).padding(.horizontal, 6).background(Color.black.opacity(0.5), in: Capsule())
            // Once the cards are shown, the hand's name takes the place of the last action.
            if !isMe, let rank = p.hand, !p.cards.isEmpty, p.cards.allSatisfy({ $0 != nil }) {
                Text(rank.name).font(.system(size: 10)).foregroundStyle(.white).lineLimit(1)
            } else if let status {
                Text(status).font(.system(size: 10)).foregroundStyle(.white.opacity(0.7))
            } else if !isMe, let a = p.lastAction, hand != nil {
                Text(actionText(a)).font(.system(size: 10)).foregroundStyle(Palette.gold).lineLimit(1)
            }
        }
        .frame(width: 86)
        .opacity(p.out ? 0.4 : 1)
    }

    private var status: String? {
        if p.out { return L("out") }
        if p.sittingOut { return L("sitting_out") }
        if !p.connected && !p.isBot { return L("away") }
        if p.allIn { return L("all_in_mark") }
        if p.folded { return L("folded") }
        return nil
    }
}

// Your cards are the controls: double-tap to check, flick toward the table to fold; tap your
// chips to bet or raise; tap Call to call. Your move as soon as it is your turn and your cards
// have landed.
private struct MyArea: View {
    @Bindable var model: TableModel
    let view: GameView
    let me: PlayerView
    var hideCards = false
    var now = Date()
    var cardWidth: CGFloat = 72
    @State private var dragY: CGFloat = 0

    var body: some View {
        let legal = view.legal
        let hand = view.hand
        let canAct = legal.fold && !model.busy && !hideCards
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                // Left of the cards: Call (or the minimum Bet) above your chips, which open the slider.
                HStack {
                    Spacer()
                    PlayButtons(model: model, view: view, me: me, canAct: canAct, vertical: true).guideAnchor("stack")
                }
                .frame(maxWidth: .infinity)
                if !me.cards.isEmpty && !me.folded && !hideCards {
                    VStack(spacing: 6) {
                        // Your cards, each underlined green, the legend's colour for them; on your turn
                        // framed and glowing, with what a double tap and a flick do.
                        VStack(spacing: 4) {
                            if canAct && !Platform.uprightBoard { MoveHints(legal: legal, size: 11) }
                            HStack(spacing: 8) {
                                ForEach(Array(me.cards.enumerated()), id: \.offset) { i, c in
                                    let canShow = legal.show.contains(i) && !model.busy
                                    VStack(spacing: 3) {
                                        #if os(tvOS)
                                        Button { if canShow { model.show([i]) } else { model.zoom = .mine } } label: {
                                            PlayingCard(code: c, width: cardWidth)
                                        }.platformButtonStyle()
                                        .accessibilityLabel(canShow ? L("show_cards") + " \(i + 1)" : L("zoom_cards"))
                                        #else
                                        PlayingCard(code: c, width: cardWidth, tappable: canShow, onTap: canShow ? { model.show([i]) } : nil)
                                        #endif
                                        Capsule().fill(Palette.good).frame(width: cardWidth, height: legendLineHeight(cardWidth))
                                    }
                                }
                            }
                        }
                        .padding(6)
                        .background(canAct ? Palette.gold.opacity(0.12) : .clear, in: RoundedRectangle(cornerRadius: 12))
                        .pulseHalo(canAct, cornerRadius: 12)
                        .guideAnchor("hand")
                        .padding(-6)
                        .offset(y: min(0, dragY))
                        // A double tap checks; a single tap, once it is not the start of a double,
                        // shows the cards large.
                        #if !os(tvOS)
                        .gesture(TapGesture(count: 2).onEnded { if canAct && legal.check { model.check() } }
                            .exclusively(before: TapGesture(count: 1).onEnded { model.zoom = .mine }))
                        .simultaneousGesture(DragGesture(minimumDistance: 10).onChanged { v in dragY = v.translation.height }.onEnded { v in
                            dragY = 0
                            if canAct && v.translation.height < -40 { model.fold() }
                        })
                        #endif
                        if let hand, hand.actorId == me.id, view.phase == .betting, !view.paused, let left = remaining(hand.remainingMs, viewAt: model.viewAt, now: now, paused: false), left <= 30000 {
                            GrowingClock(left: left, total: 30000, now: now, width: cardWidth * 2 + 8, height: 10)
                        }
                    }
                } else if me.folded {
                    // Folded cards lie on the table; the hand is empty until the next deal.
                    Spacer().frame(width: cardWidth * 2 + 8, height: cardWidth * 1.4)
                } else {
                    Spacer().frame(width: cardWidth * 2 + 8)
                }
                // Back into play after sitting out, right of your cards: going deeper in, so on the right.
                ZStack(alignment: .leading) {
                    Color.clear
                    if legal.back {
                        RoundIconButton(label: L("back_in"), enabled: !model.busy, filled: true, glow: true, action: model.back) { fg in
                            Image(systemName: "play.fill").foregroundStyle(fg)
                        }
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: 44)
            }
        }
    }
}

// Over your cards on your turn: a double tap checks (when you may), a flick up folds.
private struct MoveHints: View {
    let legal: Legal
    var size: CGFloat = 11

    var body: some View {
        HStack(spacing: size * 1.3) {
            if legal.check {
                HStack(spacing: size * 0.35) { DoubleTapDots(size: size * 0.38); Text(L("check")) }
            }
            Text("\u{2191} " + L("fold"))
        }
        .font(.system(size: size, weight: .bold))
        .foregroundStyle(Palette.gold)
        .lineLimit(1)
    }
}

// Call (or the opening Bet) and your chips, which open the bet panel: beside your cards, and
// below them when they are large. The two keep apart, so their glows do not run together.
private struct PlayButtons: View {
    @Bindable var model: TableModel
    let view: GameView
    let me: PlayerView
    let canAct: Bool
    var vertical = true

    var body: some View {
        let legal = view.legal
        let layout = vertical ? AnyLayout(VStackLayout(spacing: 18)) : AnyLayout(HStackLayout(spacing: 22))
        layout {
            if canAct {
                VStack(spacing: 8) {
                    Button(L("move_fold")) { model.fold() }.tint(Palette.danger)
                    if legal.check { Button(L("move_check")) { model.check() } }
                }
                .buttonStyle(.borderedProminent)
            }
            if canAct, let toCall = legal.call {
                Button(toCall >= me.stack ? L("all_in") : L("call", chips(toCall))) { model.call() }.buttonStyle(.borderedProminent).pulseHalo(true, cornerRadius: 20)
            } else if canAct, let b = legal.bet, b.opening {
                Button(b.min >= me.stack + me.bet ? L("all_in") : L("bet_to", chips(b.min))) {
                    if Platform.uprightBoard { model.betTo = b.min } else { model.bet(b.min) }
                }.buttonStyle(.borderedProminent).pulseHalo(true, cornerRadius: 20)
            }
            VStack(spacing: 6) {
                if canAct, let b = legal.bet, !b.opening {
                    Button(L("move_raise")) { model.betTo = b.min }.buttonStyle(.borderedProminent)
                }
                ChipPile(amount: me.stack).padding(.horizontal, 6).padding(.vertical, 4)
                .background((canAct && legal.bet != nil) ? Palette.gold.opacity(0.12) : .clear, in: RoundedRectangle(cornerRadius: 12))
                .pulseHalo(canAct && legal.bet != nil, cornerRadius: 12)
                .onTapGesture { if canAct, let b = legal.bet { Sound.play(.click); model.betTo = b.min } }
                #if os(tvOS)
                if canAct, let b = legal.bet { Button(L("bet_to", chips(b.min))) { model.betTo = b.min } }
                #endif
            }
        }
    }
}

// Choosing how much to bet or raise: the amount, quick amounts, a slider, Cancel and Bet.
private struct BetPanel: View {
    @Bindable var model: TableModel
    let view: GameView
    @State private var amountText = ""
    #if os(tvOS)
    @FocusState private var amountFocused: Bool
    #endif

    var body: some View {
        let legal = view.legal
        let hand = view.hand
        if legal.fold, let b = legal.bet, let betTo = model.betTo {
            let toCall = legal.call
            let step = max(1, hand?.sb ?? 1)
            let pot = hand?.potTotal ?? 0
            let quick: (Double) -> Int = { amount in min(b.max, max(b.min, Int(amount / Double(step)) * step)) }
            Panel {
                HStack(spacing: 4) {
                    Text(chips(betTo)).font(.title2.bold()).foregroundStyle(Palette.gold)
                    Spacer()
                    chip(L("min")) { model.betTo = b.min }
                    chip(L("half_pot")) { model.betTo = quick(Double(pot + (toCall ?? 0)) / 2 + Double(hand?.currentBet ?? 0)) }
                    chip(L("pot")) { model.betTo = quick(Double(pot + (toCall ?? 0) + (hand?.currentBet ?? 0))) }
                    chip(L("all_in")) { model.betTo = b.max }
                }
                // Only with a range to slide over: SwiftUI's slider stops the app on a range shorter than its step.
                #if !os(tvOS)
                if b.max - b.min >= step {
                    Slider(value: Binding(get: { Double(betTo) }, set: { model.betTo = quick($0) }), in: Double(b.min)...Double(b.max), step: Double(step))
                }
                #endif
                if Platform.uprightBoard {
                    TextField(L(b.opening ? "bet_to" : "raise_to", chips(betTo)), text: $amountText)
                        .playerNameInput()
                        #if os(tvOS)
                        .focused($amountFocused)
                        #endif
                        .onChange(of: amountText) { _, text in
                            if let amount = Int(text), (b.min...b.max).contains(amount) { model.betTo = amount }
                        }
                    HStack {
                        ForEach([1, 10, 100, 1000], id: \.self) { step in
                            VStack {
                                Button("+\(step)") { model.betTo = b.adjusted(betTo, by: step) }.disabled(betTo >= b.max)
                                Button("-\(step)") { model.betTo = b.adjusted(betTo, by: -step) }.disabled(betTo <= b.min)
                            }
                        }
                    }.buttonStyle(.bordered)
                }
                HStack(spacing: 8) {
                    Button(L("cancel")) { model.betTo = nil }.buttonStyle(.bordered).frame(maxWidth: .infinity)
                    Button(betTo == b.max ? L("all_in") : L(b.opening ? "bet_to" : "raise_to", chips(betTo))) { model.bet(betTo) }
                        .buttonStyle(.borderedProminent).frame(maxWidth: .infinity)
                        .disabled(model.busy || (Platform.uprightBoard && (Int(amountText) != betTo || !(b.min...b.max).contains(betTo))))
                }
            }
            .onAppear {
                amountText = String(betTo)
                #if os(tvOS)
                amountFocused = true
                #endif
            }
            .onChange(of: betTo) { _, amount in
                if Int(amountText) != amount { amountText = String(amount) }
            }
        }
    }

    private func chip(_ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) { Text(label).font(.caption).foregroundStyle(.white).padding(.horizontal, 10).padding(.vertical, 6).background(Color.white.opacity(0.12), in: Capsule()) }
            .platformButtonStyle()
    }
}

// Cards large over the screen; a tap outside them puts them away. Your own live cards keep their
// gestures there (a double tap checks, a flick up folds) with your chips, Call or Bet and the bet
// panel below them, and stay large after a check or a call.
private struct ZoomOverlay: View {
    @Bindable var model: TableModel
    let view: GameView
    let zoom: TableModel.Zoom
    let now: Date
    let landing: Bool
    @State private var dragY: CGFloat = 0
    #if os(tvOS)
    @FocusState private var closeFocused: Bool
    #endif

    // A row keeps where each card came from (community cards sit higher in a hand's combination),
    // where gaps go (before the kickers and before cards a hand does not use) and from which card
    // on the cards are a little dimmed (those not used).
    struct Row { var name: String? = nil; let cards: [String?]; var from: [String] = []; var gaps: [Int] = []; var dimFrom: Int? = nil }

    // What is shown, from the table as it is now: the board in rows of three, one row per winning
    // hand (named when the pot is split), one player's shown hand, or your two cards.
    static func rows(_ view: GameView, _ zoom: TableModel.Zoom) -> [Row] {
        switch zoom {
        case .board:
            let b = view.hand?.board ?? []
            return stride(from: 0, to: b.count, by: 3).map { i in
                let cards = Array(b[i..<min(i + 3, b.count)])
                return Row(cards: cards, from: cards.map { _ in "board" })
            }
        case .showcase:
            guard let sd = Showdown.of(view) else { return [] }
            return sd.winners.map { w in
                let best = w.hand?.best ?? []
                return Row(name: sd.kind == "draw" ? w.name : nil, cards: best.map(\.code), from: best.map(\.from), gaps: [best.firstIndex(where: \.spare) ?? -1])
            }
        case .hand(let id):
            guard let p = view.player(id), !p.cards.isEmpty, p.cards.allSatisfy({ $0 != nil }) else { return [] }
            if let sd = Showdown.of(view), sd.players.contains(where: { $0.id == id }), !sd.isWinner(id) {
                let parts = ChallengeLayout.parts(p, winner: false)
                return [Row(name: p.name, cards: parts.combo.map(\.code) + parts.unused, from: parts.combo.map(\.from) + parts.unused.map { _ in "hole" },
                            gaps: [parts.combo.firstIndex(where: \.spare) ?? -1, parts.unused.isEmpty ? -1 : parts.combo.count], dimFrom: parts.combo.count)]
            }
            return [Row(name: p.name, cards: p.cards, from: p.cards.map { _ in "hole" })]
        case .mine, .folded:
            let cards = view.me?.cards ?? []
            return cards.isEmpty ? [] : [Row(cards: cards, from: cards.map { _ in "hole" })]
        }
    }

    var body: some View {
        let rows = Self.rows(view, zoom)
        let most = rows.map(\.cards.count).max() ?? 1
        let mine = zoom == .mine
        let canAct = mine && view.legal.fold && !model.busy && !landing
        let raised: Bool = { if case .showcase = zoom { return true }; if case .hand = zoom { return true }; return false }()
        GeometryReader { geo in
            let width = min(geo.size.width * (most > 3 ? 0.17 : most > 2 ? 0.29 : 0.42), most > 3 ? 150 : 300)
            ZStack {
                Color.black.opacity(0.7).contentShape(Rectangle()).onTapGesture { model.zoom = nil }
                VStack(spacing: 14) {
                    if canAct && !Platform.uprightBoard { MoveHints(legal: view.legal, size: 15) }
                    VStack(spacing: 12) {
                        ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                            if let name = row.name { Text(name).font(.headline).foregroundStyle(Palette.gold) }
                            HStack(alignment: .top, spacing: most > 3 ? 8 : 12) {
                                ForEach(Array(row.cards.enumerated()), id: \.offset) { i, c in
                                    let from = row.from[safe: i] ?? "hole"
                                    VStack(spacing: width * 0.06) {
                                        PlayingCard(code: c, width: width)
                                        Capsule().fill(from == "hole" ? Palette.good : Palette.gold).frame(width: width, height: max(4, width * 0.07))
                                    }
                                    .padding(.top, raised && from != "board" ? width * 1.4 * 0.2 : 0)
                                    .padding(.leading, i > 0 && row.gaps.contains(i) ? width * 0.2 : 0)
                                    .opacity(row.dimFrom.map { i >= $0 ? 0.85 : 1 } ?? 1)
                                }
                            }
                        }
                    }
                    .offset(y: min(0, dragY))
                    .contentShape(Rectangle())
                    .modifier(ZoomGestures(mine: mine, check: { if canAct && view.legal.check { model.check() } }, close: { model.zoom = nil }))
                    #if !os(tvOS)
                    .simultaneousGesture(DragGesture(minimumDistance: 10).onChanged { v in if mine { dragY = v.translation.height } }.onEnded { v in
                        dragY = 0
                        if canAct && v.translation.height < -40 { model.fold(); model.zoom = nil }
                    })
                    #endif
                    Button(L("done")) { model.zoom = nil }.buttonStyle(.borderedProminent)
                    #if os(tvOS)
                        .focused($closeFocused)
                    #endif
                    if mine, let me = view.me {
                        if let hand = view.hand, hand.actorId == me.id, view.phase == .betting, !view.paused, let left = remaining(hand.remainingMs, viewAt: model.viewAt, now: now, paused: false), left <= 30000 {
                            GrowingClock(left: left, total: 30000, now: now, width: width * 2 + 12, height: 10)
                        }
                        if canAct { PlayButtons(model: model, view: view, me: me, canAct: true, vertical: false).padding(.top, 6) }
                        BetPanel(model: model, view: view).frame(maxWidth: 440).padding(.horizontal, 16)
                    }
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .ignoresSafeArea()
        #if os(tvOS)
        .onChange(of: zoom, initial: true) { _, _ in closeFocused = true }
        .onExitCommand { model.zoom = nil }
        #endif
    }
}

// Your own cards wait to see whether a tap is the start of a double tap (a check) before putting
// them away; anything else goes at the first tap.
private struct ZoomGestures: ViewModifier {
    let mine: Bool
    let check: () -> Void
    let close: () -> Void

    func body(content: Content) -> some View {
        #if os(tvOS)
        content
        #else
        if mine {
            content.gesture(TapGesture(count: 2).onEnded(check).exclusively(before: TapGesture(count: 1).onEnded(close)))
        } else {
            content.onTapGesture(perform: close)
        }
        #endif
    }
}

// The possible hands for your cards, most likely first, each with its rank (1 is a royal flush)
// and the known cards that make it: yours underlined green, the community cards gold, the rest
// still to come red. Folds away with a tap; the choice is kept on this device.
private struct HandPanel: View {
    @Bindable var model: TableModel
    let view: GameView
    let me: PlayerView

    var body: some View {
        if me.inHand && !me.folded && me.cards.count == 2 && me.cards.allSatisfy({ $0 != nil }) && view.phase != .handOver {
            let rows = view.odds ?? []
            Panel {
                HStack(spacing: 6) {
                    Text(L("hands_panel")).font(.subheadline.bold()).foregroundStyle(Palette.gold)
                    Spacer()
                    if model.handPanel {
                        Capsule().fill(Palette.good).frame(width: 14, height: 3)
                        Text(L("in_hand")).font(.caption2).foregroundStyle(.secondary)
                        Capsule().fill(Palette.gold).frame(width: 14, height: 3).padding(.leading, 6)
                        Text(L("on_table")).font(.caption2).foregroundStyle(.secondary)
                        Capsule().fill(Palette.danger).frame(width: 14, height: 3).padding(.leading, 6)
                        Text(L("waiting_for")).font(.caption2).foregroundStyle(.secondary)
                    }
                    Text(model.handPanel ? "\u{25BE}" : "\u{25B4}").foregroundStyle(Palette.gold)
                }
                .contentShape(Rectangle())
                .tapIf { model.toggleHandPanel() }
                if model.handPanel {
                    if rows.isEmpty { Text("\u{2026}").foregroundStyle(.secondary) }
                    ForEach(Array(rows.enumerated()), id: \.offset) { _, r in
                        VStack(alignment: .trailing, spacing: 2) {
                            HStack(spacing: 6) {
                                Text("#\(r.rank)").font(.caption2).foregroundStyle(.secondary).frame(width: 30, alignment: .leading)
                                Text(L("hand_\(r.category)") + (r.more ? " (\(L("other_ways")))" : "")).font(.footnote)
                                Spacer()
                                Text(percent(r.probability)).font(.footnote.bold()).foregroundStyle(Palette.gold)
                            }
                            // In reading order from the server: a straight low to high, pairs grouped, kickers
                            // last (a little dimmed); cards still to come as "K?" any king, "?♦" any diamond.
                            if !r.more {
                                // The cards that make the hand inside a thin dotted box, the kickers after it.
                                // Community cards (on the board or still to come) a little higher than yours.
                                HStack(alignment: .top, spacing: 2) {
                                    ForEach(Array(Self.runs(r.cards).enumerated()), id: \.offset) { _, run in
                                        HStack(alignment: .top, spacing: 3) {
                                            ForEach(Array(run.cards.enumerated()), id: \.offset) { _, c in token(c) }
                                        }
                                        .padding(3)
                                        .overlay {
                                            if run.core {
                                                RoundedRectangle(cornerRadius: 6).stroke(Color.white.opacity(0.7), style: StrokeStyle(lineWidth: 1, dash: [2, 2]))
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        .padding(.vertical, 2)
                    }
                }
            }
            .guideAnchor("odds")
        }
    }

    // Consecutive cards that make the hand (core) or are kickers.
    static func runs(_ cards: [OddsCard]) -> [(core: Bool, cards: [OddsCard])] {
        var out: [(core: Bool, cards: [OddsCard])] = []
        for c in cards {
            if let last = out.last, last.core == !c.spare { out[out.count - 1].cards.append(c) } else { out.append((!c.spare, [c])) }
        }
        return out
    }

    // A card underlined where it comes from: yours lower and green, the community's gold; a kicker
    // a little dimmed; one still to come red.
    @ViewBuilder
    private func token(_ c: OddsCard) -> some View {
        Group {
            if let code = c.code {
                CardToken(code: code, underline: c.from == "hole" ? Palette.good : Palette.gold).opacity(c.spare ? 0.85 : 1)
            } else {
                NeededToken(card: c)
            }
        }
        .padding(.top, c.from == "hole" ? 4 : 0)
    }

    private func percent(_ p: Double) -> String {
        if p >= 0.1 { return "\(Int((p * 100).rounded()))%" }
        if p >= 0.0005 { return String(format: "%.1f%%", p * 100) }
        return "<0.1%"
    }
}

private struct NeededToken: View {
    let card: OddsCard

    var body: some View {
        let red = card.suit == "h" || card.suit == "d"
        let glyph: String = card.suit == "c" ? "\u{2663}" : card.suit == "d" ? "\u{2666}" : card.suit == "h" ? "\u{2665}" : card.suit == "s" ? "\u{2660}" : (card.rank != nil ? "?" : "")
        let rank = card.rank.map { r in "TJQKA".contains(r) ? L("rank_\(r)") : r } ?? "?"
        VStack(spacing: 0) {
            Text(rank + glyph).font(.system(size: 12, weight: .bold)).foregroundStyle(red ? Palette.cardRed : Palette.ink).lineLimit(1).minimumScaleFactor(0.7)
                .frame(width: 32).padding(.vertical, 1).background(Palette.cardFace, in: RoundedRectangle(cornerRadius: 5))
            Rectangle().fill(Palette.danger).frame(width: 32, height: 3)
        }
    }
}

// A card as a small text token, red or black, underlined green for yours and gold for the community cards.
struct CardToken: View {
    let code: String
    let underline: Color

    var body: some View {
        let suit = code.last ?? "s"
        let red = suit == "h" || suit == "d"
        let glyph: String = suit == "c" ? "\u{2663}" : suit == "d" ? "\u{2666}" : suit == "h" ? "\u{2665}" : "\u{2660}"
        let rank = code.first.map { "TJQKA".contains($0) ? L("rank_\($0)") : String($0) } ?? ""
        VStack(spacing: 0) {
            Text(rank + glyph).font(.system(size: 12, weight: .bold)).foregroundStyle(red ? Palette.cardRed : Palette.ink).lineLimit(1).minimumScaleFactor(0.7)
                .frame(width: 32).padding(.vertical, 1).background(Palette.cardFace, in: RoundedRectangle(cornerRadius: 5))
            Rectangle().fill(underline).frame(width: 32, height: 3)
        }
    }
}

// Reveal the remaining private cards after a hand.
struct ShowCardsButton: View {
    let model: TableModel
    let view: GameView

    var body: some View {
        if !view.legal.show.isEmpty {
            Button { model.show(view.legal.show) } label: {
                Label(L("show_cards"), systemImage: "eye.fill")
                    .font(.headline).frame(maxWidth: .infinity).padding(.vertical, 10)
            }
            .buttonStyle(.borderedProminent).disabled(model.busy)
        }
    }
}

// Who won what, while the result is on show.
private struct ResultPanel: View {
    let model: TableModel
    let view: GameView

    var body: some View {
        if view.phase == .handOver, let r = view.lastResult {
            Panel {
                if r.voided { Text(L("voided")).font(.footnote).foregroundStyle(.secondary) }
                ForEach(Array(r.pots.enumerated()), id: \.offset) { i, p in
                    HStack(alignment: .top) {
                        Text(L(i == 0 ? "pot_label" : "side_pot", chips(p.amount))).font(.footnote).foregroundStyle(.secondary)
                        Spacer()
                        Text(p.winners.map { w in "\(view.name(w.playerId)) +\(chips(w.amount))" + (w.handName.map { " (\($0))" } ?? "") }.joined(separator: ", ")).font(.footnote).multilineTextAlignment(.trailing)
                    }
                }
            }
        }
    }
}

private struct RebuyDialog: View {
    let model: TableModel
    let view: GameView
    let now: Date
    #if os(tvOS)
    @FocusState private var acceptFocused: Bool
    #endif

    var body: some View {
        let offer = view.rebuyOffers.first { $0.playerId == view.you }
        let left = remaining(offer?.remainingMs, viewAt: model.viewAt, now: now, paused: view.paused) ?? 0
        ZStack {
            Color.black.opacity(0.6).ignoresSafeArea()
            Panel(title: L("rebuy_title")) {
                Text(L("rebuy_body", String((left + 999) / 1000)))
                ProgressView(value: min(1, Double(left) / 30000))
                HStack(spacing: 8) {
                    Button(L("rebuy_no")) { model.rebuy(false) }.buttonStyle(.bordered).frame(maxWidth: .infinity)
                    Button(L("rebuy_yes")) { model.rebuy(true) }.buttonStyle(.borderedProminent).frame(maxWidth: .infinity)
                    #if os(tvOS)
                        .focused($acceptFocused)
                    #endif
                }
                .disabled(model.busy)
            }
            .padding(24)
        }
        #if os(tvOS)
        .onAppear { acceptFocused = true }
        #endif
    }
}

extension Array {
    subscript(safe i: Int) -> Element? { indices.contains(i) ? self[i] : nil }
}
