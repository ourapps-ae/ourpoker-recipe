import SwiftUI

// Final standings after a completed or cancelled tournament.
struct EndScreen: View {
    @Bindable var model: TableModel

    var body: some View {
        guard let view = model.view else { return AnyView(EmptyView()) }
        let busy = model.busy
        let ranked = view.players.filter { $0.place != nil }.sorted { ($0.place ?? 99) < ($1.place ?? 99) }
        let unranked = view.players.filter { $0.place == nil }
        return AnyView(ZStack {
            PokerBackground(theme: themeFor(view.roomId))
            ScrollView {
                VStack(spacing: 10) {
                    HStack { Text(roomName(view.roomId)).font(.title.bold()); Spacer() }.padding(.horizontal, 4)
                    PromptBanner(promptText(view))
                    ShowCardsButton(model: model, view: view)
                    Panel {
                        HStack {
                            RoundIconButton(label: L("leave"), enabled: !busy, filled: false, action: model.leave) { fg in BackGlyph(tint: fg) }
                            Spacer()
                            if view.legal.newGame {
                                RoundIconButton(label: L("new_game"), enabled: !busy, filled: true, glow: true, action: model.newGame) { fg in
                                    Image(systemName: "arrow.right.to.line").font(.system(size: 19, weight: .semibold)).foregroundStyle(fg)
                                }
                            }
                        }
                        .padding(.bottom, 4)
                        Text(L(view.status == .cancelled ? "cancelled_title" : "standings")).font(.headline).foregroundStyle(Palette.gold)
                        if view.status == .cancelled { Text(L("cancelled_body")).font(.footnote).foregroundStyle(.secondary) }
                        ForEach(ranked + unranked) { p in
                            HStack(spacing: 12) {
                                SeatNumber(n: p.place ?? 0)
                                Text(p.name + (p.id == view.you ? " " + L("you_suffix") : ""))
                                Spacer()
                                ForEach(Array(p.cards.enumerated()), id: \.offset) { i, card in
                                    if let card, p.id != view.you || !view.legal.show.contains(i) {
                                        PlayingCard(code: card, width: 32)
                                    }
                                }
                                // The robot before the amount, so the amounts line up on the right.
                                if p.isBot { SVGIcon(d: IconPath.robot).fill(Color.white.opacity(0.6)).frame(width: 20, height: 20) }
                                if p.place == nil { Text(chips(p.stack)).font(.footnote) }
                                else if p.rebuysUsed > 0 { Text(L("rebought")).font(.footnote).foregroundStyle(.secondary) }
                            }
                            .padding(.vertical, 4)
                        }
                    }
                    if let error = errorText(model.error) { Text(error).foregroundStyle(.red).font(.footnote) }
                }
                .padding(12)
                .phoneColumn(help: { model.showHelp = true })
            }
        })
    }
}
