package app.ourapps.ourpoker.ui

import ae.cards.CardStyle
import ae.cards.LocalCardStyle
import ae.theme.BackgroundScene
import ae.theme.SceneFront
import ae.theme.ThemeBackground
import ae.theme.ThemeSet
import androidx.compose.foundation.Image
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.imageResource
import androidx.compose.ui.res.painterResource

// One look per room: a theme from the theme component and a scene picture behind it
// (scene_<room>_back) with figures in front (scene_<room>_front). The art is this application's
// (res/drawable-nodpi, from assets/art); the drawing is the theme's.
class RoomLook(val id: String, val theme: ThemeSet, val anchor: Float, val fronts: List<SceneFront>) {
    val felt: Color get() = Color(theme.colour.table)
}

private val LOOKS = mapOf(
    "casino" to RoomLook("casino", ThemeSet.named("night"), 0.5f, listOf(SceneFront("br", 0.68f, 1f))),
    "home" to RoomLook("home", ThemeSet.named("lounge"), 1f, listOf(SceneFront("br", 0.6f, 1f))),
)

fun themeFor(roomId: String?): RoomLook = LOOKS[roomId] ?: LOOKS.getValue("casino")

private fun sceneImage(ctx: android.content.Context, name: String): ImageBitmap? {
    val id = ctx.resources.getIdentifier(name, "drawable", ctx.packageName)
    return if (id == 0) null else ImageBitmap.imageResource(ctx.resources, id)
}

// Figures are for the home, lobby and standings screens; the table shows only the picture behind.
@Composable
fun PokerBackground(look: RoomLook = themeFor(null), figures: Boolean = true, modifier: Modifier = Modifier) {
    val ctx = LocalContext.current
    val scene = remember(look.id) {
        BackgroundScene(back = sceneImage(ctx, "scene_${look.id}_back"), front = sceneImage(ctx, "scene_${look.id}_front"), anchor = look.anchor, fronts = look.fronts)
    }
    ThemeBackground(look.theme, scene, figures, modifier)
}

// Cards below this look for the room's card back and court pictures (card_back_<room>, card_<room>_jack).
@Composable
fun RoomCards(roomId: String, content: @Composable () -> Unit) {
    val ctx = LocalContext.current
    val style = remember(roomId) {
        CardStyle(
            colours = ThemeSet.named("night"),
            artTheme = roomId,
            hasArt = { file -> ctx.resources.getIdentifier(file.removeSuffix(".png").replace('-', '_'), "drawable", ctx.packageName) != 0 },
            painter = { file -> painterResource(ctx.resources.getIdentifier(file.removeSuffix(".png").replace('-', '_'), "drawable", ctx.packageName)) },
            rankLabel = { rank -> if (rank in "TJQKA") ctx.text("rank_$rank") else rank.toString() },
        )
    }
    CompositionLocalProvider(LocalCardStyle provides style, content = content)
}
