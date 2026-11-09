package app.ourapps.ourpoker.ui

import ae.controls.HelpPage
import ae.controls.HelpSection
import androidx.compose.runtime.Composable

// Rules text lives in strings.xml (generated from locales/strings.json); the server enforces them.
val HELP_SECTIONS = listOf(
    "help_idea_t" to "help_idea",
    "help_join_t" to "help_join",
    "help_play_t" to "help_play",
    "help_rebuy_t" to "help_rebuy",
    "help_pause_t" to "help_pause",
    "help_video_t" to "help_video",
)

@Composable
fun HelpScreen(onClose: () -> Unit) {
    HelpPage(L("how_to_play"), HELP_SECTIONS.map { (title, body) -> HelpSection(L(title), L(body)) }, L("done"), onClose, footer = L("help_footer"))
}
