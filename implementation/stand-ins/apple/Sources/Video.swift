import Foundation
import Observation

// Installed in place of Video.swift when the design leaves out video-calls: the same surface, never in a video room.
struct CameraDevice: Identifiable, Equatable {
    let id: String
    let name: String
}

@Observable
@MainActor
final class Video {
    let connected = false
    let micOn = false
    let camOn = false
    let camUsable = false
    let tracksVersion = 0
    let cameras: [CameraDevice] = []
    let selectedCameraID: String? = nil
    let cameraFailed = false
    let availableCameraID = ""
    let canReconnect = false
    static let offersCameraSelection = false
    @ObservationIgnored private let soundChanged: (Bool) -> Void

    init(soundOn: @escaping () -> Bool, soundChanged: @escaping (Bool) -> Void, canCapture: @escaping () -> Bool) {
        self.soundChanged = soundChanged
    }

    func refreshCameras() async {}
    func selectCamera(_ id: String) {}
    func setSound(_ on: Bool) { soundChanged(on) }
    func hasVideo(_ playerId: String, isMe: Bool) -> Bool { false }
    func connect(url: String, token: String, roomName: String) {}
    func setMic(_ on: Bool) {}
    func setCam(_ on: Bool) {}
    func hold(_ on: Bool) {}
    func background() {}
    func foreground() {}
    func pauseForIdle() {}
    func resumeFromPause() {}
    func disconnect() {}
}
