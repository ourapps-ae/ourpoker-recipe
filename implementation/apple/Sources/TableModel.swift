import Foundation
import Observation

struct UiError: Equatable {
    let code: String?
    let message: String?
}

@Observable
@MainActor
final class TableModel {
    var token: String? = UserDefaults.standard.string(forKey: "token")
    var roomId: String? = UserDefaults.standard.string(forKey: "roomId")
    // The token is the table viewer's: this device shows the table to everyone round it.
    var display: Bool = UserDefaults.standard.bool(forKey: "display")
    var entryMode: RoomMode?
    private var sessionGeneration = 0
    var name: String = UserDefaults.standard.string(forKey: "name") ?? ""
    var view: GameView?
    // When the view arrived, so countdowns can run from remainingMs.
    var viewAt = Date()
    var error: UiError?
    var busy = false
    var rooms: [RoomInfo]?
    // The last room list request failed: the server cannot be reached.
    var roomsDown = false
    // The server in use when it is not the built-in one (a simulator pointed at a test server).
    var serverOverride: String? { UserDefaults.standard.string(forKey: "serverURL") }
    var showHelp = false
    var editingName = false
    var previewRoom = "casino"
    // Bet slider value while choosing an amount; nil when closed.
    var betTo: Int?
    var update: UpdateInfo?
    var updateDismissed = false
    // Cards shown large over the screen until tapped away: the community cards, the winning hands,
    // one player's shown hand, or your own cards (live ones keep their check and fold gestures
    // there). At the end of a hand, looking holds the play clock for everyone.
    enum Zoom: Equatable { case board, showcase, mine, folded, hand(String) }
    var zoom: Zoom? = nil { didSet { updateHold() } }
    var videoPlayerId: String?

    // Lessons run by the guided-tour component (Lessons.swift).
    let tour = Lessons()
    func want(_ id: GuideID) {
        guard !display, entryMode != .board else { return }
        guard !Platform.uprightBoard || entryMode == .player else { return }
        tour.want(id.rawValue)
        updateHold()
    }
    func guideDone() {
        tour.skip()
        updateHold()
    }
    // Every guide shows again, each the next time its screen asks for it; the home one now.
    func resetGuides() {
        chooseBeginner(true)
        tour.reset()
        want(.home)
    }
    // Guides for one screen go when another screen shows.
    func onScreen(_ screen: String) {
        tour.screenChanged(screen)
        updateHold()
    }

    // The play clock this device holds for everyone: while cards are looked at large at the end of
    // a hand ("look") or a guide is open at the table ("learn").
    private var hold: String? = nil
    func updateHold() {
        guard let v = view, v.status == .running, !v.isDisplay, token != nil else { setHold(nil); return }
        setHold(tour.holding ? "learn" : zoom != nil && v.phase == .handOver ? "look" : nil)
    }
    private func setHold(_ kind: String?) {
        if kind == hold { return }
        hold = kind
        live?.send(json(["type": "hold", "kind": kind ?? NSNull()]))
    }

    // The possible-hands panel under the table; remembered on this device, open by default.
    var handPanel: Bool = UserDefaults.standard.object(forKey: "handPanel") as? Bool ?? true

    // Whether the person wants guidance: nil until asked once.
    private(set) var guidanceAnswers = 0
    var beginner: Bool? { _ = guidanceAnswers; return tour.enabled }

    func chooseBeginner(_ value: Bool) {
        tour.setEnabled(value)
        guidanceAnswers += 1
        handPanel = value
        UserDefaults.standard.set(value, forKey: "handPanel")
        if value { want(.home) } else { updateHold() }
        live?.send(oddsMessage())
    }

    private var warnedTurn: String?
    func warnIfTimeIsShort(now: Date) {
        guard let v = view, !v.isDisplay, !v.paused, !v.held,
              v.phase == .betting, v.hand?.actorId == v.you,
              let h = v.hand, let remaining = h.remainingMs else { return }
        let left = Double(remaining) - now.timeIntervalSince(viewAt) * 1000
        let turn = "\(v.gameNumber)|\(h.no)|\(h.street)|\(h.actorId ?? "")|\(h.event ?? "")"
        guard left > 0, left <= 6000, warnedTurn != turn else { return }
        warnedTurn = turn
        Sound.play(.turn)
        Sound.play(.turn, after: 0.22)
    }

    // The possible hands come with every view while the panel is open; the room is told at once.
    func toggleHandPanel() {
        handPanel.toggle()
        UserDefaults.standard.set(handPanel, forKey: "handPanel")
        live?.send(oddsMessage())
    }

    private let client: TableClient
    // Live connections: the room's while seated or showing the table, the home list's while the
    // home screen shows. Closed in the background, reopened in the foreground.
    private var live: LiveConnection<LiveMessage>?
    private var homeLive: LiveConnection<LiveMessage>?
    private var homeWanted = false
    private var foreground = true
    @ObservationIgnored lazy var video = Video(soundOn: { SoundSetting.shared.on }, soundChanged: { SoundSetting.shared.set($0) }, canCapture: { [weak self] in DisplayPolicy.canCapture(self?.display ?? true) })
    private var grant: VideoGrant?
    private var idleCut: Task<Void, Never>?
    private let idleLimit: UInt64 = 5 * 60 * 1_000_000_000
    // The rejoin at launch is under way; the room's connection opens when it ends.
    private var rejoining = false

    init(client: TableClient? = nil, restore: Bool = true) {
        // The apple-host's settings read the address its project wrote into Info.plist; a `serverURL` default
        // (simulator testing against a local wrangler dev) wins over it.
        let urlString = ShellSettings.current.serverAddress ?? "{{serverAddress}}"
        self.client = client ?? TableClient(baseURL: URL(string: urlString + "/")!)
        if !restore { token = nil; roomId = nil; display = false; return }
        if token != nil { entryMode = display ? .board : .player }
        // Relaunch: rejoin by name first so the seat token and video grant are fresh, then
        // connect. The table viewer just carries on.
        if token != nil { if display { openRoom() } else { refreshVideoGrant() } }
    }

    // Home screen: who is in each room, live while it shows. A connection that cannot be made
    // says the server cannot be reached.
    func watchRooms(_ on: Bool) {
        homeWanted = on
        if on && foreground {
            if homeLive == nil, let url = liveURL("rooms/ws") {
                homeLive = LiveConnection(url: url, hello: { nil }, decode: { try JSONDecoder().decode(LiveMessage.self, from: $0) }, onDown: { [weak self] down in
                    if self?.roomsDown != down { self?.roomsDown = down }
                }) { [weak self] m in
                    guard let self, let r = m.rooms else { return }
                    if r.map(\.summary) != self.rooms?.map(\.summary) { self.rooms = r }
                    self.roomsDown = false
                }
            }
            homeLive?.open()
        } else {
            homeLive?.close()
            if !on { homeLive = nil }
        }
    }

    private func liveURL(_ path: String) -> URL? {
        guard var c = URLComponents(url: client.baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false) else { return nil }
        c.scheme = c.scheme == "http" ? "ws" : "wss"
        return c.url
    }

    private func json(_ object: [String: Any]) -> String {
        (try? JSONSerialization.data(withJSONObject: object)).flatMap { String(data: $0, encoding: .utf8) } ?? ""
    }

    private func oddsMessage() -> String { json(["type": "odds", "on": handPanel && !display]) }

    // Ask the server (which relays the store) for the newest release.
    func checkForUpdate() {
        guard ApplicationSettings.updatesEnabled else { return }
        #if !targetEnvironment(macCatalyst) && !os(tvOS)
        Task {
            // Only what TestFlight can already give, not a release still waiting for Apple.
            if let info = try? await client.update(), let v = info.testflightVersion, info.testflightUrl != nil, newerRelease(v, than: applicationVersion) { update = info }
        }
        #endif
    }

    // The display name is entered once and kept on the phone.
    func setName(_ newName: String) {
        let trimmed = newName.trimmingCharacters(in: .whitespaces)
        UserDefaults.standard.set(trimmed, forKey: "name")
        name = trimmed
        editingName = false
    }

    func join(roomId id: String) {
        guard !name.isEmpty else { editingName = true; return }
        signOut()
        entryMode = .player
        let generation = sessionGeneration
        Sound.play(.enter)
        busy = true
        error = nil
        Task {
            do {
                let r = try await client.join(roomId: id, name: name)
                guard generation == sessionGeneration else { return }
                UserDefaults.standard.set(r.token, forKey: "token")
                UserDefaults.standard.set(id, forKey: "roomId")
                token = r.token
                roomId = id
                grant = r.video
                connectVideo()
                setView(r.view)
                openRoom()
            } catch let e as ApiError {
                guard generation == sessionGeneration else { return }
                self.error = UiError(code: e.code, message: e.message)
            } catch {
                guard generation == sessionGeneration else { return }
                self.error = UiError(code: "network", message: error.localizedDescription)
            }
            busy = false
        }
    }

    // This device becomes the table viewer for a room: no seat, no name, nothing to play.
    func joinAsDisplay(roomId id: String) {
        signOut()
        entryMode = .board
        display = true
        let generation = sessionGeneration
        busy = true
        error = nil
        Task {
            do {
                let r = try await client.joinDisplay(roomId: id)
                guard generation == sessionGeneration else {
                    await client.leaveDisplay(roomId: id, token: r.token)
                    return
                }
                startDisplay(roomId: id, token: r.token, view: r.view)
            } catch let e as ApiError {
                guard generation == sessionGeneration else { return }
                self.error = UiError(code: e.code, message: e.message)
            } catch {
                guard generation == sessionGeneration else { return }
                self.error = UiError(code: "network", message: error.localizedDescription)
            }
            busy = false
        }
    }

    private func startDisplay(roomId id: String, token newToken: String, view v: GameView) {
        live?.close()
        video.disconnect()
        grant = nil
        UserDefaults.standard.set(newToken, forKey: "token")
        UserDefaults.standard.set(id, forKey: "roomId")
        UserDefaults.standard.set(true, forKey: "display")
        token = newToken
        roomId = id
        display = true
        setView(v)
        openRoom()
    }

    // A viewer whose token was dropped (unseen for an hour, or pushed out by newer ones) joins again.
    private func rejoinDisplay() {
        guard let id = roomId else { return }
        let generation = sessionGeneration
        Task {
            var backoff: UInt64 = 1
            while display && roomId == id && generation == sessionGeneration {
                if let r = try? await client.joinDisplay(roomId: id) {
                    guard generation == sessionGeneration else { await client.leaveDisplay(roomId: id, token: r.token); return }
                    startDisplay(roomId: id, token: r.token, view: r.view)
                    return
                }
                try? await Task.sleep(nanoseconds: backoff * 1_000_000_000)
                backoff = min(backoff * 2, 30)
            }
        }
    }

    func stopDisplay() {
        let token = token, roomId = roomId
        if let token, let roomId { Task { await client.leaveDisplay(roomId: roomId, token: token) } }
        signOut()
    }

    private func setView(_ v: GameView) {
        guard v.isDisplay == display, roomId == v.roomId else { return }
        let prev = view
        if v.hand?.actorId != prev?.hand?.actorId || v.hand?.no != prev?.hand?.no || v.hand?.street != prev?.hand?.street {
            warnedTurn = nil
        }
        view = v
        viewAt = Date()
        if v.legal.bet == nil { betTo = nil }
        // The table viewer plays no sounds and shows no guides: it is for the whole table.
        if !v.isDisplay {
            sounds(prev, v)
            for g in Guides.forTable(v) { want(g) }
        }
        updateHold()
    }

    // Sounds for what others did and what the table did; your own actions sound as you tap.
    private var lastActionKey = ""
    private func sounds(_ prev: GameView?, _ view: GameView) {
        guard let prev, let hand = view.hand, prev.gameNumber == view.gameNumber, prev.roomId == view.roomId else { return }
        let ph = prev.hand
        let sameHand = ph?.no == hand.no
        if !sameHand { Sound.play(.deal) } else if hand.board.count > (ph?.board.count ?? 0) { Sound.play(.burn); Sound.play(.flip, after: 0.3) }
        if hand.event == "action", let id = hand.lastActorId, id != view.you, let p = view.player(id), let a = p.lastAction {
            let key = "\(hand.no)|\(hand.street)|\(id)|\(a.kind)|\(p.bet)|\(p.totalIn)"
            if key != lastActionKey {
                lastActionKey = key
                Sound.play(a.kind == "check" ? .check : a.kind == "fold" ? .fold : a.kind == "allIn" ? .allin : .chips)
            }
        }
        if view.phase == .handOver && prev.phase != .handOver { Sound.play(.win, after: 0.5) }
        let mine = view.phase == .betting && hand.actorId == view.you
        let wasMine = sameHand && prev.phase == .betting && ph?.actorId == view.you
        if mine && !wasMine { Sound.play(.turn) }
    }

    // A view only replaces one from the same room with a lower version: an action's reply and
    // the pushed view can arrive in either order.
    private func newer(_ v: GameView) -> Bool {
        guard let current = view, current.roomId == v.roomId else { return true }
        return v.version > current.version
    }

    // What each of your own actions sounds like, played as you tap.
    private static let actionSound: [String: SoundName] = [
        "fold": .fold, "check": .check, "call": .chips, "bet": .chips, "rebuy": .chips, "show": .flip,
        "start": .start, "newGame": .start, "cancel": .end, "addBot": .botAdd, "kick": .botRemove,
        "return": .click, "sitOut": .click, "pause": .click, "resume": .click,
    ]

    func act(_ type: String, _ fields: [String: Any] = [:]) {
        guard DisplayPolicy.canAct(display), let token, let roomId, let v = view, !v.isDisplay else { return }
        let version = v.version
        let generation = sessionGeneration
        if let me = view?.me {
            let allIn = (type == "call" && (view?.legal.call ?? 0) >= me.stack) || (type == "bet" && (fields["to"] as? Int ?? 0) >= me.stack + me.bet)
            if let sound = allIn ? .allin : Self.actionSound[type] { Sound.play(sound) }
        }
        busy = true
        error = nil
        betTo = nil
        Task {
            do {
                let v = try await client.action(roomId: roomId, token: token, expectedVersion: version, type: type, fields: fields, odds: handPanel)
                guard generation == sessionGeneration else { return }
                if newer(v) { setView(v) }
            } catch let e as ApiError {
                guard generation == sessionGeneration else { return }
                if e.status == 401 { signOut(error: UiError(code: "tableReset", message: nil)); return }
                if let v = e.view, newer(v) { setView(v) }
                if e.code != "staleVersion" { error = UiError(code: e.code, message: e.message) }
            } catch {
                guard generation == sessionGeneration else { return }
                self.error = UiError(code: "network", message: error.localizedDescription)
            }
            busy = false
        }
    }

    func fold() { act("fold") }
    func check() { act("check") }
    func call() { act("call") }
    func bet(_ to: Int) { act("bet", ["to": to]) }
    func rebuy(_ accept: Bool) { act("rebuy", ["accept": accept]) }
    func show(_ cards: [Int]) { act("show", ["cards": cards]) }
    func addBot() { act("addBot") }
    func kick(_ playerId: String) { act("kick", ["playerId": playerId]) }
    func start() { act("start") }
    func sitOut() { act("sitOut") }
    func back() { act("return") }
    func pause() { act("pause") }
    func resume() { act("resume") }
    func cancel() { act("cancel") }
    func newGame() { act("newGame") }

    // Leaving tells the table (seat given up, or sit out when a game runs) and goes home. The
    // room's connection ends first, so its goodbye is not taken for a reset table.
    func leave() {
        guard !display else { stopDisplay(); return }
        let token = token, roomId = roomId, version = view?.version
        signOut()
        Sound.play(.exit)
        Task {
            if let token, let roomId, let version { _ = try? await client.action(roomId: roomId, token: token, expectedVersion: version, type: "leave") }
        }
    }

    // Every table change restarts the clock; silence for the limit cuts the video.
    private func armIdleCut() {
        idleCut?.cancel()
        idleCut = Task { [weak self] in
            guard let self else { return }
            try? await Task.sleep(nanoseconds: self.idleLimit)
            if !Task.isCancelled { self.video.pauseForIdle() }
        }
    }

    func resumeVideo() {
        guard !display, token != nil else { return }
        video.resumeFromPause()
        armIdleCut()
    }

    private func connectVideo() {
        guard !display, let g = grant else { return }
        video.connect(url: g.url, token: g.token, roomName: g.room)
    }

    // A relaunched app has a seat token but no video grant: rejoin by name to get one.
    private func refreshVideoGrant() {
        let generation = sessionGeneration
        guard let id = roomId, grant == nil, !name.isEmpty else { openRoom(); return }
        rejoining = true
        Task {
            defer { if generation == sessionGeneration { rejoining = false } }
            for attempt in 0..<5 {
                do {
                    let r = try await client.join(roomId: id, name: name)
                    guard generation == sessionGeneration, !display else { return }
                    UserDefaults.standard.set(r.token, forKey: "token")
                    token = r.token
                    setView(r.view)
                    error = nil
                    grant = r.video
                    connectVideo()
                    openRoom()
                    return
                } catch let e as ApiError where e.status == 401 || e.status == 409 {
                    guard generation == sessionGeneration else { return }
                    signOut()
                    return
                } catch {
                    guard generation == sessionGeneration else { return }
                    try? await Task.sleep(nanoseconds: UInt64(1 << attempt) * 1_000_000_000)
                }
            }
            if generation == sessionGeneration { openRoom() }
        }
    }

    func signOut(error: UiError? = nil) {
        Sound.stopAll()
        sessionGeneration += 1
        rejoining = false
        live?.close()
        live = nil
        idleCut?.cancel()
        video.disconnect()
        grant = nil
        UserDefaults.standard.removeObject(forKey: "token")
        UserDefaults.standard.removeObject(forKey: "roomId")
        UserDefaults.standard.removeObject(forKey: "display")
        token = nil
        roomId = nil
        display = false
        view = nil
        busy = false
        betTo = nil
        zoom = nil
        videoPlayerId = nil
        tour.reset()
        hold = nil
        showHelp = false
        editingName = false
        entryMode = nil
        self.error = error
    }

    // Foreground: reconnect; the room sends its view at once.
    func resumed() {
        foreground = true
        if token != nil && !rejoining { openRoom() }
        if homeWanted { watchRooms(true) }
        video.foreground()
    }

    // Background: the connections close, which tells the table at once that we are away (the
    // host pause depends on it); the away call covers a close that does not get out in time.
    func paused() {
        foreground = false
        live?.close()
        live = nil
        homeLive?.close()
        video.background()
        if let token, let roomId, !display { Task { await client.away(roomId: roomId, token: token) } }
    }

    // The room's live connection: it says who we are (and whether the possible hands are
    // wanted), then every change arrives as a view. A token the room no longer knows ends the
    // seat; a table viewer joins again instead.
    private func openRoom() {
        live?.close()
        guard foreground, let token, let roomId, let url = liveURL("r/\(roomId)/ws") else { live = nil; return }
        let generation = sessionGeneration
        live = LiveConnection(url: url, hello: { [weak self] in
            guard let self, generation == self.sessionGeneration else { return nil }
            return self.json(["type": "hello", "token": token, "odds": self.handPanel && !self.display, "hold": self.hold ?? NSNull()])
        }, decode: { try JSONDecoder().decode(LiveMessage.self, from: $0) }, onDown: { _ in }) { [weak self] m in
            guard let self, generation == self.sessionGeneration, self.token == token, self.roomId == roomId else { return }
            if m.type == "error" {
                if self.display { self.live?.close(); self.live = nil; self.rejoinDisplay() } else { self.signOut(error: UiError(code: "tableReset", message: nil)) }
                return
            }
            guard let v = m.view, self.newer(v) else { return }
            self.setView(v)
            if !self.display { self.armIdleCut() }
        }
        live?.open()
    }
}
