import SwiftUI

// The screen flow: home, name, lobby, seat, table, results, and the table viewer.
struct RootView: View {
    @Bindable var model: TableModel

    // Which screen shows, for its guides.
    private var screen: String {
        if model.display && model.token != nil { return "viewer" }
        if model.showHelp || needsName { return "other" }
        guard model.token != nil, let v = model.view else { return "home" }
        return v.status == .lobby ? "lobby" : v.status == .running ? "table" : "other"
    }

    private var needsName: Bool {
        model.editingName || (model.name.isEmpty && (!Platform.uprightBoard || model.entryMode == .player))
    }

    var body: some View {
        let viewer = model.display && model.token != nil
        #if !os(tvOS)
        let atTable = !model.showHelp && (viewer || (!(model.name.isEmpty || model.editingName) && model.token != nil && model.view?.status == .running))
        #endif
        ZStack {
            Palette.table.ignoresSafeArea()
            if model.showHelp {
                HelpScreen { model.showHelp = false }
            } else if viewer {
                DisplayScreen(model: model)
            } else if needsName {
                NameScreen(model: model)
            } else if model.token == nil || model.view == nil {
                HomeScreen(model: model)
            } else if model.view?.status == .lobby {
                LobbyScreen(model: model)
            } else if model.view?.status == .running {
                TableScreen(model: model)
            } else {
                EndScreen(model: model)
            }
        }
        .pokerStyles()
        // Camera and microphone stay off through a game with only computer players.
        .onChange(of: model.token != nil && (model.view?.soloGame ?? false), initial: true) { _, solo in model.video.hold(solo) }
        // How to play: the table keeps it in its header; every other screen has it in this corner.
        .overlay(alignment: .topTrailing) {
            #if !os(tvOS)
            if !model.showHelp && !atTable {
                HelpBulb(label: L("how_to_play")) { Sound.play(.click); model.showHelp = true }.padding(.top, 4).padding(.trailing, 8)
            }
            #endif
        }
        .overlay {
            if !model.display, let id = model.videoPlayerId, let view = model.view, let player = view.player(id) {
                ZStack {
                    Color.black.opacity(0.85).ignoresSafeArea().onTapGesture { model.videoPlayerId = nil }
                    VStack(spacing: 12) {
                        Text(player.name).font(.headline)
                        VideoContent(session: model.video, playerId: id, isMe: id == view.you, name: player.name)
                            .aspectRatio(4 / 3, contentMode: .fit).clipShape(RoundedRectangle(cornerRadius: 16))
                            .onTapGesture { model.videoPlayerId = nil }
                        Button(L("done")) { model.videoPlayerId = nil }.buttonStyle(.borderedProminent)
                    }.padding(24).phoneColumn()
                }
            }
        }
        // Lessons for the screen showing, the first time it shows; the home and lobby ones here, the
        // table's as things happen there. The guided-tour component draws them.
        .lessonsHost(model.tour)
        .overlay {
            if model.beginner == nil && !viewer && (!Platform.uprightBoard || model.entryMode == .player) {
                ZStack {
                    Color.black.opacity(0.7).ignoresSafeArea()
                    VStack(spacing: 20) {
                        Text(L("beginner_title")).font(.title2.bold())
                        Button(L("beginner_yes")) { model.chooseBeginner(true) }.buttonStyle(.borderedProminent)
                        Button(L("beginner_no")) { model.chooseBeginner(false) }.buttonStyle(.bordered)
                    }
                    .padding(24).background(Palette.surface, in: RoundedRectangle(cornerRadius: 16)).padding(24)
                }
            }
        }
        .onChange(of: screen, initial: true) { _, s in
            model.onScreen(s)
            if s == "home" && model.rooms != nil { model.want(.home) }
            if s == "lobby" {
                model.want(.lobby)
                if model.view?.players.contains(where: \.isBot) ?? false { model.want(.bots) }
            }
        }
        .onChange(of: model.rooms != nil) { _, has in if has && screen == "home" { model.want(.home) } }
        .onChange(of: model.view?.players.contains(where: \.isBot) ?? false) { _, bots in if bots && screen == "lobby" { model.want(.bots) } }
        #if os(tvOS)
        .onExitCommand {
            if model.videoPlayerId != nil { model.videoPlayerId = nil }
            else if model.zoom != nil { model.zoom = nil }
            else if model.betTo != nil { model.betTo = nil }
            else if model.showHelp { model.showHelp = false }
            else if model.tour.holding { model.guideDone() }
            else if model.editingName { model.editingName = false; model.entryMode = nil }
            else if !model.display && model.token != nil { model.leave() }
            else { model.entryMode = nil }
        }
        #endif
    }
}
