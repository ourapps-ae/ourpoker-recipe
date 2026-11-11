package app.ourapps.ourpoker.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.SmartToy
import androidx.compose.material.icons.outlined.RemoveCircleOutline
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import ae.controls.BackIcon
import ae.controls.Panel
import ae.controls.PromptBanner
import ae.controls.RoundIconButton
import ae.seating.Removable
import ae.seating.SeatPlayer
import ae.seating.seatRows
import app.ourapps.ourpoker.TableViewModel
import app.ourapps.ourpoker.UiState
import app.ourapps.ourpoker.net.View

@Composable
fun LobbyScreen(vm: TableViewModel, ui: UiState, view: View) {
    val me = view.me
    Box(Modifier.fillMaxSize()) {
        PokerBackground(themeFor(view.roomId))
        Column(
            Modifier.fillMaxSize().safeDrawingPadding().verticalScroll(rememberScrollState()).padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            // Sounds on or off at the top, clear of the how-to-play bulb in the corner.
            Row(Modifier.fillMaxWidth().padding(start = 4.dp, end = 52.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text(roomName(view.roomId), style = MaterialTheme.typography.headlineMedium)
                SoundToggle(vm)
            }
            PromptBanner(promptText(view))
            Panel {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    if (view.legal.leave) {
                        Box(Modifier.guideAnchor("leave")) { RoundIconButton(null, L("leave"), enabled = !ui.busy, filled = false, onClick = vm::leave) { BackIcon(it) } }
                        Spacer(Modifier.width(6.dp))
                    }
                    if (view.legal.addBot) Box(Modifier.guideAnchor("addBot")) { RoundIconButton(null, L("add_computer"), enabled = !ui.busy, filled = false, onClick = vm::addBot) { AddBotIcon(it) } }
                    Spacer(Modifier.weight(1f))
                    if (me != null && !me.isBot) {
                        Box(Modifier.guideAnchor("start")) { RoundIconButton(Icons.Filled.PlayArrow, if (view.legal.start) L("start_game") else promptText(view), enabled = view.legal.start && !ui.busy, filled = true, glow = true, onClick = vm::start) }
                    }
                }
                Spacer(Modifier.height(8.dp))
                // The rows come from the seating component: seat order, who is you, which computer player is first.
                val rows = seatRows(view.players.map { SeatPlayer(it.id, it.name, it.seat, it.isBot) }, view.you, if (view.legal.kick) Removable.COMPUTERS else Removable.NONE)
                Column(Modifier.guideAnchor("players")) { for (r in rows) {
                    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        SeatNumber(r.seatNumber)
                        Spacer(Modifier.width(12.dp))
                        Text(r.name + if (r.isYou) " " + L("you_suffix") else "", Modifier.weight(1f))
                        if (r.isComputer) Icon(Icons.Filled.SmartToy, contentDescription = L("computer"), tint = Color.White.copy(alpha = 0.6f), modifier = Modifier.size(20.dp).guideAnchor("botMark", r.firstComputer))
                        if (r.canRemove) {
                            IconButton(onClick = { vm.kick(r.id) }, enabled = !ui.busy, modifier = Modifier.guideAnchor("botRemove", r.firstComputer)) {
                                Icon(Icons.Outlined.RemoveCircleOutline, contentDescription = L("remove"), tint = MaterialTheme.colorScheme.primary)
                            }
                        }
                    }
                } }
            }
            // Only in the video room; a camera this phone cannot use still leaves the microphone.
            val room by vm.video.room.collectAsState()
            if (room != null) VideoPanel(vm, view)
            errorText(ui.error?.code, ui.error?.message)?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(horizontal = 8.dp)) }
        }
    }
}

@Composable
fun SeatNumber(n: Int) {
    Box(Modifier.size(28.dp).background(MaterialTheme.colorScheme.primary.copy(alpha = 0.2f), CircleShape), contentAlignment = Alignment.Center) {
        Text(n.toString(), color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelMedium)
    }
}
