package app.ourapps.ourpoker

import app.ourapps.ourpoker.net.View
import app.ourapps.ourpoker.net.json
import app.ourapps.ourpoker.ui.ChallengeLayout
import app.ourapps.ourpoker.ui.Showdown
import app.ourapps.ourpoker.ui.Spots
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

// The server's fixtures: every one decodes, and in the crowded showdowns (five and six hands
// shown) no two rows, nor a row and the board or the winning cards, overlap on a 6.1 and a 6.9
// inch phone. The smallest phones cannot fit that many rows apart.
class FixturesTest {
    // Unit tests run from the module directory (android/app).
    private val dir = File("../../server/fixtures")

    private fun fixture(name: String): View = json.decodeFromString(View.serializer(), File(dir, "$name.json").readText())

    @Test
    fun decodesEveryFixture() {
        val files = dir.listFiles { f -> f.extension == "json" }.orEmpty()
        assertTrue("no fixtures in ${dir.absolutePath}", files.isNotEmpty())
        for (f in files) json.decodeFromString(View.serializer(), f.readText())
    }

    private data class Box(val l: Float, val t: Float, val r: Float, val b: Float)

    private fun hits(a: Box, b: Box) = a.l < b.r - 4 && b.l < a.r - 4 && a.t < b.b - 4 && b.t < a.b - 4

    @Test
    fun crowdedShowdownsDoNotOverlap() {
        for (name in listOf("showdownFive", "showdownSeven")) {
            val view = fixture(name)
            val sd = Showdown.of(view)
            assertNotNull(name, sd)
            sd!!
            val n = maxOf(2, view.players.size)
            for (w in listOf(378f, 416f)) {
                val h = w * 1.3f
                val spots = ChallengeLayout.place(sd, view, n, w, h)
                val rows = sd.players.mapNotNull { p ->
                    val (combo, unused) = ChallengeLayout.parts(p, sd.isWinner(p.id))
                    if (combo.isEmpty() && unused.isEmpty()) return@mapNotNull null
                    val s = spots[p.id]
                    assertNotNull("$name w=$w ${p.name}", s)
                    Box(s!!.x - s.width / 2, s.y - s.height / 2, s.x + s.width / 2, s.y + s.height / 2)
                }
                val board = Box(w / 2 - 108, h / 2 - 28, w / 2 + 108, h / 2 + 35)
                val rowWidth = 5 * sd.cardWidth + 4 * Showdown.GAP + Showdown.KICKER_GAP
                val top = h * Spots.POT.y - sd.top
                val showcase = Box(w * Spots.POT.x - rowWidth / 2 - 72, top, w * Spots.POT.x + rowWidth / 2, top + sd.winners.size * sd.rowHeight + 21)
                rows.forEachIndexed { i, a ->
                    assertFalse("$name w=$w: row $i on the board", hits(a, board))
                    assertFalse("$name w=$w: row $i on the winning cards", hits(a, showcase))
                    for (b in rows.drop(i + 1)) assertFalse("$name w=$w: rows overlap", hits(a, b))
                }
            }
        }
    }
}
