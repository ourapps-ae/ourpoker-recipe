package app.ourapps.ourpoker.ui

import ae.controls.Panel

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.ourapps.ourpoker.TableViewModel
import app.ourapps.ourpoker.net.View

// Lobby: everyone's camera in a row, with microphone and camera toggles.
@Composable
fun VideoPanel(vm: TableViewModel, view: View) {
    val room by vm.video.room.collectAsState()
    Panel(title = L("video_title")) {
        if (room == null) {
            Text(L("video_unavailable"), style = MaterialTheme.typography.bodySmall)
        } else {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                val live = rememberLiveVideo(vm.video)
                for (p in view.players.filter { it.id in live }) {
                    SeatScreen(room, p.id, isMe = p.id == view.you, name = p.name, width = 96.dp)
                }
            }
            Spacer(Modifier.height(8.dp))
            MediaToggles(vm)
        }
    }
}
