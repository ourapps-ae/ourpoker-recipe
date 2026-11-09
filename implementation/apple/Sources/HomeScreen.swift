import SwiftUI

// Statuses of a room that people can still sit down in (room-directory takes the set as a parameter).
let roomOpenStatuses: Set<String> = ["lobby", "unknown"]

// Home: the two rooms and who is in each; tap one to sit down or watch.
struct HomeScreen: View {
    @Bindable var model: TableModel

    var body: some View {
        ZStack {
            PokerBackground(theme: themeFor(model.previewRoom)).id(model.previewRoom)
            ScrollView {
                VStack(spacing: 10) {
                    Spacer().frame(height: 24)
                    Logo(width: 70).environment(\.cardTheme, model.previewRoom)
                    Spacer().frame(height: 8)
                    Text(L("app_name")).font(.largeTitle.bold())
                    Text(L("tagline")).font(.subheadline).foregroundStyle(.secondary)
                    if Platform.uprightBoard {
                        HStack {
                            Button(L("mode_player")) { model.entryMode = .player }
                                .buttonStyle(.borderedProminent).tint(model.entryMode == .player ? Palette.gold : .gray)
                            Button(L("mode_board")) { model.entryMode = .board }
                                .buttonStyle(.borderedProminent).tint(model.entryMode == .board ? Palette.gold : .gray)
                        }
                    }
                    if !model.name.isEmpty && model.entryMode != .board {
                        HStack {
                            Text(L("playing_as", model.name)).font(.subheadline)
                            Button { Sound.play(.click); model.editingName = true } label: { Image(systemName: "pencil").font(.title3).foregroundStyle(Palette.gold) }
                                .accessibilityLabel(L("change_name"))
                                .guideAnchor("editName")
                        }
                    }
                    // Tap a room to select it (and preview its look); the button in the title bar enters it.
                    let selected = model.rooms.flatMap { rooms in rooms.first { $0.id == model.previewRoom } ?? rooms.first }
                    Panel {
                        HStack(spacing: 8) {
                            Text(L("select_room")).font(.headline).foregroundStyle(Palette.gold)
                            Spacer()
                            EnterButton(room: selected, model: model).guideAnchor("roomJoin")
                        }
                        if let rooms = model.rooms {
                            ForEach(rooms) { r in RoomRow(room: r, selected: r.id == selected?.id, model: model).modifier(GuideAnchorIf(name: "roomName", on: r.id == rooms.first?.id)) }
                            if model.roomsDown { Text(L("unreachable")).font(.footnote).foregroundStyle(.secondary) }
                        } else {
                            Text(L(model.roomsDown ? "unreachable" : "looking")).font(.subheadline)
                        }
                        if model.roomsDown, let server = model.serverOverride { Text(server).font(.caption2).foregroundStyle(.secondary) }
                        if let error = errorText(model.error) {
                            Text(error).foregroundStyle(.red).font(.footnote).multilineTextAlignment(.center).frame(maxWidth: .infinity)
                        }
                    }
                    .guideAnchor("rooms")
                    HStack(spacing: 10) {
                        LanguageMenu()
                        Button { Sound.play(.click); model.resetGuides() } label: { HomePill(symbol: "arrow.counterclockwise", text: L("reset_hints")) }
                            .platformButtonStyle()
                    }
                    Text("OurPoker \(currentVersion)").font(.caption2).foregroundStyle(.secondary)
                }
                .padding(16)
                .phoneColumn(help: { model.showHelp = true }, helpLabel: L("how_to_play"))
            }
        }
        // The room list stays live while the home screen shows.
        .onAppear {
            model.checkForUpdate()
            model.watchRooms(true)
        }
        .onDisappear { model.watchRooms(false) }
        .alert(L("update_available", model.update?.testflightVersion ?? ""), isPresented: Binding(get: { model.update != nil && !model.updateDismissed }, set: { if !$0 { model.updateDismissed = true } })) {
            if let url = model.update?.testflightUrl.flatMap({ URL(string: $0) }) {
                Button(L("update_now")) { UIApplication.shared.open(url); model.updateDismissed = true }
            }
            Button(L("update_later"), role: .cancel) { model.updateDismissed = true }
        } message: {
            Text(L("update_body", currentVersion))
        }
    }
}

private struct RoomRow: View {
    let room: RoomInfo
    let selected: Bool
    @Bindable var model: TableModel

    var body: some View {
        let inGame = !roomOpenStatuses.contains(room.status)
        let names = room.names.joined(separator: ", ")
        Button { if model.previewRoom != room.id { Sound.play(.click) }; model.previewRoom = room.id } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(roomName(room.id)).font(.headline).foregroundStyle(selected ? Palette.gold : .primary)
                Text(room.playerCount == 0 ? L("room_empty") : inGame ? L("room_in_game", names) : L("room_lobby", names))
                    .font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 10).padding(.vertical, 6)
            .background(selected ? Palette.gold.opacity(0.12) : .clear, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(selected ? Palette.gold.opacity(0.45) : .clear, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .platformButtonStyle()
    }
}

// Enter the selected room: sit down, rejoin, or watch a game under way; a lock while it is full.
// An iPad can also be the table viewer, even at a full room, so it asks which.
private struct EnterButton: View {
    let room: RoomInfo?
    @Bindable var model: TableModel
    @State private var askHow = false

    var body: some View {
        let inGame = room.map { !roomOpenStatuses.contains($0.status) } ?? false
        let seated = room.map { $0.names.contains(model.name) } ?? false
        let full = room.map { $0.playerCount >= 9 && !seated && !inGame } ?? false
        let board = Platform.uprightBoard && model.entryMode == .board
        let label = L(board ? "join_as_viewer" : seated ? "room_rejoin" : full ? "room_full" : inGame ? "room_watch" : "room_join")
        if model.busy {
            ProgressView().frame(width: 40, height: 40)
        } else {
            RoundIconButton(label: label, enabled: room != nil && (!full || isPad || board) && (!Platform.uprightBoard || model.entryMode != nil), filled: true, action: {
                guard let room else { return }
                if board { model.joinAsDisplay(roomId: room.id) }
                else if isPad && !Platform.uprightBoard { askHow = true }
                else if model.name.isEmpty { model.entryMode = .player; model.editingName = true }
                else { model.join(roomId: room.id) }
            }) { fg in
                if full && !isPad && !board { Image(systemName: "lock.fill").foregroundStyle(fg) }
                else { Image(systemName: "arrow.right.to.line").font(.system(size: 19, weight: .semibold)).foregroundStyle(fg) }
            }
            .confirmationDialog(L("join_how"), isPresented: $askHow, titleVisibility: .visible) {
                if let room, !full { Button(label) { model.join(roomId: room.id) } }
                if let room { Button(L("join_as_viewer")) { model.joinAsDisplay(roomId: room.id) } }
                Button(L("cancel"), role: .cancel) {}
            } message: {
                Text(L("viewer_note"))
            }
        }
    }
}

// The language in use, opening the list of languages.
private struct LanguageMenu: View {
    var body: some View {
        let language = Language.shared
        Menu {
            Picker(L("language"), selection: Binding(get: { language.picked ?? "" }, set: { code in
                Sound.play(.click)
                language.pick(code.isEmpty ? nil : code)
            })) {
                Text(L("lang_device")).tag("")
                ForEach(Language.all, id: \.code) { Text($0.name).tag($0.code) }
            }
        } label: {
            HomePill(symbol: "globe", text: Language.all.first { $0.code == language.current }?.name ?? "English")
        }
        .accessibilityLabel(L("language"))
    }
}

private struct HomePill: View {
    let symbol: String
    let text: String
    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: symbol).foregroundStyle(Palette.gold)
            Text(text).foregroundStyle(.white)
        }
        .font(.subheadline)
        .padding(.horizontal, 14).padding(.vertical, 8)
        .background(Color.black.opacity(0.45), in: Capsule())
        .overlay(Capsule().stroke(Palette.gold.opacity(0.35), lineWidth: 1))
    }
}
