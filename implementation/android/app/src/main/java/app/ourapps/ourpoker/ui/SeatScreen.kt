package app.ourapps.ourpoker.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.livekit.android.compose.state.rememberParticipantTrackReferences
import io.livekit.android.compose.state.rememberParticipants
import ae.video.VideoSession
import io.livekit.android.compose.ui.VideoTrackView
import io.livekit.android.room.Room
import io.livekit.android.room.participant.Participant
import io.livekit.android.room.track.Track

// GAP: G9.5 video-calls has the session (ae.video.VideoSession) but no seat video tile; this one is drawn here.

// A small monitor showing a player's camera, framed like a screen standing by their seat.
@Composable
fun SeatScreen(room: Room?, playerId: String, isMe: Boolean, name: String, width: Dp, height: Dp = width * 0.75f, modifier: Modifier = Modifier, onTap: (() -> Unit)? = null) {
    val shape = RoundedCornerShape(6.dp)
    Box(
        modifier.size(width, height).clip(shape).background(Color(0xFF101010)).border(2.dp, Color(0xFF3A3A3A), shape)
            .then(if (onTap != null) Modifier.clickable(onClick = onTap) else Modifier),
        contentAlignment = Alignment.Center,
    ) {
        VideoOrInitial(room, playerId, isMe, name, 15.sp)
    }
}

// Player ids whose camera picture is arriving right now (yours while your camera is on).
@Composable
fun rememberLiveVideo(video: VideoSession): Set<String> {
    val room by video.room.collectAsState()
    val camOn by video.camOn.collectAsState()
    val held by video.held.collectAsState()
    val version by video.tracksVersion.collectAsState()
    val r = room ?: return emptySet()
    return remember(r, camOn, held, version) { liveVideo(r, camOn && !held) }
}

// Read straight from the room, so a screen opened while a camera is already live sees it at once.
private fun liveVideo(room: Room, camOn: Boolean): Set<String> {
    val ids = mutableSetOf<String>()
    for (p in room.remoteParticipants.values) {
        val pub = p.getTrackPublication(Track.Source.CAMERA) ?: continue
        if (pub.subscribed && !pub.muted && pub.track != null) p.identity?.value?.let(ids::add)
    }
    val me = room.localParticipant
    val mine = me.getTrackPublication(Track.Source.CAMERA)
    if (camOn && mine != null && !mine.muted && mine.track != null) me.identity?.value?.let(ids::add)
    return ids
}

// The camera, or the player's initial; fills whatever box it is placed in.
@Composable
fun VideoOrInitial(room: Room?, playerId: String, isMe: Boolean, name: String, initialSize: TextUnit = 48.sp) {
    if (room != null) {
        // Uses the session's room directly; only the session connects and disconnects it.
        // Observed, so a player whose video connects after this is drawn appears.
        val participants by rememberParticipants(passedRoom = room)
        val participant: Participant? = if (isMe) room.localParticipant else participants.firstOrNull { it.identity?.value == playerId && it !== room.localParticipant }
        val ref = if (participant != null) {
            val refs by rememberParticipantTrackReferences(sources = listOf(Track.Source.CAMERA), passedParticipant = participant)
            refs.firstOrNull()
        } else null
        if (ref != null) VideoTrackView(trackReference = ref, room = room, mirror = isMe, modifier = Modifier.fillMaxSize())
        else Text(name.take(1), color = Color(0xFF666666), fontSize = initialSize)
    } else {
        Text(name.take(1), color = Color(0xFF666666), fontSize = initialSize)
    }
}
