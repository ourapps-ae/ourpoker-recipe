package app.ourapps.ourpoker.ui

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp
import app.ourapps.ourpoker.Video
import app.ourapps.ourpoker.VideoRoom

// Installed in place of the seat video tile when the design leaves out video-calls: there is never a room or a picture.
@Suppress("UNUSED_PARAMETER")
@Composable
fun SeatScreen(room: VideoRoom?, playerId: String, isMe: Boolean, name: String, width: Dp, height: Dp = width * 0.75f, modifier: Modifier = Modifier, onTap: (() -> Unit)? = null) {}

@Suppress("UNUSED_PARAMETER")
@Composable
fun rememberLiveVideo(video: Video): Set<String> = emptySet()

@Suppress("UNUSED_PARAMETER")
@Composable
fun VideoOrInitial(room: VideoRoom?, playerId: String, isMe: Boolean, name: String, initialSize: TextUnit = 48.sp) {
    Text(name.take(1), color = Color(0xFF666666), fontSize = initialSize)
}
