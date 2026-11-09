package app.ourapps.ourpoker.ui

import ae.controls.Panel
import ae.controls.RoundIconButton

import android.app.Activity
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Login
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Replay
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import app.ourapps.ourpoker.AppLanguage
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import app.ourapps.ourpoker.SoundName
import app.ourapps.ourpoker.Sound
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.ourapps.ourpoker.AppSettings
import app.ourapps.ourpoker.TableViewModel
import app.ourapps.ourpoker.UiState
import app.ourapps.ourpoker.net.RoomInfo
import app.ourapps.ourpoker.net.Status

// Home: the two rooms and who is in each; tap one to sit down or watch.
@Composable
fun HomeScreen(vm: TableViewModel, ui: UiState) {
    LaunchedEffect(Unit) { vm.checkForUpdate() }
    // The room list stays live while the home screen shows.
    DisposableEffect(Unit) {
        vm.watchRooms(true)
        onDispose { vm.watchRooms(false) }
    }
    val update = ui.update
    if (update != null && !ui.updateDismissed) {
        val ctx = LocalContext.current
        AlertDialog(
            onDismissRequest = vm::dismissUpdate,
            title = { Text(L("update_available", update.version)) },
            text = { Text(L("update_body", vm.currentVersion)) },
            confirmButton = {
                Button(onClick = {
                    val apk = update.android?.apkUrl ?: return@Button
                    ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(apk)))
                    vm.dismissUpdate()
                }) { Text(L("update_now")) }
            },
            dismissButton = { TextButton(onClick = vm::dismissUpdate) { Text(L("update_later")) } },
        )
    }
    Box(Modifier.fillMaxSize()) {
        PokerBackground(themeFor(ui.previewRoom))
        Column(
            Modifier.fillMaxSize().safeDrawingPadding().verticalScroll(rememberScrollState()).padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Spacer(Modifier.height(24.dp))
            RoomCards(ui.previewRoom) { Logo(70.dp) }
            Spacer(Modifier.height(8.dp))
            Text(L("app_name"), style = MaterialTheme.typography.displaySmall)
            Text(L("tagline"), style = MaterialTheme.typography.bodyMedium)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(L("playing_as", ui.name), style = MaterialTheme.typography.bodyMedium)
                IconButton(onClick = { Sound.play(SoundName.CLICK); vm.editName(true) }, modifier = Modifier.guideAnchor("editName")) {
                    Icon(Icons.Filled.Edit, contentDescription = L("change_name"), tint = MaterialTheme.colorScheme.primary)
                }
            }
            // Tap a room to select it (and preview its look); the button in the title bar enters it.
            Panel(Modifier.guideAnchor("rooms")) {
                val rooms = ui.rooms
                val selected = rooms?.let { all -> all.firstOrNull { it.id == ui.previewRoom } ?: all.firstOrNull() }
                Row(Modifier.fillMaxWidth().padding(bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(L("select_room"), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary, modifier = Modifier.weight(1f))
                    Spacer(Modifier.width(8.dp))
                    Box(Modifier.guideAnchor("roomJoin")) { EnterButton(selected, ui) { selected?.let { vm.join(it.id) } } }
                }
                if (rooms == null) {
                    Text(L(if (ui.roomsDown) "unreachable" else "looking"), style = MaterialTheme.typography.bodyMedium)
                } else {
                    for (r in rooms) {
                        RoomRow(r, selected = r.id == selected?.id, first = r.id == rooms.first().id) { if (ui.previewRoom != r.id) Sound.play(SoundName.CLICK); vm.preview(r.id) }
                        Spacer(Modifier.height(4.dp))
                    }
                    if (ui.roomsDown) Text(L("unreachable"), style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.6f))
                }
                // The server in use when it is not the live one (a test build).
                if (ui.roomsDown && AppSettings.SERVER_URL != "http://localhost:8788") Text(AppSettings.SERVER_URL, style = MaterialTheme.typography.labelSmall, color = Color.White.copy(alpha = 0.5f))
                errorText(ui.error?.code, ui.error?.message)?.let {
                    Spacer(Modifier.height(8.dp))
                    Text(it, color = MaterialTheme.colorScheme.error, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                LanguageMenu()
                Pill(Icons.Filled.Replay, L("reset_hints")) { Sound.play(SoundName.CLICK); vm.resetGuides() }
            }
            Text("${AppSettings.APPLICATION_NAME} ${vm.currentVersion}", style = MaterialTheme.typography.labelSmall, color = Color.White.copy(alpha = 0.5f))
        }
    }
}

@Composable
private fun RoomRow(r: RoomInfo, selected: Boolean, first: Boolean, onSelect: () -> Unit) {
    val inGame = r.status != Status.LOBBY && r.status != Status.UNKNOWN
    val names = r.names.joinToString(", ")
    val gold = MaterialTheme.colorScheme.primary
    val shape = RoundedCornerShape(12.dp)
    Column(
        Modifier.fillMaxWidth().guideAnchor("roomName", first).clip(shape)
            .background(if (selected) gold.copy(alpha = 0.12f) else Color.Transparent)
            .border(1.dp, if (selected) gold.copy(alpha = 0.45f) else Color.Transparent, shape)
            .clickable(onClick = onSelect).padding(horizontal = 10.dp, vertical = 6.dp),
    ) {
        Text(roomName(r.id), style = MaterialTheme.typography.titleMedium, color = if (selected) gold else Color.Unspecified)
        Text(
            when {
                r.playerCount == 0 -> L("room_empty")
                inGame -> L("room_in_game", names)
                else -> L("room_lobby", names)
            },
            style = MaterialTheme.typography.bodySmall, maxLines = 1,
        )
    }
}

// Enter the selected room: sit down, rejoin, or watch a game under way; a lock while it is full.
@Composable
private fun EnterButton(r: RoomInfo?, ui: UiState, onJoin: () -> Unit) {
    val inGame = r != null && r.status != Status.LOBBY && r.status != Status.UNKNOWN
    val seated = r != null && ui.name in r.names
    val full = r != null && r.playerCount >= 9 && !seated && !inGame
    val label = L(if (seated) "room_rejoin" else if (full) "room_full" else if (inGame) "room_watch" else "room_join")
    if (ui.busy) CircularProgressIndicator(Modifier.size(40.dp).padding(8.dp))
    else RoundIconButton(if (full) Icons.Filled.Lock else Icons.AutoMirrored.Filled.Login, label, enabled = r != null && !full, filled = true, onClick = onJoin)
}

// The language in use, opening the list of languages; a new one recreates the activity in it.
@Composable
private fun LanguageMenu() {
    val ctx = LocalContext.current
    val picked = remember { AppLanguage.picked(ctx) }
    var open by remember { mutableStateOf(false) }
    val label = L("language")
    Box {
        Pill(Icons.Filled.Language, AppLanguage.all.firstOrNull { it.first == AppLanguage.current(ctx) }?.second ?: "English", Modifier.semantics { contentDescription = label }) {
            Sound.play(SoundName.CLICK)
            open = true
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            for ((code, name) in listOf<Pair<String?, String>>(null to L("lang_device")) + AppLanguage.all) {
                DropdownMenuItem(
                    text = { Text(name) },
                    trailingIcon = { if (code == picked) Icon(Icons.Filled.Check, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
                    onClick = {
                        open = false
                        Sound.play(SoundName.CLICK)
                        if (code != picked) {
                            AppLanguage.pick(ctx, code)
                            (ctx as? Activity)?.recreate()
                        }
                    },
                )
            }
        }
    }
}

@Composable
private fun Pill(icon: ImageVector, text: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Row(
        modifier.clip(CircleShape).background(Color.Black.copy(alpha = 0.45f)).border(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.35f), CircleShape)
            .clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
        Text(text, style = MaterialTheme.typography.bodyMedium, color = Color.White)
    }
}
