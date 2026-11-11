package app.ourapps.ourpoker

// The only application file besides ui/SeatScreen.kt that names video-calls: the manifest installs it only when the design
// includes that component, and a stand-in with the same declarations otherwise.
typealias Video = ae.video.VideoSession
typealias VideoRoom = io.livekit.android.room.Room
