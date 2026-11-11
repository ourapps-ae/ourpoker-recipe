package app.ourapps.ourpoker

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

// Installed in place of Video.kt when the design leaves out video-calls: the same surface, never in a video room.
class VideoRoom private constructor()

@Suppress("UNUSED_PARAMETER")
class Video(context: Context, canCapture: () -> Boolean) {
    val room: StateFlow<VideoRoom?> = MutableStateFlow(null)
    val micOn: StateFlow<Boolean> = MutableStateFlow(false)
    val camOn: StateFlow<Boolean> = MutableStateFlow(false)
    val camUsable: StateFlow<Boolean> = MutableStateFlow(false)
    val paused: StateFlow<Boolean> = MutableStateFlow(false)
    val failed: StateFlow<Boolean> = MutableStateFlow(false)
    val held: StateFlow<Boolean> = MutableStateFlow(false)
    val tracksVersion: StateFlow<Int> = MutableStateFlow(0)

    fun connect(url: String, token: String, roomName: String) {}
    fun setMic(on: Boolean) {}
    fun setCam(on: Boolean) {}
    fun setSpeaker(on: Boolean) {}
    fun hold(on: Boolean) {}
    fun background() {}
    fun foreground() {}
    fun pauseForIdle() {}
    fun resumeFromPause() {}
    fun disconnect() {}
    fun forget() {}
    fun close() {}
}
