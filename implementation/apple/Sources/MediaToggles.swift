import SwiftUI
import AVFoundation

// GAP: G9.4 video-calls has the session but no toggle strip; these are drawn with the controls component's ToggleButton.
// Microphone and camera toggles with the usual icons: filled when on, struck through when off.
struct MediaToggles: View {
    let session: VideoSession

    var body: some View {
        HStack(spacing: 12) {
            ToggleButton(on: session.micOn, onIcon: "mic.fill", offIcon: "mic.slash.fill", label: L(session.micOn ? "mic_on" : "mic_off")) { session.setMic(!session.micOn) }
            ToggleButton(on: session.camOn, onIcon: "video.fill", offIcon: "video.slash.fill", label: L(session.camOn ? "cam_on" : "cam_off")) { session.setCam(!session.camOn) }
            #if !os(tvOS)
            if VideoSession.offersCameraSelection && (session.cameras.count > 1 || session.selectedCameraID != nil || session.cameraFailed) {
                Menu {
                    Picker(L("camera_select"), selection: Binding(get: { session.availableCameraID }, set: { session.selectCamera($0) })) {
                        Text(L("camera_automatic")).tag("")
                        ForEach(session.cameras) { camera in Text(camera.name).tag(camera.id) }
                    }
                    .pickerStyle(.inline)
                    if session.cameraFailed { Text(L("camera_unavailable")) }
                } label: {
                    Image(systemName: "chevron.down").frame(width: 32, height: 44)
                }
                .accessibilityLabel(L("camera_select"))
                .accessibilityValue(session.cameras.first { $0.id == session.availableCameraID }?.name ?? L("camera_automatic"))
            }
            #endif
        }
        .task { if VideoSession.offersCameraSelection { await session.refreshCameras() } }
        .onReceive(NotificationCenter.default.publisher(for: AVCaptureDevice.wasConnectedNotification)) { _ in
            if VideoSession.offersCameraSelection { Task { await session.refreshCameras() } }
        }
        .onReceive(NotificationCenter.default.publisher(for: AVCaptureDevice.wasDisconnectedNotification)) { _ in
            if VideoSession.offersCameraSelection { Task { await session.refreshCameras() } }
        }
    }
}

// Sounds on or off: the game's sounds and other players' voices.
struct SoundToggle: View {
    let session: VideoSession

    var body: some View {
        let on = SoundSetting.shared.on
        ToggleButton(on: on, onIcon: "speaker.wave.2.fill", offIcon: "speaker.slash.fill", label: L(on ? "sound_on" : "sound_off")) { session.setSound(!on) }
    }
}

// In place of the microphone and camera while the video is cut or failed to connect.
struct ReconnectButton: View {
    let action: () -> Void

    var body: some View {
        ToggleButton(on: false, onIcon: "arrow.clockwise", offIcon: "arrow.clockwise", label: L("video_reconnect"), action: action)
    }
}
