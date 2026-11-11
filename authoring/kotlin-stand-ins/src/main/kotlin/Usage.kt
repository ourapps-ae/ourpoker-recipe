// Every call the application makes through Video.kt, Updates.kt, ui/Lessons.kt and ui/SeatScreen.kt, with the same argument shapes.
package app.ourapps.ourpoker

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.ourapps.ourpoker.ui.Guided
import app.ourapps.ourpoker.ui.Lessons
import app.ourapps.ourpoker.ui.SeatScreen
import app.ourapps.ourpoker.ui.VideoOrInitial
import app.ourapps.ourpoker.ui.guideAnchor
import app.ourapps.ourpoker.ui.rememberLiveVideo
import kotlinx.coroutines.flow.StateFlow

fun usage(app: Context, prefs: SharedPreferences, canCapture: () -> Boolean) {
    val video = Video(app) { canCapture() }
    val room: StateFlow<VideoRoom?> = video.room
    val flows: List<StateFlow<Boolean>> = listOf(video.micOn, video.camOn, video.camUsable, video.held, video.paused, video.failed)
    val version: StateFlow<Int> = video.tracksVersion
    video.connect("u", "t", "r"); video.setMic(true); video.setCam(false); video.setSpeaker(true); video.hold(true)
    video.background(); video.foreground(); video.pauseForIdle(); video.resumeFromPause(); video.forget(); video.close()
    val tour = Lessons(app, prefs)
    val enabled: Boolean? = tour.enabled
    val holding: Boolean = tour.holding
    tour.want("home"); tour.skip(); tour.screenChanged("table"); tour.reset(); tour.setEnabled(true)
    val newer: Boolean = newerRelease("1.0.0", "0.9.0")
    val m: Modifier = Modifier.guideAnchor("board").guideAnchor("roomName", true)
    Guided(tour) {}
    val live: Set<String> = rememberLiveVideo(video)
    val r = room.value
    if (r != null && "p" in live) VideoOrInitial(r, "p", true, "Ann", 16.sp)
    SeatScreen(r, "p", isMe = true, name = "Ann", width = 96.dp)
    println(listOf(flows, version, enabled, holding, newer, m))
}
