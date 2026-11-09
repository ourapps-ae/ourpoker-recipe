package app.ourapps.ourpoker.ui

import ae.cards.PlayingCard
import ae.controls.BadgedIcon
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.SmartToy
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

// The legend's line under a card: green for a card in a hand, gold for a community card or place.
@Composable
fun LegendLine(colour: Color, width: Dp, modifier: Modifier = Modifier) {
    val h = maxOf(4.dp, width * 0.07f)
    Box(modifier.size(width, h).clip(RoundedCornerShape(h / 2)).background(colour))
}

// The app mark: an ace of spades and a tilted king of hearts.
@Composable
fun Logo(width: Dp = 44.dp) {
    Row {
        PlayingCard("As", width)
        PlayingCard("Kh", width, modifier = Modifier.offset((-width * 0.25f), width * 0.14f).rotate(12f))
    }
}

// The computer-player icon with a small plus in the corner.
@Composable
fun AddBotIcon(tint: Color) = BadgedIcon(Icons.Filled.SmartToy, Icons.Filled.Add, tint)
