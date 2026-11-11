package app.ourapps.ourpoker

import ae.androidhost.ShellActivity
import ae.androidhost.ShellLanguage
import ae.androidhost.ShellPalette
import ae.controls.ControlsTheme
import ae.controls.HelpBulb
import ae.theme.ThemeSet
import android.Manifest
import androidx.activity.viewModels
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.ourapps.ourpoker.net.Status
import app.ourapps.ourpoker.ui.EndScreen
import app.ourapps.ourpoker.ui.GuideId
import app.ourapps.ourpoker.ui.Guided
import app.ourapps.ourpoker.ui.HelpScreen
import app.ourapps.ourpoker.ui.HomeScreen
import app.ourapps.ourpoker.ui.L
import app.ourapps.ourpoker.ui.LobbyScreen
import app.ourapps.ourpoker.ui.NameScreen
import app.ourapps.ourpoker.ui.TableScreen
import app.ourapps.ourpoker.ui.soloGame

// The one activity: the android-host shell supplies the window, palette, language and permissions;
// this class names them and shows the screen flow.
class MainActivity : ShellActivity() {
    private val vm: TableViewModel by viewModels()

    override val permissions = listOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO)
    override val language: ShellLanguage = AppLanguage.shell
    override val palette: ShellPalette = appTheme.colour.let { ShellPalette(it.primary, 0xFF9FB3C8, it.background, it.surface, it.onPrimary) }

    override fun onShellCreated() { Sound.init(applicationContext) }

    @Composable
    override fun Content() {
        ControlsTheme(appTheme) { Root(vm) }
    }

    override fun onPermissionsChecked(allGranted: Boolean, result: Map<String, Boolean>) {
        vm.permissionsGranted = result[Manifest.permission.CAMERA] == true
    }

    override fun onShellResumed() = vm.resumed()
    override fun onShellPaused() = vm.paused()
}

// The theme every screen draws with; the room's look is the background's.
// The design's look (the `look` answer): a theme of the theme component.
val appTheme: ThemeSet = ThemeSet.named(AppSettings.LOOK)

@Composable
fun Root(vm: TableViewModel) {
    val ui by vm.state.collectAsStateWithLifecycle()
    val view = ui.view
    // Camera and microphone stay off through a game with only computer players.
    val solo = ui.token != null && view != null && view.soloGame()
    LaunchedEffect(solo) { vm.video.hold(solo) }
    val atTable = !ui.help && !(ui.name.isEmpty() || ui.editingName) && ui.token != null && view != null && view.status == Status.RUNNING
    Guided(vm.tour) { Box(Modifier.fillMaxSize()) {
        when {
            ui.help -> HelpScreen(onClose = { vm.showHelp(false) })
            ui.name.isEmpty() || ui.editingName -> NameScreen(vm, ui)
            ui.token == null || view == null -> HomeScreen(vm, ui)
            view.status == Status.LOBBY -> LobbyScreen(vm, ui, view)
            view.status == Status.RUNNING -> TableScreen(vm, ui, view)
            else -> EndScreen(vm, ui, view)
        }
        // How to play: the table keeps it in its header; every other screen has it in this corner.
        if (!ui.help && !atTable) {
            HelpBulb(L("how_to_play"), onClick = { Sound.play(SoundName.CLICK); vm.showHelp(true) }, modifier = Modifier.align(Alignment.TopEnd).safeDrawingPadding().padding(top = 6.dp, end = 6.dp))
        }
        // Guides for the screen showing, the first time it shows; the home and lobby ones here, the
        // table's as things happen there.
        val screen = when {
            ui.help || ui.name.isEmpty() || ui.editingName -> "other"
            ui.token == null || view == null -> "home"
            view.status == Status.LOBBY -> "lobby"
            view.status == Status.RUNNING -> "table"
            else -> "other"
        }
        val hasBots = view?.players?.any { it.isBot } == true
        LaunchedEffect(screen, ui.rooms != null, hasBots) {
            vm.onScreen(screen)
            if (screen == "home" && ui.rooms != null) vm.want(GuideId.HOME)
            if (screen == "lobby") { vm.want(GuideId.LOBBY); if (hasBots) vm.want(GuideId.BOTS) }
        }
        if (ui.beginner == null) {
            androidx.compose.material3.AlertDialog(
                onDismissRequest = {},
                title = { androidx.compose.material3.Text(L("beginner_title")) },
                confirmButton = { androidx.compose.material3.TextButton(onClick = { vm.chooseBeginner(true) }) { androidx.compose.material3.Text(L("beginner_yes")) } },
                dismissButton = { androidx.compose.material3.TextButton(onClick = { vm.chooseBeginner(false) }) { androidx.compose.material3.Text(L("beginner_no")) } },
            )
        }
    } }
}
