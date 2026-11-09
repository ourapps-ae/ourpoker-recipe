package app.ourapps.ourpoker.ui

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
import androidx.compose.material.icons.filled.SmartToy
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import ae.cards.PlayingCard
import ae.controls.BackIcon
import ae.controls.Panel
import ae.controls.PromptBanner
import ae.controls.RoundIconButton
import ae.tournament.ResultPlayer
import ae.tournament.headingKey
import ae.tournament.resultRows
import app.ourapps.ourpoker.TableViewModel
import app.ourapps.ourpoker.UiState
import app.ourapps.ourpoker.net.Status
import app.ourapps.ourpoker.net.View

// Final standings after a completed or cancelled tournament.
@Composable
fun EndScreen(vm: TableViewModel, ui: UiState, view: View) {
    // The rows come from the tournament component; the cards each player showed come from the view.
    val rows = resultRows(view.players.map { ResultPlayer(it.id, it.name, it.place, it.isBot, it.rebuysUsed, it.stack) }, view.you)
    val byId = view.players.associateBy { it.id }
    Box(Modifier.fillMaxSize()) {
        PokerBackground(themeFor(view.roomId))
        Column(Modifier.fillMaxSize().safeDrawingPadding().verticalScroll(rememberScrollState()).padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(roomName(view.roomId), style = MaterialTheme.typography.headlineMedium, modifier = Modifier.padding(horizontal = 4.dp))
            PromptBanner(promptText(view))
            ShowCardsButton(vm, ui, view)
            Panel {
                Row(Modifier.fillMaxWidth().padding(bottom = 8.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    RoundIconButton(null, L("leave"), enabled = !ui.busy, filled = false, onClick = vm::leave) { BackIcon(it) }
                    if (view.legal.newGame) RoundIconButton(Icons.AutoMirrored.Filled.Login, L("new_game"), enabled = !ui.busy, filled = true, glow = true, onClick = vm::newGame)
                }
                Text(L(headingKey(if (view.status == Status.CANCELLED) "cancelled" else "completed")), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.height(8.dp))
                if (view.status == Status.CANCELLED) Text(L("cancelled_body"), style = MaterialTheme.typography.bodySmall)
                for (r in rows) {
                    val p = byId.getValue(r.id)
                    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        SeatNumber(r.place ?: 0)
                        Spacer(Modifier.width(12.dp))
                        Text(r.name + if (r.isYou) " " + L("you_suffix") else "", Modifier.weight(1f))
                        for ((i, card) in p.cards.withIndex()) {
                            if (card != null && (!r.isYou || i !in view.legal.show)) PlayingCard(card, 32.dp)
                        }
                        // The robot before the amount, so the amounts line up on the right.
                        if (r.isComputer) Icon(Icons.Filled.SmartToy, contentDescription = null, tint = Color.White.copy(alpha = 0.6f), modifier = Modifier.size(20.dp).padding(end = 4.dp))
                        if (r.showStack) Text(chips(r.stack), style = MaterialTheme.typography.bodySmall)
                        else if (r.rebought) Text(L("rebought"), style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
            errorText(ui.error?.code, ui.error?.message)?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(horizontal = 8.dp)) }
        }
    }
}
