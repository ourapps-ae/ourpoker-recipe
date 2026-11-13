package app.ourapps.ourpoker.ui

import ae.cards.CardSlot
import ae.cards.PlayingCard
import ae.chips.ChipPile
import ae.clock.remaining
import ae.controls.BackIcon
import ae.controls.HelpBulb
import ae.controls.Panel
import ae.controls.PromptBanner
import ae.controls.RoundIconButton
import ae.controls.mmss
import ae.controls.pulseHalo
import ae.holdem.BetKind
import ae.holdem.BetRange as BetLimits
import ae.holdem.betIsAllIn
import ae.holdem.betPresets
import ae.holdem.betStep
import ae.holdem.callIsAllIn

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import app.ourapps.ourpoker.Zoom
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.SmartToy
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.widthIn
import app.ourapps.ourpoker.SoundName
import app.ourapps.ourpoker.Sound
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import app.ourapps.ourpoker.TableViewModel
import app.ourapps.ourpoker.UiState
import app.ourapps.ourpoker.net.Phase
import app.ourapps.ourpoker.net.OddsCard
import app.ourapps.ourpoker.net.PlayerView
import app.ourapps.ourpoker.net.Status
import app.ourapps.ourpoker.net.View
import kotlinx.coroutines.delay

// GAP: G9.6 table-layout's OvalTable places seats but not the cards, bets and flights around them, so the table draws its own
// felt and all of them share one coordinate box (Spots, from table-layout's placed seats).

// Only you and computer players: nobody else to see or hear, so the game shows no video.
fun View.soloGame(): Boolean = status != Status.LOBBY && players.count { !it.isBot } <= 1

// Wall-clock millisecond that ticks four times a second, for the countdowns.
@Composable
fun rememberNow(): Long {
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            now = System.currentTimeMillis()
            delay(250)
        }
    }
    return now
}

@Composable
fun TableScreen(vm: TableViewModel, ui: UiState, view: View) {
    // While anyone holds the play clock (looking at cards, reading a guide), every countdown
    // stands still where the server left it.
    val now = if (view.held) ui.viewAt else rememberNow()
    LaunchedEffect(now) { vm.warnIfTimeIsShort(now) }
    val me = view.me
    val hand = view.hand
    var confirmEnd by remember { mutableStateOf(false) }
    val checkWord = L("check")
    val fx = remember { TableEffects(checkWord) }
    LaunchedEffect(view.version) { fx.onView(view) }
    // The settle after a deal or an action: the event is announced and nobody's clock runs.
    val settling = (remaining(hand?.settleMs, ui.viewAt, now, view.paused) ?: 0L) > 0L
    val betOpen = ui.betTo != null && view.legal.fold && view.legal.bet != null && ui.zoom == null
    var betPanelHeight by remember { mutableIntStateOf(0) }
    RoomCards(view.roomId) {
    Box(Modifier.fillMaxSize()) {
        PokerBackground(themeFor(view.roomId), figures = false)
        Column(Modifier.fillMaxSize().safeDrawingPadding().verticalScroll(rememberScrollState()).padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            // Microphone, camera and sounds at the top, beside how to play; video only with other people at the table.
            Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(roomName(view.roomId), style = MaterialTheme.typography.headlineMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                if (me != null && !view.soloGame()) HeaderMedia(vm, spacing = 6.dp)
                SoundToggle(vm)
                HelpBulb(L("how_to_play"), onClick = { Sound.play(SoundName.CLICK); vm.showHelp(true) })
            }
            LevelCard(ui, view, now)
            ShowCardsButton(vm, ui, view)
            PromptBanner((if (settling && !view.paused) eventText(view) else null) ?: promptText(view)) {
                val left = remaining(hand?.remainingMs, ui.viewAt, now, view.paused)
                if (hand != null && view.phase == Phase.BETTING && left != null && left <= 30000 && hand.actorId != null && view.player(hand.actorId)?.isBot == false) {
                    Box(Modifier.size(44.dp, 22.dp).clip(RoundedCornerShape(11.dp)).background(Color.Black.copy(alpha = 0.4f)), contentAlignment = Alignment.Center) {
                        Text(((left + 999) / 1000).toString(), color = if (left < 8000) Color(0xFFFF6B6B) else Color.White, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                    }
                }
            }
            Box {
                PokerTable(vm, ui, view, now, fx)
                // Back up a level from the top left: leave the table (a running game keeps your seat,
                // sitting out, until you come back).
                if (view.legal.leave) Box(Modifier.align(Alignment.TopStart).padding(4.dp).background(Color.Black.copy(alpha = 0.35f), CircleShape)) {
                    RoundIconButton(null, L("leave"), enabled = !ui.busy, filled = false, onClick = vm::leave) { BackIcon(it) }
                }
                // End game: the gold circle with a cross in the table's corner.
                if (view.legal.cancel) Box(Modifier.align(Alignment.TopEnd).padding(4.dp)) {
                    RoundIconButton(Icons.Filled.Close, L("end_game"), enabled = !ui.busy, filled = true, onClick = { confirmEnd = true })
                }
            }
            if (me != null) MyArea(vm, ui, view, me, now, hideCards = fx.isLanding("cards:${me.id}"))
            if (me != null) HandPanel(vm, ui, view, me)
            ResultPanel(vm, ui, view)
            Controls(vm, ui, view)
            errorText(ui.error?.code, ui.error?.message)?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(horizontal = 8.dp)) }
            // Room to scroll everything above the bet panel into view.
            if (betOpen) Spacer(Modifier.height(with(LocalDensity.current) { betPanelHeight.toDp() }))
        }
        // Choosing an amount: pinned to the bottom of the screen over the table; the large cards keep their own.
        if (betOpen && me != null) Box(
            Modifier.align(Alignment.BottomCenter).windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Bottom + WindowInsetsSides.Horizontal))
                .padding(12.dp).widthIn(max = 440.dp).onSizeChanged { betPanelHeight = it.height }
                .clip(PanelShape).background(Color(0xF21B1A17)),
        ) { BetPanel(vm, ui, view, view.legal.fold && !ui.busy && !fx.isLanding("cards:${me.id}")) }
    }
    }
    if (confirmEnd) {
        AlertDialog(
            onDismissRequest = { confirmEnd = false },
            title = { Text(L("end_game")) },
            text = { Text(L("end_game_confirm")) },
            confirmButton = { TextButton(onClick = { confirmEnd = false; vm.cancel() }) { Text(L("end_game")) } },
            dismissButton = { TextButton(onClick = { confirmEnd = false }) { Text(L("cancel")) } },
        )
    }
    if (view.legal.rebuy) RebuyDialog(vm, ui, view, now)
    // Cards large over the screen until tapped away.
    LaunchedEffect(hand?.no) { vm.zoom(null) }
    ui.zoom?.let { what -> ZoomOverlay(vm, ui, view, what, now, fx.isLanding("cards:${view.you}")) }
    if (view.phase == Phase.UNKNOWN) {
        AlertDialog(onDismissRequest = {}, confirmButton = {}, title = { Text(L("update_needed")) },
            text = { Text(L("update_body", vm.currentVersion)) })
    }
}

// Seats on an ellipse, yours at the bottom; board and pots in the middle.
@Composable
private fun PokerTable(vm: TableViewModel, ui: UiState, view: View, now: Long, fx: TableEffects) {
    val hand = view.hand
    val n = maxOf(2, view.players.size)
    val mySeat = view.me?.seat ?: 0
    val room = vm.video.room.collectAsState().value
    val live = rememberLiveVideo(vm.video)
    BoxWithConstraints(Modifier.fillMaxWidth().aspectRatio(1f / 1.3f)) {
        val w = maxWidth
        val h = maxHeight
        // Felt.
        Box(
            Modifier.offset(w * 0.05f, h * 0.09f).size(w * 0.9f, h * 0.82f).clip(RoundedCornerShape(50))
                .background(Brush.radialGradient(listOf(themeFor(view.roomId).felt, themeFor(view.roomId).felt, Color.Black.copy(alpha = 0.35f))))
                .border(7.dp, Color(0xFF4A2D1C), RoundedCornerShape(50)),
        )
        // Whose turn it is: the light glides to their seat.
        val actorK = if (view.phase == Phase.BETTING) hand?.actorId?.let { id -> view.player(id)?.let { Spots.seatIndex(it, view) } } else null
        TurnLight(actorK, n, w, h)
        // The deck and the burn pile above the board.
        Box(Modifier.offset(w * Spots.DECK.x - 10.dp, h * Spots.DECK.y - 14.dp)) { for (i in 0 until 3) Box(Modifier.offset(i.dp, (-i * 1.5f).dp)) { PlayingCard(null, 20.dp) } }
        if (hand != null) {
            val burns = (if (hand.board.size >= 3) 1 else 0) + (if (hand.board.size >= 4) 1 else 0) + (if (hand.board.size >= 5) 1 else 0) - (if (fx.isLanding("burn")) 1 else 0)
            Box(Modifier.offset(w * Spots.BURN.x - 10.dp, h * Spots.BURN.y - 14.dp)) { for (i in 0 until burns.coerceAtLeast(0)) Box(Modifier.offset((i * 3).dp, (i * 2).dp).rotate((i - 1) * 7f)) { PlayingCard(null, 20.dp) } }
        }
        // Centre: the board, with the pot below it. Tap the board to see the community cards large.
        val board = hand?.board ?: emptyList()
        // Every place underlined gold, the legend's colour for the community cards; the line hangs
        // below the card so the card keeps its place.
        Row(
            Modifier.align(Alignment.Center).zIndex(1f).guideAnchor("board").pointerInput(board) { detectTapGestures(onTap = { if (board.isNotEmpty()) vm.zoom(Zoom.BOARD) }) },
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            for (i in 0 until 5) {
                val c = hand?.board?.getOrNull(i)
                Box {
                    if (c != null && !fx.isLanding("board:$i")) PlayingCard(c, 40.dp) else CardSlot(40.dp)
                    LegendLine(MaterialTheme.colorScheme.primary, 40.dp, Modifier.align(Alignment.BottomCenter).offset(y = 7.dp))
                }
            }
        }
        // The pot ring, marked on the felt below the board, always there so the pot has an obvious
        // home: one pile per pot, hidden while chips are on their way, gone once the hand is over.
        Box(
            Modifier.align(Alignment.TopCenter).offset(y = h * Spots.POT.y - 28.dp).zIndex(1f).sizeIn(minWidth = 56.dp, minHeight = 56.dp, maxHeight = 56.dp)
                .border(1.5.dp, Color.White.copy(alpha = 0.3f), RoundedCornerShape(28.dp)).guideAnchor("pot").padding(start = 8.dp, end = 8.dp, top = 8.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(L("pot").uppercase(), color = Color.White.copy(alpha = 0.45f), fontSize = 9.sp, lineHeight = 9.sp, letterSpacing = 1.sp, modifier = Modifier.align(Alignment.TopCenter).offset(y = (-4).dp))
            if (hand != null && view.phase != Phase.HAND_OVER && hand.pots.isNotEmpty()) {
                Row(Modifier.graphicsLayer { alpha = if (fx.isLanding("pot")) 0f else 1f }, horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.Bottom) {
                    for (p in hand.pots) ChipPile(p.amount, 12.dp)
                }
            }
        }
        // A showdown: the winning hands over the pot ring, in reading order, each card underlined
        // green (from the winner's hand) or gold (from the board), kickers after a gap; a kicker
        // win says so; a draw is titled and names each hand. A pot nobody contested says so there.
        // Under either, the time to the next hand.
        val sd = Showdown.of(view)
        // Where every shown hand goes, clear of each other and of the winning cards.
        val challenges = remember(view.version, w, h) { ChallengeLayout.place(sd, view, n, w.value, h.value) }
        val left = if (view.phase == Phase.HAND_OVER) remaining(hand?.remainingMs, ui.viewAt, now, view.paused) else null
        val hold = view.lastResult?.holdMs ?: if (view.lastResult?.uncontested == true) 6000L else 22000L
        if (sd != null) {
            val cw = sd.cardWidth
            Column(Modifier.align(Alignment.TopCenter).offset(y = h * Spots.POT.y - sd.top.dp).zIndex(5f).pointerInput(Unit) { detectTapGestures(onTap = { vm.zoom(Zoom.SHOWCASE) }) }, horizontalAlignment = Alignment.CenterHorizontally) {
                // A split pot names the shared hand in its title.
                if (sd.kind == "draw") Text((L("split_pot") + (sd.winners.firstOrNull()?.hand?.name?.let { " \u00B7 $it" } ?: "")).uppercase(), maxLines = 1, color = MaterialTheme.colorScheme.primary, fontSize = 13.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp, lineHeight = 18.sp, modifier = Modifier.height(sd.titleHeight.dp))
                sd.winners.forEachIndexed { r, wp ->
                    val best = wp.hand?.best.orEmpty()
                    Box(Modifier.height(sd.rowHeight.dp)) {
                        Row(horizontalArrangement = Arrangement.spacedBy(Showdown.GAP.dp), verticalAlignment = Alignment.Top) {
                            best.forEachIndexed { i, c ->
                                // Community cards higher, toward the board; the hand's own a fifth of a card lower.
                                Column(
                                    Modifier.padding(start = if (c.spare && i > 0 && !best[i - 1].spare) Showdown.KICKER_GAP.dp else 0.dp, top = if (c.from == "board") 0.dp else sd.raise.dp)
                                        .graphicsLayer { alpha = if (fx.isLanding("show:$r:$i")) 0f else 1f },
                                    verticalArrangement = Arrangement.spacedBy(3.dp),
                                ) {
                                    PlayingCard(c.code, cw.dp)
                                    Box(Modifier.size(cw.dp, 4.dp).clip(RoundedCornerShape(2.dp)).background(if (c.from == "hole") Good else MaterialTheme.colorScheme.primary))
                                }
                            }
                        }
                        // Who won this hand and how much, left of it.
                        Column(Modifier.offset(x = (-72).dp, y = (cw * 0.7f - 14f).dp).width(64.dp), horizontalAlignment = Alignment.End) {
                            Text(wp.name, color = Color.White, fontSize = 12.sp, lineHeight = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, textAlign = TextAlign.End)
                            Text("+" + chips(sd.won[wp.id] ?: 0), color = MaterialTheme.colorScheme.primary, fontSize = 11.sp, lineHeight = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1, textAlign = TextAlign.End)
                        }
                    }
                }
                // How: the hand, and whether a kicker decided it.
                if (sd.kind != "draw") sd.winners.firstOrNull()?.hand?.name?.let { name ->
                    Text(name + if (sd.kind == "kicker") " \u00B7 " + L("won_on_kicker") else "", color = Color.White.copy(alpha = 0.9f), fontSize = 12.sp, lineHeight = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                }
                NextHandBar(left, hold)
            }
        } else if (Showdown.uncontested(view)) {
            Column(
                Modifier.align(Alignment.TopCenter).offset(y = h * Spots.POT.y - 34.dp).zIndex(5f).clip(RoundedCornerShape(12.dp)).background(Color.Black.copy(alpha = 0.45f)).padding(horizontal = 16.dp, vertical = 10.dp),
                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                // Who won and why.
                val id = view.lastResult?.pots?.firstOrNull()?.winners?.firstOrNull()?.playerId
                Text(L("wins_amount", view.player(id)?.name ?: "", chips(Showdown.wonBy(view)[id] ?: 0)), color = MaterialTheme.colorScheme.primary, fontSize = 16.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                Text(L("everyone_folded"), color = Color.White.copy(alpha = 0.85f), fontSize = 12.sp)
                NextHandBar(left, hold)
            }
        }
        for (p in view.players) {
            val k = ((p.seat - mySeat) % n + n) % n
            val me = p.id == view.you
            val sp = Spots.seat(k, n)
            val isActor = hand?.actorId == p.id && view.phase == Phase.BETTING
            // Live cards by the seat; folded ones lie face down where the bet was. Hidden until the
            // flight bringing them lands. At a showdown every shown hand is laid out as its
            // challenge instead.
            if (sd != null && sd.players.any { it.id == p.id }) {
                // Tap a row to see the hand large; a winner's row shows every winning hand.
                challenges[p.id]?.let { spot -> ChallengeRow(p, sd.isWinner(p.id), k, n, spot) { if (sd.isWinner(p.id)) vm.zoom(Zoom.SHOWCASE) else vm.zoom(Zoom.HAND, p.id) } }
            } else if (challenges[p.id] != null) {
                // Cards shown face up at the end of a hand lie in front of the player; tap to see them large.
                ShownHand(p, challenges.getValue(p.id)) { vm.zoom(Zoom.HAND, p.id) }
            } else if (p.inHand && p.folded) {
                // Folded cards leave the table while the result is up, clear of the winning hands.
                if (!fx.isLanding("fold:${p.id}") && view.phase != Phase.HAND_OVER) {
                    val bp = Spots.bet(k, n)
                    // Tap your own folded cards to see them large.
                    Row(
                        Modifier.offset(w * bp.x - 23.dp, h * bp.y - 15.dp).graphicsLayer { alpha = if (me) 1f else 0.75f }
                            .then(if (me) Modifier.pointerInput(Unit) { detectTapGestures(onTap = { vm.zoom(Zoom.FOLDED) }) } else Modifier),
                        horizontalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        PlayingCard(null, 20.dp)
                        PlayingCard(null, 20.dp, modifier = Modifier.rotate(8f))
                    }
                }
            } else if (p.inHand && !me && !fx.isLanding("cards:${p.id}") && challenges[p.id] == null) {
                // Hidden cards tuck in beside the monitor, behind it; shown cards grow and come to the front.
                val shown = p.cards.isNotEmpty() && p.cards.all { it != null }
                val cp = if (shown) Spots.shown(k, n) else Spots.cards(k, n)
                val size = Spots.tableCard(n, shown).dp
                Row(Modifier.offset(w * cp.x - size - 1.dp, h * cp.y - size * 0.7f).zIndex(if (shown) 5f else 0f), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                    for (c in p.cards) PlayingCard(if (shown) c else null, size)
                }
                // The actor's clock, under their cards.
                val left = if (isActor && !p.isBot && !view.paused) remaining(hand?.remainingMs, ui.viewAt, now, false) else null
                if (left != null && left <= 30000) GrowingClock(left, 30000, now, 40.dp, modifier = Modifier.offset(w * cp.x - 20.dp, h * cp.y + 23.dp).zIndex(3f))
            }
            if (p.bet > 0) {
                val bp = Spots.bet(k, n)
                ChipPile(p.bet, 12.dp, modifier = Modifier.offset(w * bp.x - 20.dp, h * bp.y - 14.dp).zIndex(2f).graphicsLayer { alpha = if (fx.isLanding("bet:${p.id}")) 0f else 1f })
            }
            Column(Modifier.offset(w * sp.x - 43.dp, h * sp.y - 21.dp).zIndex(2f).width(86.dp).graphicsLayer { alpha = if (p.out) 0.4f else 1f }, horizontalAlignment = Alignment.CenterHorizontally) {
                Box {
                    val frame = Modifier.size(56.dp, 42.dp).clip(RoundedCornerShape(6.dp)).background(Color(0xFF101010))
                        .border(2.dp, if (isActor) MaterialTheme.colorScheme.primary else Color(0xFF3A3A3A), RoundedCornerShape(6.dp))
                        .graphicsLayer { alpha = if (p.folded) 0.55f else 1f }
                    if (room != null && p.id in live) Box(frame) { VideoOrInitial(room, p.id, me, p.name, 16.sp) }
                    else Box(frame, contentAlignment = Alignment.Center) {
                        if (p.isBot) Icon(Icons.Filled.SmartToy, contentDescription = null, tint = Color(0xFF999999), modifier = Modifier.size(22.dp))
                        else Text(p.name.take(1), color = Color(0xFF999999), fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    }
                    if (hand != null && hand.button == p.seat) {
                        Box(Modifier.align(Alignment.TopEnd).offset(8.dp, (-8).dp).size(18.dp).background(CardFace, CircleShape).border(1.dp, Color(0xFF333333), CircleShape), contentAlignment = Alignment.Center) {
                            Text(L("dealer"), color = Ink, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
                Text(p.name + if (p.isHost) " \u2605" else "", color = if (isActor) MaterialTheme.colorScheme.primary else Color.White.copy(alpha = 0.9f), fontSize = 11.sp, fontWeight = if (isActor) FontWeight.Bold else FontWeight.Normal, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Box(Modifier.clip(RoundedCornerShape(8.dp)).background(Color.Black.copy(alpha = 0.5f)).padding(horizontal = 6.dp)) {
                    Text(chips(p.stack), color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
                val status = when {
                    p.out -> L("out")
                    p.sittingOut -> L("sitting_out")
                    !p.connected && !p.isBot -> L("away")
                    p.allIn -> L("all_in_mark")
                    p.folded -> L("folded")
                    else -> null
                }
                // Once the cards are shown, the hand's name takes the place of the last action.
                when {
                    !me && p.hand != null && p.cards.isNotEmpty() && p.cards.all { it != null } -> Text(p.hand.name, color = Color.White, fontSize = 10.sp, maxLines = 1)
                    status != null -> Text(status, color = Color.White.copy(alpha = 0.7f), fontSize = 10.sp)
                    me -> Unit
                    p.lastAction != null && hand != null -> Text(actionText(p.lastAction), color = MaterialTheme.colorScheme.primary, fontSize = 10.sp, maxLines = 1)
                }
            }
        }
        FlightLayer(fx, w, h, Modifier.zIndex(6f))
    }
}

// Your cards are the controls: double-tap to check, flick toward the table to fold; tap your
// chips to bet or raise; tap Call to call. The bet dialog stays as it was.
// Your cards are the controls: double-tap to check, flick toward the table to fold; tap your
// chips to bet or raise; tap Call to call. Your move as soon as it is your turn and your cards
// have landed.
@Composable
private fun MyArea(vm: TableViewModel, ui: UiState, view: View, me: PlayerView, now: Long, hideCards: Boolean = false) {
    val legal = view.legal
    val hand = view.hand
    val canAct = legal.fold && !ui.busy && !hideCards
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            // Left of the cards: Call (or the minimum Bet) above your chips, which open the slider.
            Box(Modifier.weight(1f), contentAlignment = Alignment.CenterEnd) { Box(Modifier.guideAnchor("stack")) { PlayButtons(vm, view, me, canAct, vertical = true) } }
            Spacer(Modifier.width(8.dp))
            if (me.cards.isNotEmpty() && !me.folded && !hideCards) Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                // Your cards, each underlined green, the legend's colour for them; on your turn framed
                // and glowing, with what a double tap and a flick do.
                Column(
                    Modifier
                        .pulseHalo(canAct, 12.dp).guideAnchor("hand").clip(RoundedCornerShape(12.dp))
                        .background(if (canAct) MaterialTheme.colorScheme.primary.copy(alpha = 0.12f) else Color.Transparent)
                        // A double tap checks; a single tap, once it is not the start of a double, shows
                        // the cards large.
                        .pointerInput(canAct, legal.check) {
                            detectTapGestures(
                                onTap = { vm.zoom(Zoom.MINE) },
                                onDoubleTap = { if (canAct && legal.check) vm.check() },
                            )
                        }
                        .pointerInput(canAct) {
                            var dy = 0f
                            detectVerticalDragGestures(
                                onDragStart = { dy = 0f },
                                onVerticalDrag = { _, d -> dy += d },
                                onDragEnd = { if (canAct && dy < -40.dp.toPx()) vm.fold() },
                            )
                        }
                        .padding(6.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    if (canAct) MoveHints(legal.check, 11)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        for ((i, c) in me.cards.withIndex()) {
                            val canShow = i in legal.show && !ui.busy
                            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                PlayingCard(c, 72.dp, tappable = canShow, onClick = if (canShow) ({ vm.show(listOf(i)) }) else null)
                                LegendLine(Good, 72.dp)
                            }
                        }
                    }
                }
                val myTurn = hand != null && hand.actorId == me.id && view.phase == Phase.BETTING && !view.paused
                val left = if (myTurn) remaining(hand?.remainingMs, ui.viewAt, now, false) else null
                if (left != null && left <= 30000) GrowingClock(left, 30000, now, 152.dp, 10.dp)
            } else if (me.folded) {
                // Folded cards lie on the table; the hand is empty until the next deal.
                Spacer(Modifier.width(152.dp).height(101.dp))
            } else Spacer(Modifier.width(152.dp))
            Spacer(Modifier.width(8.dp))
            // Back into play after sitting out, right of your cards: going deeper in, so on the right.
            Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                if (legal.back) RoundIconButton(Icons.Filled.PlayArrow, L("back_in"), enabled = !ui.busy, filled = true, glow = true, onClick = vm::back)
            }
        }
    }
}

// Over your cards on your turn: a double tap checks (when you may), a flick up folds.
@Composable
private fun MoveHints(check: Boolean, size: Int) {
    val gold = MaterialTheme.colorScheme.primary
    Row(horizontalArrangement = Arrangement.spacedBy((size * 1.3f).dp), verticalAlignment = Alignment.CenterVertically) {
        if (check) Row(horizontalArrangement = Arrangement.spacedBy((size * 0.35f).dp), verticalAlignment = Alignment.CenterVertically) {
            DoubleTapDots((size * 0.38f).toInt().coerceAtLeast(3), gold)
            Text(L("check"), color = gold, fontWeight = FontWeight.Bold, fontSize = size.sp, lineHeight = (size + 3).sp, maxLines = 1)
        }
        Text("\u2191 " + L("fold"), color = gold, fontWeight = FontWeight.Bold, fontSize = size.sp, lineHeight = (size + 3).sp, maxLines = 1)
    }
}

// Call (or the opening Bet) and your chips, which open the bet panel: beside your cards, and
// below them when they are large. The two keep apart, so their glows do not run together.
@Composable
private fun PlayButtons(vm: TableViewModel, view: View, me: PlayerView, canAct: Boolean, vertical: Boolean) {
    val legal = view.legal
    val toCall = legal.call
    val b = legal.bet
    val pill: (@Composable () -> Unit)? = if (canAct && toCall != null) ({
        Button(onClick = vm::call, modifier = Modifier.pulseHalo(true, 20.dp)) { Text(if (callIsAllIn(toCall, me.stack)) L("all_in") else L("call", chips(toCall))) }
    }) else if (canAct && b != null && b.opening) ({
        Button(onClick = { vm.bet(b.min) }, modifier = Modifier.pulseHalo(true, 20.dp)) { Text(if (betIsAllIn(b.min, me.stack, me.bet)) L("all_in") else L("bet_to", chips(b.min))) }
    }) else null
    val stack: @Composable () -> Unit = {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            if (canAct && b != null && !b.opening) Button(onClick = { vm.setBetTo(b.min) }) { Text(L("move_raise")) }
            Box(
                Modifier.pulseHalo(canAct && legal.bet != null, 12.dp).clip(RoundedCornerShape(12.dp))
                    .background(if (canAct && legal.bet != null) MaterialTheme.colorScheme.primary.copy(alpha = 0.12f) else Color.Transparent)
                    .clickable(enabled = canAct && legal.bet != null) { legal.bet?.let { Sound.play(SoundName.CLICK); vm.setBetTo(it.min) } }
                    .padding(horizontal = 6.dp, vertical = 4.dp),
            ) { ChipPile(me.stack, 12.dp) }
        }
    }
    val moves: @Composable () -> Unit = {
        if (canAct) Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Button(onClick = vm::fold) { Text(L("move_fold")) }
            if (legal.check) Button(onClick = vm::check) { Text(L("move_check")) }
        }
        pill?.invoke()
    }
    if (vertical) Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(12.dp)) { moves(); stack() }
    else Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) { moves(); stack() }
}

@Composable
fun ShowCardsButton(vm: TableViewModel, ui: UiState, view: View) {
    if (view.legal.show.isNotEmpty()) Button(onClick = { vm.show(view.legal.show) }, enabled = !ui.busy, modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
        Text(L("show_cards"), style = MaterialTheme.typography.titleMedium)
    }
}

// Choosing how much to bet or raise: the amount, quick amounts, a slider, Cancel and Bet.
@Composable
private fun BetPanel(vm: TableViewModel, ui: UiState, view: View, canAct: Boolean) {
    val legal = view.legal
    val hand = view.hand
    if (!legal.fold) return
    val toCall = legal.call
    val b = legal.bet ?: return
    val betTo = ui.betTo ?: return
    // What the amount chooser offers comes from the holdem-rules component's betting model.
    val range = BetLimits(b.min, b.max, b.opening)
    val step = betStep(hand?.sb)
    val presets = betPresets(range, hand?.potTotal ?: 0, toCall, hand?.currentBet ?: 0, hand?.sb)
    Panel {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(chips(betTo), color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            ChipButton(L("min")) { vm.setBetTo(b.min) }
            ChipButton(L("half_pot")) { vm.setBetTo(presets.halfPot) }
            ChipButton(L("pot")) { vm.setBetTo(presets.pot) }
            ChipButton(L("all_in")) { vm.setBetTo(presets.allIn) }
        }
        // Only with a range to slide over.
        if (range.canSlide(step)) Slider(value = betTo.toFloat(), onValueChange = { vm.setBetTo(range.snap(it, step)) }, valueRange = b.min.toFloat()..b.max.toFloat())
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { vm.setBetTo(null) }, modifier = Modifier.weight(1f)) { Text(L("cancel")) }
            Button(onClick = { vm.bet(betTo) }, enabled = canAct, modifier = Modifier.weight(1f)) {
                Text(if (range.kind(betTo) == BetKind.ALL_IN) L("all_in") else L(if (range.kind(betTo) == BetKind.BET) "bet_to" else "raise_to", chips(betTo)))
            }
        }
    }
}

@Composable
private fun ChipButton(label: String, onClick: () -> Unit) {
    Box(Modifier.padding(start = 4.dp).clip(RoundedCornerShape(999.dp)).background(Color.White.copy(alpha = 0.12f)).clickable(onClick = onClick).padding(horizontal = 10.dp, vertical = 6.dp)) {
        Text(label, color = Color.White, fontSize = 12.sp)
    }
}

// The possible hands for your cards, most likely first, each with its rank (1 is a royal flush)
// and the known cards that make it: yours underlined green, the community cards gold, the rest
// still to come red. Folds away with a tap; the choice is kept on this device.
@Composable
private fun HandPanel(vm: TableViewModel, ui: UiState, view: View, me: PlayerView) {
    if (!me.inHand || me.folded || me.cards.size != 2 || me.cards.any { it == null } || view.phase == Phase.HAND_OVER) return
    val open = ui.handPanel
    val rows = view.odds ?: emptyList()
    Panel(modifier = Modifier.guideAnchor("odds").clickable { vm.toggleHandPanel() }) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(L("hands_panel"), color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
            if (open) {
                Box(Modifier.size(14.dp, 3.dp).background(Good, RoundedCornerShape(2.dp)))
                Text(" " + L("in_hand") + "   ", color = Color.White.copy(alpha = 0.65f), fontSize = 11.sp)
                Box(Modifier.size(14.dp, 3.dp).background(MaterialTheme.colorScheme.primary, RoundedCornerShape(2.dp)))
                Text(" " + L("on_table") + "   ", color = Color.White.copy(alpha = 0.65f), fontSize = 11.sp)
                Box(Modifier.size(14.dp, 3.dp).background(MaterialTheme.colorScheme.error, RoundedCornerShape(2.dp)))
                Text(" " + L("waiting_for") + "  ", color = Color.White.copy(alpha = 0.65f), fontSize = 11.sp)
            }
            Text(if (open) "\u25BE" else "\u25B4", color = MaterialTheme.colorScheme.primary)
        }
        if (open) {
            Spacer(Modifier.height(6.dp))
            if (rows.isEmpty()) Text("\u2026", color = Color.White.copy(alpha = 0.6f))
            for (r in rows) {
                Column(Modifier.fillMaxWidth().padding(vertical = 3.dp), horizontalAlignment = Alignment.End) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text("#${r.rank}", color = Color.White.copy(alpha = 0.6f), fontSize = 11.sp, modifier = Modifier.width(30.dp))
                        Text(handCategory(r.category) + if (r.more) " (" + L("other_ways") + ")" else "", style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                        Text(percent(r.probability), color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodySmall)
                    }
                    // In reading order from the server: a straight low to high, pairs grouped, kickers last
                    // (a little dimmed); cards still to come as "K?" any king, "?♦" any diamond.
                    // The cards that make the hand inside a thin dotted box, the kickers after it.
                    // Community cards (on the board or still to come) a little higher than yours.
                    if (!r.more) Row(Modifier.padding(top = 2.dp), horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.Top) {
                        for ((core, run) in runs(r.cards)) {
                            Row(
                                (if (core) Modifier.dottedBox() else Modifier).padding(3.dp),
                                horizontalArrangement = Arrangement.spacedBy(3.dp), verticalAlignment = Alignment.Top,
                            ) {
                                for (c in run) {
                                    val code = c.code
                                    Box(Modifier.padding(top = if (c.from == "hole") 4.dp else 0.dp)) {
                                        if (code == null) NeededToken(c)
                                        // A kicker: underlined where it comes from like every card, a little dimmed.
                                        else CardToken(code, if (c.from == "hole") Good else MaterialTheme.colorScheme.primary, spare = c.spare)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

// Consecutive cards that make the hand (core) or are kickers.
private fun runs(cards: List<OddsCard>): List<Pair<Boolean, List<OddsCard>>> {
    val out = mutableListOf<Pair<Boolean, MutableList<OddsCard>>>()
    for (c in cards) {
        val last = out.lastOrNull()
        if (last != null && last.first == !c.spare) last.second.add(c) else out.add(!c.spare to mutableListOf(c))
    }
    return out
}

// A very thin dotted box around the cards that make a hand.
private fun Modifier.dottedBox(): Modifier = drawBehind {
    drawRoundRect(
        color = Color.White.copy(alpha = 0.7f),
        cornerRadius = CornerRadius(6.dp.toPx()),
        style = Stroke(width = 1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(2.dp.toPx(), 2.dp.toPx()))),
    )
}

// A card as a small text token, red or black, underlined green for yours and gold for the community cards.
@Composable
private fun NeededToken(nc: OddsCard) {
    val red = nc.suit == "h" || nc.suit == "d"
    val suit = when (nc.suit) { "c" -> "\u2663"; "d" -> "\u2666"; "h" -> "\u2665"; "s" -> "\u2660"; else -> if (nc.rank != null) "?" else "" }
    val rank = nc.rank?.let { rankLabel(it[0]) } ?: "?"
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.width(32.dp).clip(RoundedCornerShape(5.dp)).background(CardFace).padding(horizontal = 2.dp, vertical = 1.dp), contentAlignment = Alignment.Center) {
            Text(rank + suit, color = if (red) CardRed else Ink, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1, softWrap = false)
        }
        Box(Modifier.width(32.dp).height(3.dp).background(MaterialTheme.colorScheme.error, RoundedCornerShape(bottomStart = 2.dp, bottomEnd = 2.dp)))
    }
}

// Cards large over the screen; a tap outside them puts them away. The board in rows of three,
// one row per winning hand (named when the pot is split), one player's shown hand, or your own
// cards, whose gestures still work there (a double tap checks, a flick up folds) with your chips,
// Call or Bet and the bet panel below them; they stay large after a check or a call.
@Composable
private fun ZoomOverlay(vm: TableViewModel, ui: UiState, view: View, what: Zoom, now: Long, landing: Boolean) {
    // A row keeps where each card came from (community cards sit higher in a hand's combination),
    // where gaps go (before the kickers and before cards a hand does not use) and from which card on
    // the cards are a little dimmed (those not used).
    data class ZoomRow(val name: String?, val cards: List<String?>, val from: List<String>, val gaps: List<Int> = emptyList(), val dimFrom: Int = Int.MAX_VALUE)
    val sd = Showdown.of(view)
    val rows: List<ZoomRow> = when (what) {
        Zoom.BOARD -> (view.hand?.board ?: emptyList()).chunked(3).map { ZoomRow(null, it, it.map { "board" }) }
        Zoom.SHOWCASE -> sd?.let { s -> s.winners.map { w -> val best = w.hand?.best.orEmpty(); ZoomRow(if (s.kind == "draw") w.name else null, best.map { it.code }, best.map { it.from }, listOf(best.indexOfFirst { it.spare })) } } ?: emptyList()
        Zoom.HAND -> view.player(ui.zoomPlayer)?.takeIf { p -> p.cards.isNotEmpty() && p.cards.all { it != null } }?.let { p ->
            if (sd != null && sd.players.any { it.id == p.id } && !sd.isWinner(p.id)) {
                val (combo, unused) = ChallengeLayout.parts(p, false)
                listOf(ZoomRow(p.name, combo.map { it.code } + unused, combo.map { it.from } + unused.map { "hole" }, listOf(combo.indexOfFirst { it.spare }, if (unused.isEmpty()) -1 else combo.size), combo.size))
            } else listOf(ZoomRow(p.name, p.cards, p.cards.map { "hole" }))
        } ?: emptyList()
        Zoom.MINE, Zoom.FOLDED -> view.me?.cards?.takeIf { it.isNotEmpty() }?.let { listOf(ZoomRow(null, it, it.map { "hole" })) } ?: emptyList()
    }
    if (rows.isEmpty()) return
    val most = rows.maxOf { it.cards.size }
    val screen = LocalConfiguration.current.screenWidthDp
    val width = (screen * (if (most > 3) 0.17f else if (most > 2) 0.29f else 0.42f)).coerceAtMost(if (most > 3) 150f else 300f).dp
    val mine = what == Zoom.MINE
    val me = view.me
    val canAct = mine && view.legal.fold && !ui.busy && !landing
    val raised = what == Zoom.SHOWCASE || what == Zoom.HAND
    var dy by remember { mutableStateOf(0f) }
    Box(
        Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.7f)).pointerInput(what) { detectTapGestures(onTap = { vm.zoom(null) }) },
        contentAlignment = Alignment.Center,
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            if (canAct) MoveHints(view.legal.check, 15)
            Column(
                Modifier
                    .offset(y = minOf(0f, dy).dp)
                    .pointerInput(what, canAct, view.legal.check) {
                        if (mine) detectTapGestures(onTap = { vm.zoom(null) }, onDoubleTap = { if (canAct && view.legal.check) vm.check() })
                        else detectTapGestures(onTap = { vm.zoom(null) })
                    }
                    .pointerInput(what, canAct) {
                        if (mine) detectVerticalDragGestures(
                            onDragStart = { dy = 0f },
                            onVerticalDrag = { _, d -> dy += d / density },
                            onDragEnd = { if (canAct && dy < -40f) { vm.fold(); vm.zoom(null) }; dy = 0f },
                        )
                    },
                verticalArrangement = Arrangement.spacedBy(12.dp), horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                for (row in rows) {
                    if (row.name != null) Text(row.name, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    Row(horizontalArrangement = Arrangement.spacedBy(if (most > 3) 8.dp else 12.dp), verticalAlignment = Alignment.Top) {
                        row.cards.forEachIndexed { i, c ->
                            val from = row.from.getOrElse(i) { "hole" }
                            Column(
                                Modifier.padding(top = if (raised && from != "board") width * 1.4f * 0.2f else 0.dp, start = if (i > 0 && i in row.gaps) width * 0.2f else 0.dp)
                                    .graphicsLayer { alpha = if (i >= row.dimFrom) 0.85f else 1f },
                                verticalArrangement = Arrangement.spacedBy(5.dp),
                            ) {
                                PlayingCard(c, width)
                                Box(Modifier.size(width, 5.dp).clip(RoundedCornerShape(3.dp)).background(if (from == "hole") Good else MaterialTheme.colorScheme.primary))
                            }
                        }
                    }
                }
            }
            if (mine && me != null) {
                val hand = view.hand
                val myTurn = hand != null && hand.actorId == me.id && view.phase == Phase.BETTING && !view.paused
                val left = if (myTurn) remaining(hand?.remainingMs, ui.viewAt, now, false) else null
                if (left != null && left <= 30000) GrowingClock(left, 30000, now, width * 2 + 12.dp, 10.dp)
                if (canAct) Box(Modifier.padding(top = 6.dp)) { PlayButtons(vm, view, me, true, vertical = false) }
                Box(Modifier.widthIn(max = 440.dp).padding(horizontal = 16.dp)) { BetPanel(vm, ui, view, canAct) }
            }
        }
    }
}

// The level, the blinds and the time to the next level, in a card above the prompt; the blinds
// and the time in bold. Under it, who holds the play clock.
@Composable
private fun LevelCard(ui: UiState, view: View, now: Long) {
    val c = view.clock ?: return
    val left = remaining(c.nextLevelInMs, ui.viewAt, now, view.paused || view.phase == Phase.REBUY) ?: 0L
    val text = L("level", c.level) + " \u00B7 " + L("blinds", "\u0001" + chips(c.sb) + "\u0002", "\u0001" + chips(c.bb) + "\u0002") +
        " \u00B7 " + L("next_level", chips(c.nextSb), chips(c.nextBb), "\u0001" + mmss(left) + "\u0002")
    val styled = buildAnnotatedString {
        var bold = false
        for (part in text.split('\u0001', '\u0002')) {
            if (bold) withStyle(SpanStyle(fontWeight = FontWeight.Black, color = Color.White)) { append(part) } else append(part)
            bold = !bold
        }
    }
    val holds = view.holds.filter { it.playerId != view.you }
    Column(
        Modifier.fillMaxWidth().guideAnchor("level").clip(RoundedCornerShape(12.dp)).background(Color(0x33262420))
            .border(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.3f), RoundedCornerShape(12.dp)).padding(horizontal = 12.dp, vertical = 5.dp),
    ) {
        Text(styled, color = Color.White.copy(alpha = 0.85f), fontSize = 12.sp, maxLines = 1)
        for (x in holds) Text(L(if (x.kind == "look") "hold_look" else "hold_learn", view.name(x.playerId)), color = MaterialTheme.colorScheme.primary, fontSize = 11.sp)
    }
}

// Cards shown face up in front of a player at the end of a hand: community-card size, underlined green.
@Composable
private fun ShownHand(p: PlayerView, spot: ChallengeLayout.Spot, onTap: () -> Unit) {
    Column(
        Modifier.offset((spot.x - spot.width / 2).dp, (spot.y - spot.height / 2).dp).zIndex(5f)
            .clip(RoundedCornerShape(10.dp)).background(Color.Black.copy(alpha = 0.45f)).clickable(onClick = onTap).padding(6.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        if (spot.named) Text(p.name, color = MaterialTheme.colorScheme.primary, fontSize = 10.sp, lineHeight = 11.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            for (c in p.cards) Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                PlayingCard(c, 40.dp)
                Box(Modifier.size(40.dp, 3.dp).clip(RoundedCornerShape(2.dp)).background(Good))
            }
        }
    }
}

// The time to the next hand, shrinking.
@Composable
private fun NextHandBar(left: Long?, total: Long) {
    if (left == null || left > total) return
    Box(Modifier.padding(top = 4.dp).size(60.dp, 4.dp).clip(RoundedCornerShape(2.dp)).background(Color.White.copy(alpha = 0.15f))) {
        Box(Modifier.size((60f * left / maxOf(1L, total)).dp, 4.dp).clip(RoundedCornerShape(2.dp)).background(MaterialTheme.colorScheme.primary))
    }
}

// A shown hand by its seat at a showdown: the combination in reading order, cards from the hand
// nudged toward the table's edge and underlined green, the board's nudged toward the middle and
// underlined gold, then any deciding kickers; after a gap, the hand's cards it does not use,
// greyed. A winner's hand is over the pot ring, so only its unused cards stay. The row sits under the seat's
// text; above the monitor for seats on the upper sides, whose text runs down to the board, and for
// seats at the very bottom; yours above your seat. Kept inside the table's width.
@Composable
private fun ChallengeRow(p: PlayerView, winner: Boolean, k: Int, n: Int, spot: ChallengeLayout.Spot, onTap: () -> Unit) {
    val (combo, unused) = ChallengeLayout.parts(p, winner)
    if (combo.isEmpty() && unused.isEmpty()) return
    val seat = Spots.seat(k, n)
    // A seat level with the middle counts as lower.
    val outward = if (k != 0 && seat.y < 0.495f) -1 else 1
    Column(
        Modifier.offset((spot.x - spot.width / 2).dp, (spot.y - spot.height / 2).dp).width(spot.width.dp).zIndex(5f)
            .clip(RoundedCornerShape(10.dp)).background(Color.Black.copy(alpha = 0.45f)).clickable(onClick = onTap).padding(horizontal = 6.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        // A row that had to go away from its seat says whose hand it is.
        if (spot.named) Text(p.name, color = MaterialTheme.colorScheme.primary, fontSize = 10.sp, lineHeight = 11.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
        Row(Modifier.height(27.dp), horizontalArrangement = Arrangement.spacedBy(3.dp), verticalAlignment = Alignment.CenterVertically) {
            combo.forEachIndexed { i, c ->
                Box(Modifier.padding(start = if (c.spare && i > 0 && !combo[i - 1].spare) 6.dp else 0.dp).offset(y = ((if (c.from == "hole") outward else -outward) * 4).dp)) { CardToken(c.code ?: "", if (c.from == "hole") Good else MaterialTheme.colorScheme.primary) }
            }
            if (combo.isNotEmpty() && unused.isNotEmpty()) Spacer(Modifier.width(5.dp))
            // Cards the hand does not use: still underlined green (they are the player's), a little dimmed.
            for (c in unused) CardToken(c, Good, spare = true)
        }
    }
}

@Composable
private fun CardToken(code: String, underline: Color, spare: Boolean = false) {
    val red = code[1] == 'h' || code[1] == 'd'
    val suit = when (code[1]) { 'c' -> "\u2663"; 'd' -> "\u2666"; 'h' -> "\u2665"; else -> "\u2660" }
    Column(Modifier.graphicsLayer { alpha = if (spare) 0.85f else 1f }, horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.width(32.dp).clip(RoundedCornerShape(5.dp)).background(CardFace).padding(horizontal = 2.dp, vertical = 1.dp), contentAlignment = Alignment.Center) {
            Text(rankLabel(code[0]) + suit, color = if (red) CardRed else Ink, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1, softWrap = false)
        }
        Box(Modifier.width(32.dp).height(3.dp).background(underline, RoundedCornerShape(bottomStart = 2.dp, bottomEnd = 2.dp)))
    }
}

@Composable
private fun rankLabel(c: Char): String {
    val ctx = LocalContext.current
    val id = if (c in "TJQKA") ctx.resources.getIdentifier("rank_$c", "string", ctx.packageName) else 0
    return if (id != 0) ctx.getString(id) else c.toString()
}

@Composable
private fun handCategory(category: String): String {
    val ctx = LocalContext.current
    val id = ctx.resources.getIdentifier("hand_$category", "string", ctx.packageName)
    return if (id != 0) ctx.getString(id) else category
}

private fun percent(p: Double): String = when {
    p >= 0.1 -> "${Math.round(p * 100)}%"
    p >= 0.0005 -> "%.1f%%".format(p * 100)
    else -> "<0.1%"
}

// Who won what, while the result is on show.
@Composable
private fun ResultPanel(vm: TableViewModel, ui: UiState, view: View) {
    if (view.phase != Phase.HAND_OVER) return
    val r = view.lastResult ?: return
    Panel {
        if (r.voided) Text(L("voided"), style = MaterialTheme.typography.bodySmall)
        for ((i, p) in r.pots.withIndex()) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(L(if (i == 0) "pot_label" else "side_pot", chips(p.amount)), style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.7f))
                Text(p.winners.joinToString(", ") { w -> "${view.name(w.playerId)} +${chips(w.amount)}" + (w.handName?.let { " ($it)" } ?: "") }, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(start = 8.dp))
            }
        }
    }
}

@Composable
private fun Controls(vm: TableViewModel, ui: UiState, view: View) {
    val legal = view.legal
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        if (legal.pause) TextButton(onClick = vm::pause, enabled = !ui.busy) { Text(L("pause")) }
        if (legal.resume) TextButton(onClick = vm::resume, enabled = !ui.busy) { Text(L("resume")) }
    }
}

@Composable
private fun RebuyDialog(vm: TableViewModel, ui: UiState, view: View, now: Long) {
    val offer = view.rebuyOffers.firstOrNull { it.playerId == view.you }
    val left = remaining(offer?.remainingMs, ui.viewAt, now, view.paused) ?: 0L
    AlertDialog(
        onDismissRequest = {},
        title = { Text(L("rebuy_title")) },
        text = {
            Column {
                Text(L("rebuy_body", ((left + 999) / 1000).toString()))
                Spacer(Modifier.height(8.dp))
                LinearProgressIndicator(progress = { (left / 30000f).coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth())
            }
        },
        confirmButton = { Button(onClick = { vm.rebuy(true) }, enabled = !ui.busy) { Text(L("rebuy_yes")) } },
        dismissButton = { TextButton(onClick = { vm.rebuy(false) }, enabled = !ui.busy) { Text(L("rebuy_no")) } },
    )
}
