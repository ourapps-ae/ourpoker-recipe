package app.ourapps.ourpoker.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.VolumeOff
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.filled.VideocamOff
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.FilledTonalIconToggleButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.IconToggleButtonColors
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.ourapps.ourpoker.TableViewModel

// GAP: G9.4 video-calls has the session but no toggle strip; these are drawn here with the controls component's icons.

@Composable
private fun toggleColours(): IconToggleButtonColors = IconButtonDefaults.filledTonalIconToggleButtonColors(
    checkedContainerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.25f),
    checkedContentColor = MaterialTheme.colorScheme.primary,
    containerColor = Color(0xFF5A2A2A),
    contentColor = Color.White,
)

// Microphone and camera toggles with the usual icons: filled when on, struck through when off.
// A camera this phone cannot use shows struck through and does nothing.
@Composable
fun MediaToggles(vm: TableViewModel, modifier: Modifier = Modifier, spacing: Dp = 12.dp) {
    val micOn by vm.video.micOn.collectAsState()
    val camOn by vm.video.camOn.collectAsState()
    val camUsable by vm.video.camUsable.collectAsState()
    val colours = toggleColours()
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(spacing)) {
        FilledTonalIconToggleButton(checked = micOn, onCheckedChange = { vm.video.setMic(it) }, colors = colours) {
            Icon(if (micOn) Icons.Filled.Mic else Icons.Filled.MicOff, contentDescription = L(if (micOn) "mic_on" else "mic_off"))
        }
        FilledTonalIconToggleButton(checked = camOn && camUsable, onCheckedChange = { vm.video.setCam(it) }, enabled = camUsable, colors = colours) {
            Icon(if (camOn && camUsable) Icons.Filled.Videocam else Icons.Filled.VideocamOff, contentDescription = L(if (!camUsable) "camera_unavailable" else if (camOn) "cam_on" else "cam_off"))
        }
    }
}

// Sounds on or off: the game's sounds and other players' voices. Works with or without video.
@Composable
fun SoundToggle(vm: TableViewModel, modifier: Modifier = Modifier) {
    val on by vm.sound.on.collectAsState()
    FilledTonalIconToggleButton(checked = on, onCheckedChange = { vm.setSound(it) }, colors = toggleColours(), modifier = modifier) {
        Icon(if (on) Icons.AutoMirrored.Filled.VolumeUp else Icons.AutoMirrored.Filled.VolumeOff, contentDescription = L(if (on) "sound_on" else "sound_off"))
    }
}

// The table header's microphone and camera: the toggles while in the video room; a reconnect
// button when the room was cut or could not be joined; struck through until the person turns video on (asking for the camera).
// Nothing for a seat without video.
@Composable
fun HeaderMedia(vm: TableViewModel, spacing: Dp) {
    val hasVideo by vm.hasVideo.collectAsState()
    val permitted by vm.permitted.collectAsState()
    val room by vm.video.room.collectAsState()
    if (!hasVideo) return
    if (!permitted) {
        // Video is off until the person turns it on: either toggle asks for the camera and microphone.
        Row(horizontalArrangement = Arrangement.spacedBy(spacing)) {
            FilledTonalIconToggleButton(checked = false, onCheckedChange = { vm.askForMedia() }, colors = toggleColours()) { Icon(Icons.Filled.MicOff, contentDescription = L("mic_off")) }
            FilledTonalIconToggleButton(checked = false, onCheckedChange = { vm.askForMedia() }, colors = toggleColours()) { Icon(Icons.Filled.VideocamOff, contentDescription = L("cam_off")) }
        }
    } else if (room != null) {
        MediaToggles(vm, spacing = spacing)
    } else {
        FilledTonalIconButton(onClick = vm::resumeVideo) { Icon(Icons.Filled.Refresh, contentDescription = L("video_reconnect")) }
    }
}
