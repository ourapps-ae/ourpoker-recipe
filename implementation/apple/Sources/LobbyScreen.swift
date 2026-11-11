import SwiftUI

struct LobbyScreen: View {
    @Bindable var model: TableModel

    var body: some View {
        guard let view = model.view else { return AnyView(EmptyView()) }
        let busy = model.busy
        let me = view.me
        return AnyView(ZStack {
            PokerBackground(theme: themeFor(view.roomId))
            ScrollView {
                VStack(spacing: 10) {
                    HStack { Text(roomName(view.roomId)).font(.title.bold()); Spacer() }.padding(.horizontal, 4)
                    PromptBanner(promptText(view))
                    Panel {
                        HStack(spacing: 6) {
                            if view.legal.leave {
                                RoundIconButton(label: L("leave"), enabled: !busy, filled: false, action: model.leave) { fg in BackGlyph(tint: fg) }
                                    .guideAnchor("leave")
                            }
                            if view.legal.addBot {
                                RoundIconButton(label: L("add_computer"), enabled: !busy, filled: false, action: model.addBot) { fg in AddBotIcon(tint: fg) }
                                    .guideAnchor("addBot")
                            }
                            Spacer()
                            if let me, !me.isBot {
                                RoundIconButton(label: view.legal.start ? L("start_game") : promptText(view), enabled: view.legal.start && !busy, filled: true, glow: true, action: model.start) { fg in
                                    Image(systemName: "play.fill").foregroundStyle(fg)
                                }
                                .guideAnchor("start")
                            }
                        }
                        let firstBot = view.players.first(where: \.isBot)?.id
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(view.players) { p in
                                HStack(spacing: 12) {
                                    SeatNumber(n: p.seat + 1)
                                    Text(p.name + (p.id == view.you ? " " + L("you_suffix") : ""))
                                    Spacer()
                                    if p.isBot { SVGIcon(d: IconPath.robot).fill(Color.white.opacity(0.6)).frame(width: 20, height: 20).accessibilityLabel(L("computer")).modifier(GuideAnchorIf(name: "botMark", on: p.id == firstBot)) }
                                    if view.legal.kick && p.isBot {
                                        Button { model.kick(p.id) } label: { SVGIcon(d: IconPath.removeCircle).fill(Palette.gold).frame(width: 24, height: 24) }
                                            .disabled(busy).accessibilityLabel(L("remove"))
                                            .modifier(GuideAnchorIf(name: "botRemove", on: p.id == firstBot))
                                    }
                                }
                                .padding(.vertical, 4)
                            }
                        }
                        .guideAnchor("players")
                    }
                    // Only with a camera this phone can use: otherwise there is nothing to show or switch.
                    if model.video.connected { VideoPanel(model: model, view: view) }
                    if let error = errorText(model.error) { Text(error).foregroundStyle(.red).font(.footnote) }
                }
                .padding(12)
                .phoneColumn(help: { model.showHelp = true })
            }
        })
    }
}

// Lobby: everyone's camera in a row, with microphone, camera and sound toggles.
struct VideoPanel: View {
    let model: TableModel
    let view: GameView

    var body: some View {
        Panel(title: L("video_title")) {
            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    ForEach(view.players.filter { model.video.hasVideo($0.id, isMe: $0.id == view.you) }) { p in
                        SeatScreen(session: model.video, playerId: p.id, isMe: p.id == view.you, name: p.name, width: 96, onTap: { model.videoPlayerId = p.id })
                    }
                }
            }
            HStack(spacing: 12) {
                MediaToggles(session: model.video)
                SoundToggle(session: model.video)
            }
        }
    }
}
