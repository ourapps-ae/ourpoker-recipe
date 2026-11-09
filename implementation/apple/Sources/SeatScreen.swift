import LiveKit
import SwiftUI

// A small monitor showing a player's camera, framed like a screen standing by their seat.
struct SeatScreen: View {
    let session: VideoSession
    let playerId: String
    let isMe: Bool
    let name: String
    let width: CGFloat
    // Height over width.
    var aspect: CGFloat = 0.75
    var onTap: (() -> Void)? = nil

    var body: some View {
        ZStack {
            VideoContent(session: session, playerId: playerId, isMe: isMe, name: name)
                .clipShape(RoundedRectangle(cornerRadius: 6))
            RoundedRectangle(cornerRadius: 6).stroke(Color(red: 0.23, green: 0.23, blue: 0.23), lineWidth: 2)
        }
        .frame(width: width, height: width * aspect)
        .contentShape(Rectangle())
        .tapIf(onTap)
    }
}

// The camera, or the player's initial; fills whatever space it is placed in.
struct VideoContent: View {
    let session: VideoSession
    let playerId: String
    let isMe: Bool
    let name: String
    var initialSize: CGFloat = 44

    var body: some View {
        // Reading tracksVersion ties this view to track arrivals.
        let _ = session.tracksVersion
        ZStack {
            Color(red: 0.06, green: 0.06, blue: 0.06)
            if session.connected, let track = cameraTrack() {
                SwiftUIVideoView(track, layoutMode: .fill, mirrorMode: isMe ? .mirror : .auto)
                    .allowsHitTesting(false)
            } else {
                Text(String(name.prefix(1))).font(.system(size: initialSize)).foregroundStyle(Color(red: 0.4, green: 0.4, blue: 0.4))
            }
        }
    }

    private func cameraTrack() -> VideoTrack? {
        let participant: Participant? = isMe ? session.room.localParticipant
            : session.room.remoteParticipants.values.first { $0.identity?.stringValue == playerId }
        return participant?.videoTracks.first { $0.source == .camera }?.track as? VideoTrack
    }
}
