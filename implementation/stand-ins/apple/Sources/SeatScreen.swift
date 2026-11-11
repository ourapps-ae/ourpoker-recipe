import SwiftUI

// Installed in place of the seat video tile when the design leaves out video-calls: the player's initial, never a picture.
struct SeatScreen: View {
    let session: Video
    let playerId: String
    let isMe: Bool
    let name: String
    let width: CGFloat
    var aspect: CGFloat = 0.75
    var onTap: (() -> Void)? = nil

    var body: some View {
        VideoContent(session: session, playerId: playerId, isMe: isMe, name: name)
            .frame(width: width, height: width * aspect)
    }
}

struct VideoContent: View {
    let session: Video
    let playerId: String
    let isMe: Bool
    let name: String
    var initialSize: CGFloat = 44

    var body: some View {
        ZStack {
            Color(red: 0.06, green: 0.06, blue: 0.06)
            Text(String(name.prefix(1))).font(.system(size: initialSize)).foregroundStyle(Color(red: 0.4, green: 0.4, blue: 0.4))
        }
    }
}
