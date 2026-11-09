package app.ourapps.ourpoker.ui

import ae.cards.PlayingCard
import ae.chips.ChipPile
import ae.controls.formatCount
import ae.tablelayout.SeatSpot
import ae.tablelayout.TableGeometry
import ae.tablelayout.TableLayout
import ae.tablelayout.TableOrientation
import ae.tablelayout.TablePoint
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameMillis
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.ourapps.ourpoker.net.OddsCard
import app.ourapps.ourpoker.net.Phase
import app.ourapps.ourpoker.net.PlayerView
import app.ourapps.ourpoker.net.View
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin
import kotlinx.coroutines.delay

// Poker-specific table motion and layout: the showdown, where shown hands go, and the flights of chips and cards.
// Seat spots come from the table-layout component, cards and chips from card-graphics and chip-graphics.
// Table geometry in fractions of the table box, from the table-layout component's portrait layout
// for the number of seats. Seat k is counted clockwise from yours at the bottom.
object Spots {
    private fun layout(n: Int): TableLayout = TableGeometry.tableLayout(maxOf(2, n).coerceAtMost(TableGeometry.MAX_SEATS), TableOrientation.PORTRAIT)
    private fun offset(p: TablePoint) = Offset(p.x.toFloat(), p.y.toFloat())
    private fun spot(k: Int, n: Int): SeatSpot? = layout(n).seatSpots.getOrNull(k)

    val POT: Offset get() = offset(layout(2).pot)
    val DECK: Offset get() = offset(layout(2).deck)
    val BURN: Offset get() = offset(layout(2).burn)

    fun angle(k: Int, n: Int) = TableGeometry.seatAngle(k, n).toFloat()
    fun seat(k: Int, n: Int): Offset = spot(k, n)?.let { Offset(it.x.toFloat(), it.y.toFloat()) } ?: Offset(0.5f, 0.7f)
    fun cards(k: Int, n: Int) = spot(k, n)?.let { offset(it.cards) } ?: Offset(0.5f, 0.7f)
    fun shown(k: Int, n: Int) = spot(k, n)?.let { offset(it.shown) } ?: Offset(0.5f, 0.7f)
    fun bet(k: Int, n: Int) = spot(k, n)?.let { offset(it.bet) } ?: Offset(0.5f, 0.7f)
    fun tableCard(n: Int, faceUp: Boolean): Int = TableGeometry.tableCardWidth(n, faceUp).toInt()
    fun board(i: Int): Offset = layout(2).board.getOrNull(i)?.let { offset(it) } ?: Offset(0.5f, 0.5f)
    // A point on the ring of seats at any angle, for the light gliding between them.
    fun ring(a: Float): Offset = offset(TableGeometry.ringPoint(a.toDouble()))
    fun seatIndex(p: PlayerView, view: View): Int = TableGeometry.relativeSeat(p.seat, view.me?.seat ?: 0, view.players.size)
}

// Things in motion between two spots: a pile of chips or a face-down card. Destinations stay
// hidden until the flight lands.
// code: a face-up card of `size` dp; dx and dy shift the destination by that many dp.
data class Flight(val id: Long, val from: Offset, val to: Offset, val delayMs: Int, val durationMs: Int, val lands: String, val amount: Int = 0, val card: Boolean = false, val pair: Boolean = false, val allIn: Boolean = false, val text: String? = null, val code: String? = null, val dx: Float = 0f, val dy: Float = 0f, val size: Float = 40f)

// A hand that ended in a showdown: how the main pot was won ("combination", "kicker" or "draw"),
// its winners and every hand that was shown.
// won: what each winner took, all pots together.
data class Showdown(val kind: String, val winners: List<PlayerView>, val players: List<PlayerView>, val won: Map<String, Int> = emptyMap()) {
    fun isWinner(id: String) = winners.any { it.id == id }

    // The showcase over the pot ring: one row per winner; a draw has smaller cards, a title and
    // each winner's name left of the row. Its top sits `top` above the pot's centre; a third row
    // on grows it upward, clear of your seat.
    val cardWidth: Float get() = if (winners.size > 2) 22f else if (winners.size > 1) 26f else 34f
    val cardHeight: Float get() = cardWidth * 1.4f
    // Community cards sit a fifth of a card higher than the hand's own, toward the board they came from.
    val raise: Float get() = cardHeight * 0.2f
    val titleHeight: Float get() = if (kind == "draw") 18f else 0f
    val rowHeight: Float get() = raise + cardHeight + 10f
    val top: Float get() = 27f + maxOf(0, winners.size - 2) * rowHeight
    // Row r's card centres, from the pot's centre.
    fun cardDy(r: Int, board: Boolean) = -top + titleHeight + r * rowHeight + (if (board) 0f else raise) + cardHeight / 2

    companion object {
        const val GAP = 4f
        const val KICKER_GAP = 10f

        fun of(view: View): Showdown? {
            val hand = view.hand ?: return null
            val r = view.lastResult ?: return null
            if (view.phase != Phase.HAND_OVER || r.uncontested || r.voided || r.no != hand.no) return null
            val players = view.players.filter { it.inHand && !it.folded && !it.hand?.best.isNullOrEmpty() }
            val ids = r.showdown?.winners ?: listOfNotNull(r.pots.firstOrNull()?.winners?.firstOrNull()?.playerId)
            val winners = ids.mapNotNull { id -> players.firstOrNull { it.id == id } }
            if (players.size < 2 || winners.isEmpty()) return null
            return Showdown(r.showdown?.kind ?: "combination", winners, players, wonBy(view))
        }

        fun wonBy(view: View): Map<String, Int> {
            val out = mutableMapOf<String, Int>()
            for (pot in view.lastResult?.pots.orEmpty()) for (w in pot.winners) out[w.playerId] = (out[w.playerId] ?: 0) + w.amount
            return out
        }

        // Won with no cards shown: everyone else folded.
        fun uncontested(view: View): Boolean {
            val hand = view.hand ?: return false
            val r = view.lastResult ?: return false
            return view.phase == Phase.HAND_OVER && r.uncontested && !r.voided && r.no == hand.no
        }

        // Each card's offset from its row's centre: the combination, then a wider gap before the kickers.
        fun offsets(best: List<OddsCard>, size: Float): List<Float> {
            val xs = mutableListOf<Float>()
            var x = 0f
            best.forEachIndexed { i, c ->
                if (i > 0) x += size + GAP + (if (c.spare && !best[i - 1].spare) KICKER_GAP else 0f)
                xs.add(x)
            }
            val width = (xs.lastOrNull() ?: 0f) + size
            return xs.map { it + size / 2 - width / 2 }
        }
    }
}

// Where each shown hand goes at a showdown, in dp of the table box. Every row takes the free spot
// nearest its usual place (above or below its seat; yours above your seat), clear of the board,
// the winning hands, the seats of everyone in the showdown (its own too) and the rows already
// placed; a folded player's seat counts against a spot but does not rule it out. A row that has
// to go far from its seat says whose it is, and its spot is found again with the name's height.
object ChallengeLayout {
    const val ROW_H = 43f
    const val NAME_H = 13f
    const val PITCH = 35f
    private const val STEP = 10f
    private const val FAR = 100f
    private const val FOLDED_SEAT = 200f
    private const val TOUCH = 4f

    // Centre and size of a row, and whether it carries its player's name.
    data class Spot(val x: Float, val y: Float, val width: Float, val height: Float, val named: Boolean)
    private data class Box(val l: Float, val t: Float, val r: Float, val b: Float)

    // A shown hand's row: its combination (none for a winner, whose hand is over the pot) and the
    // cards from its hand that the combination does not use.
    fun parts(p: PlayerView, winner: Boolean): Pair<List<OddsCard>, List<String>> {
        val best = p.hand?.best.orEmpty()
        val used = best.mapNotNull { it.code }.toSet()
        return (if (winner) emptyList() else best) to p.cards.filterNotNull().filter { it !in used }
    }

    private fun hits(a: Box, b: Box) = a.l < b.r - TOUCH && b.l < a.r - TOUCH && a.t < b.b - TOUCH && b.t < a.b - TOUCH

    // Players whose cards are face up at the end of a hand outside the showdown's rows: a winner
    // nobody contested, or anyone who chose to show.
    fun shownPlayers(view: View, sd: Showdown?): List<PlayerView> {
        if (view.phase != Phase.HAND_OVER) return emptyList()
        return view.players.filter { p -> p.inHand && p.cards.size == 2 && p.cards.all { it != null } && sd?.players?.none { it.id == p.id } != false }
    }

    // Two community-size cards with their lines, in a padded box.
    private const val SHOWN_W = 2 * 40f + 6f + 12f
    private const val SHOWN_H = 56f + 7f + 12f

    // Where the showdown's rows and any cards shown face up go, in dp of the table box. Shown
    // cards try the spot in front of their player first.
    fun place(sd: Showdown?, view: View, n: Int, w: Float, h: Float): Map<String, Spot> {
        fun k(p: PlayerView) = Spots.seatIndex(p, view)
        fun seatBox(k: Int): Box { val s = Spots.seat(k, n); return Box(w * s.x - 43f, h * s.y - 21f, w * s.x + 43f, h * s.y + 65f) }
        val shown = shownPlayers(view, sd)
        val showing = ((sd?.players ?: emptyList()) + shown).map(::k).toSet()
        val cx = w * Spots.POT.x
        val fixed = mutableListOf(Box(w / 2 - 108f, h / 2 - 28f, w / 2 + 108f, h / 2 + 35f))
        fixed += showing.map(::seatBox)
        if (sd != null) {
            val rowWidth = 5 * sd.cardWidth + 4 * Showdown.GAP + Showdown.KICKER_GAP
            val top = h * Spots.POT.y - sd.top
            fixed += Box(cx - rowWidth / 2 - 72f, top, cx + rowWidth / 2, top + sd.titleHeight + sd.winners.size * sd.rowHeight + (if (sd.kind == "draw") 0f else 14f) + 7f)
        } else if (shown.isNotEmpty()) {
            // The note of an uncontested win over the pot ring.
            fixed += Box(cx - 100f, h * Spots.POT.y - 38f, cx + 100f, h * Spots.POT.y + 38f)
        }
        val folded = (0 until n).filter { it !in showing }.map(::seatBox)
        class Item(val p: PlayerView, val size: (Boolean) -> Pair<Float, Float>, val anchor: (Float) -> Pair<Float, Float>)
        val items = mutableListOf<Item>()
        for (p in sd?.players ?: emptyList()) {
            val (combo, unused) = parts(p, sd!!.isWinner(p.id))
            if (combo.isEmpty() && unused.isEmpty()) continue
            val kicker = combo.withIndex().any { (i, c) -> c.spare && i > 0 && !combo[i - 1].spare }
            val rw = (combo.size + unused.size) * PITCH - 3f + (if (combo.isNotEmpty() && unused.isNotEmpty()) 8f else 0f) + (if (kicker) 6f else 0f) + 12f
            val s = Spots.seat(k(p), n)
            val above = (s.y > 0.15f && s.y < 0.495f) || s.y > 0.8f
            val mine = k(p) == 0
            items += Item(p, { named -> rw to ROW_H + if (named) NAME_H else 0f }) { rh ->
                if (mine) (w / 2) to (h * 0.79f) else (w * s.x) to (if (above) h * s.y - 21f - rh / 2 - 2f else h * s.y + 65f + rh / 2 + 2f)
            }
        }
        for (p in shown) {
            val b = Spots.bet(k(p), n)
            items += Item(p, { named -> SHOWN_W to SHOWN_H + if (named) NAME_H else 0f }) { _ -> (w * b.x) to (h * b.y) }
        }
        items.sortWith(compareBy({ if (k(it.p) == 0) 0 else 1 }, { kotlin.math.abs(Spots.seat(k(it.p), n).y - 0.5f) }))
        val placed = mutableListOf<Box>()
        val out = mutableMapOf<String, Spot>()
        for (it in items) {
            var chosen: Spot? = null
            for (named in listOf(false, true)) {
                val (rw, rh) = it.size(named)
                val (ax, ay) = it.anchor(rh)
                var best: Triple<Float, Float, Float>? = null
                var bestDistance = 0f
                var y = rh / 2
                while (y <= h - rh / 2) {
                    var x = rw / 2
                    while (x <= maxOf(rw / 2, w - rw / 2)) {
                        val r = Box(x - rw / 2, y - rh / 2, x + rw / 2, y + rh / 2)
                        if (fixed.none { o -> hits(r, o) } && placed.none { o -> hits(r, o) }) {
                            val d = kotlin.math.hypot(x - ax, y - ay)
                            val cost = d + FOLDED_SEAT * folded.count { o -> hits(r, o) }
                            if (best == null || cost < best.first) { best = Triple(cost, x, y); bestDistance = d }
                        }
                        x += STEP
                    }
                    y += STEP
                }
                val x = best?.second ?: ax.coerceIn(rw / 2, maxOf(rw / 2, w - rw / 2))
                val yy = best?.third ?: ay.coerceIn(rh / 2, maxOf(rh / 2, h - rh / 2))
                chosen = Spot(x, yy, rw, rh, named)
                if (bestDistance <= FAR) break
            }
            val c = chosen ?: continue
            out[it.p.id] = c
            placed += Box(c.x - c.width / 2, c.y - c.height / 2, c.x + c.width / 2, c.y + c.height / 2)
        }
        return out
    }
}

class TableEffects(private val checkWord: String) {
    val flights = mutableStateListOf<Flight>()
    val landing = mutableStateMapOf<String, Long>()
    var now by mutableLongStateOf(System.currentTimeMillis())
    private var prev: View? = null
    private var nextId = 1L

    fun isLanding(key: String): Boolean = (landing[key] ?: 0L) > now

    // Work out what moved between the last view and this one, as the web client does.
    fun onView(view: View) {
        val p = prev
        prev = view
        val hand = view.hand ?: return
        if (p == null || p.gameNumber != view.gameNumber || p.roomId != view.roomId) return
        val n = maxOf(2, view.players.size)
        fun k(pl: PlayerView) = Spots.seatIndex(pl, view)
        val prevHand = p.hand
        val sameHand = prevHand != null && prevHand.no == hand.no
        val out = mutableListOf<Flight>()
        var delay = 0
        fun add(from: Offset, to: Offset, lands: String, ms: Int, amount: Int = 0, card: Boolean = false, allIn: Boolean = false, pair: Boolean = false, text: String? = null, after: Int = 0) {
            out.add(Flight(nextId++, from, to, delay + after, ms, lands, amount, card, pair, allIn, text))
        }
        if (!sameHand) {
            val dealt = view.players.filter { it.inHand }.sortedBy { dist(it.seat, hand.button) }
            repeat(2) {
                for (pl in dealt) { add(Spots.DECK, Spots.cards(k(pl), n), "cards:${pl.id}", DEAL_MS, card = true); delay += DEAL_GAP }
            }
            delay += DEAL_MS
        }
        val sweep = sameHand && (prevHand!!.street != hand.street || (view.phase == Phase.HAND_OVER && p.phase != Phase.HAND_OVER))
        if (sweep) {
            var any = false
            for (q in p.players) {
                if (q.bet <= 0) continue
                val pl = view.players.firstOrNull { it.id == q.id } ?: q
                add(Spots.bet(k(pl), n), Spots.POT, "pot", FLY_MS, amount = q.bet); any = true
            }
            if (any) delay += FLY_MS
        }
        val newBoard = if (sameHand) hand.board.size - prevHand!!.board.size else hand.board.size
        if (newBoard > 0 && view.phase != Phase.HAND_OVER) {
            add(Spots.DECK, Spots.BURN, "burn", DEAL_MS, card = true)
            delay += (DEAL_MS * 0.6).toInt()
            for (i in hand.board.size - newBoard until hand.board.size) { add(Spots.DECK, Spots.board(i), "board:$i", DEAL_MS, card = true); delay += DEAL_GAP }
            delay += DEAL_MS
        }
        if (view.phase == Phase.HAND_OVER && p.phase != Phase.HAND_OVER && view.lastResult != null) {
            val won = mutableMapOf<String, Int>()
            for (pot in view.lastResult.pots) for (w in pot.winners) won[w.playerId] = (won[w.playerId] ?: 0) + w.amount
            for ((id, amount) in won) view.players.firstOrNull { it.id == id }?.let { add(Spots.POT, Spots.seat(k(it), n), "stack:$id", FLY_MS, amount = amount) }
            // A showdown: each winner's cards that make the hand fly over the pot ring, then the
            // board cards that complete it slide in, each to its place in reading order; a draw,
            // row by row.
            val sd = Showdown.of(view)
            if (sd != null) {
                var t = 0
                sd.winners.forEachIndexed { r, w ->
                    val best = w.hand?.best.orEmpty()
                    val xs = Showdown.offsets(best, sd.cardWidth)
                    val from = if (k(w) == 0) Offset(0.5f, 1.22f) else Spots.shown(k(w), n)
                    best.forEachIndexed { i, c -> if (c.from == "hole") out.add(Flight(nextId++, from, Spots.POT, t, 600, "show:$r:$i", code = c.code, dx = xs[i], dy = sd.cardDy(r, false), size = sd.cardWidth)) }
                    t += 650
                    best.forEachIndexed { i, c ->
                        val b = c.code?.let { hand.board.indexOf(it) } ?: -1
                        if (c.from == "board" && b >= 0) { out.add(Flight(nextId++, Spots.board(b), Spots.POT, t, 500, "show:$r:$i", code = c.code, dx = xs[i], dy = sd.cardDy(r, true), size = sd.cardWidth)); t += 180 }
                    }
                    t += 200
                }
            }
        } else {
            for (pl in view.players) {
                val q = if (sameHand) p.players.firstOrNull { it.id == pl.id } else null
                // A fold: the chips in front of the player go into the pot and the cards land where they were.
                if (sameHand && q != null && !q.folded && pl.folded) {
                    if (q.bet > 0) add(Spots.bet(k(pl), n), Spots.POT, "pot", FLY_MS, amount = q.bet)
                    // Your own cards come up from your hand below the table.
                    val mine = k(pl) == 0
                    add(if (mine) Offset(0.5f, 1.22f) else Spots.cards(k(pl), n), Spots.bet(k(pl), n), "fold:${pl.id}", if (mine) FLY_MS + 150 else FLY_MS, pair = true, after = 200)
                    continue
                }
                // A check: nothing moves, so a word pops up at the seat.
                val checked = hand.event == "action" && hand.lastActorId == pl.id && pl.lastAction?.kind == "check"
                val shown = prevHand != null && prevHand.event == "action" && prevHand.lastActorId == pl.id && q?.lastAction?.kind == "check"
                if (checked && !shown) add(Spots.cards(k(pl), n), Spots.cards(k(pl), n), "callout:${pl.id}:${view.version}", CALLOUT_MS, text = checkWord)
                val before = if (q != null && !sweep) q.bet else 0
                if (pl.bet > before) {
                    val allIn = pl.allIn && !(q?.allIn ?: false)
                    add(Spots.seat(k(pl), n), Spots.bet(k(pl), n), "bet:${pl.id}", if (allIn) ALL_IN_MS else FLY_MS, amount = pl.bet - before, allIn = allIn)
                }
            }
        }
        val start = System.currentTimeMillis()
        for (f in out) landing[f.lands] = maxOf(landing[f.lands] ?: 0L, start + f.delayMs + f.durationMs)
        flights.addAll(out)
    }

    companion object {
        const val FLY_MS = 450
        const val ALL_IN_MS = 700
        // Three cards a second, as the server assumes (DEAL_CARD_MS).
        const val DEAL_MS = 350
        const val DEAL_GAP = 340
        const val CALLOUT_MS = 2200
        fun dist(seat: Int, from: Int): Int {
            val d = ((seat - from) % 9 + 9) % 9
            return if (d == 0) 9 else d
        }
    }
}

// A decision clock that fills as the time is used: green, then orange past half, then flashing
// red for the last fifth. `left` is the time still to run of `total`.
@Composable
fun GrowingClock(left: Long, total: Long, now: Long, width: Dp, height: Dp = 8.dp, modifier: Modifier = Modifier) {
    val used = (1f - left.toFloat() / total).coerceIn(0f, 1f)
    val flash = used >= 0.8f && (now / 300) % 2 == 0L
    val colour = when {
        flash -> Color(0xFFFF2A2A)
        used >= 0.8f -> Color(0xFFFF6B6B)
        used >= 0.5f -> Color(0xFFF0A030)
        else -> Good
    }
    Box(modifier.size(width, height).clip(RoundedCornerShape(height / 2)).background(Color.Black.copy(alpha = 0.45f)).border(1.dp, Color.White.copy(alpha = 0.25f), RoundedCornerShape(height / 2))) {
        Box(Modifier.fillMaxHeight().width(width * used).background(colour))
    }
}

// The gold glow behind the seat whose turn it is, gliding clockwise round the ring. The angle
// is unwrapped so every move goes forward, and kept between hands.
@Composable
fun TurnLight(actorK: Int?, n: Int, w: Dp, h: Dp) {
    val unwrapped = remember { mutableStateOf<Float?>(null) }
    LaunchedEffect(actorK, n) {
        if (actorK != null) {
            val a = Spots.angle(actorK, n)
            val prev = unwrapped.value ?: a
            val twoPi = (2 * PI).toFloat()
            unwrapped.value = prev + (((a - prev) % twoPi) + twoPi) % twoPi
        }
    }
    val target = unwrapped.value ?: return
    val angle by androidx.compose.animation.core.animateFloatAsState(target, tween(600, easing = FastOutSlowInEasing), label = "turn")
    if (actorK == null) return
    val p = Spots.ring(angle)
    Box(
        Modifier.offset(w * p.x - 48.dp, h * p.y - 38.dp).size(96.dp, 76.dp)
            .graphicsLayer { alpha = 0.55f }
            .background(Brush.radialGradient(listOf(Color(0xFFE0B35A), Color(0xFFE0B35A).copy(alpha = 0.6f), Color.Transparent))),
    )
}

// Draws the flights over the table; `w` and `h` are the table box size.
@Composable
fun FlightLayer(fx: TableEffects, w: Dp, h: Dp, modifier: Modifier = Modifier) {
    // A frame clock while anything is in the air, so destinations appear on time.
    LaunchedEffect(fx.flights.isNotEmpty()) {
        while (fx.flights.isNotEmpty()) withFrameMillis { fx.now = System.currentTimeMillis() }
        fx.now = System.currentTimeMillis()
    }
    Box(modifier) { for (f in fx.flights.toList()) FlightView(fx, f, w, h) }
}

@Composable
private fun FlightView(fx: TableEffects, f: Flight, w: Dp, h: Dp) {
    val progress = remember(f.id) { Animatable(0f) }
    var visible by remember(f.id) { mutableStateOf(f.delayMs == 0) }
    LaunchedEffect(f.id) {
        if (f.delayMs > 0) delay(f.delayMs.toLong())
        visible = true
        progress.animateTo(1f, tween(f.durationMs, easing = FastOutSlowInEasing))
        fx.flights.remove(f)
    }
    if (!visible) return
    val x = w * f.from.x + (w * f.to.x + f.dx.dp - w * f.from.x) * progress.value
    val y = h * f.from.y + (h * f.to.y + f.dy.dp - h * f.from.y) * progress.value
    Box(Modifier.offset(x, y)) {
        Box(Modifier.offset(if (f.code != null) (-f.size / 2).dp else (-20).dp, if (f.code != null) (-f.size * 0.7f).dp else (-12).dp)) {
            if (f.code != null) PlayingCard(f.code, f.size.dp)
            else if (f.text != null) {
                // A word that pops, rises and fades.
                val t = progress.value
                val fade = if (t < 0.15f) t / 0.15f else if (t > 0.7f) (1f - t) / 0.3f else 1f
                Text(f.text, color = Ink, fontSize = 13.sp, fontWeight = FontWeight.Bold,
                    modifier = Modifier.offset(y = (-26 * t).dp).scale(if (t < 0.15f) 0.6f + 0.55f * (t / 0.15f) else 1f).graphicsLayer { alpha = fade.coerceIn(0f, 1f) }
                        .clip(RoundedCornerShape(999.dp)).background(MaterialTheme.colorScheme.primary).padding(horizontal = 10.dp, vertical = 3.dp))
            } else if (f.pair) Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) { PlayingCard(null, 24.dp); PlayingCard(null, 24.dp) }
            else if (f.card) PlayingCard(null, 20.dp)
            else {
                val scale = if (f.allIn) 1f + 0.5f * sin(progress.value * PI.toFloat()) else 1f
                ChipPile(f.amount, 12.dp, label = false, modifier = Modifier.scale(scale))
                if (f.allIn) Text(L("all_in"), color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold,
                    modifier = Modifier.offset(y = (-22).dp).clip(RoundedCornerShape(10.dp)).background(MaterialTheme.colorScheme.error).padding(horizontal = 8.dp, vertical = 1.dp))
            }
        }
    }
}
