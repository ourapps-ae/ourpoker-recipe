package app.ourapps.ourpoker.ui

import ae.tour.Tour
import ae.tour.TourButtons
import ae.tour.TourHost
import ae.tour.tourAnchor
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.ui.unit.dp
import app.ourapps.ourpoker.net.Status
import app.ourapps.ourpoker.net.View

// What the lessons are asked for. The lessons themselves are data (locales/lessons.json) run by the
// guided-tour component; this names them and says which moment of the game asks for which.
enum class GuideId(val screen: String? = null) {
    HOME("home"), LOBBY("lobby"), BOTS("lobby"), TABLE, BLINDS, CALL, BET, POT, FLOP, TURN, RIVER;

    val key: String get() = name.lowercase()

    companion object {
        // Guides for the table, and for each thing the first time it happens.
        fun forTable(view: View): List<GuideId> {
            if (view.display || view.status != Status.RUNNING) return emptyList()
            val out = mutableListOf(TABLE)
            val hand = view.hand ?: return out
            if (hand.event == "deal") out += BLINDS
            val kind = if (hand.event == "action") view.player(hand.lastActorId)?.lastAction?.kind else null
            if (kind == "call") out += CALL
            if (kind == "bet" || kind == "raise" || kind == "allIn") out += BET
            if (hand.pots.any { it.amount > 0 }) out += POT
            when (hand.board.size) { 3 -> out += FLOP; 4 -> out += TURN; 5 -> out += RIVER }
            return out
        }
    }
}

// Marks an element a lesson step can ring.
fun Modifier.guideAnchor(name: String, on: Boolean = true): Modifier = tourAnchor(name, on)

// The lesson on show, over the content, with the buttons in the phone's language.
@Composable
fun Guided(tour: Tour, content: @Composable () -> Unit) {
    TourHost(tour, TourButtons(next = L("guide_next"), skip = L("guide_skip"), done = L("got_it")), content)
}

// Two dots side by side: a double tap.
@Composable
fun DoubleTapDots(size: Int = 4, colour: Color) {
    Row(horizontalArrangement = Arrangement.spacedBy((size / 2).dp)) {
        Box(Modifier.size(size.dp).clip(CircleShape).background(colour))
        Box(Modifier.size(size.dp).clip(CircleShape).background(colour))
    }
}
