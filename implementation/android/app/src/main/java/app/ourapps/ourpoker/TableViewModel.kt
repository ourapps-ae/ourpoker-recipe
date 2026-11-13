package app.ourapps.ourpoker

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.ourapps.ourpoker.net.ApiException
import app.ourapps.ourpoker.net.RoomInfo
import app.ourapps.ourpoker.net.TableClient
import app.ourapps.ourpoker.net.UpdateInfo
import app.ourapps.ourpoker.net.VideoGrant
import app.ourapps.ourpoker.net.View
import ae.display.DisplayPolicy
import app.ourapps.ourpoker.ui.Lessons
import kotlinx.coroutines.Job
import app.ourapps.ourpoker.ui.GuideId
import app.ourapps.ourpoker.net.Status
import app.ourapps.ourpoker.net.Phase
import okhttp3.WebSocket
import kotlinx.coroutines.isActive
import kotlinx.coroutines.CancellationException
import app.ourapps.ourpoker.net.json
import app.ourapps.ourpoker.net.LiveMessage
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlin.math.min

data class UiError(val code: String?, val message: String?)

data class UiState(
    val token: String? = null,
    val roomId: String? = null,
    val name: String = "",
    val view: View? = null,
    // Wall-clock time the view arrived, so countdowns can run from remainingMs.
    val viewAt: Long = 0,
    val error: UiError? = null,
    val busy: Boolean = false,
    val rooms: List<RoomInfo>? = null,
    // The last room list request failed: the server cannot be reached.
    val roomsDown: Boolean = false,
    val help: Boolean = false,
    val editingName: Boolean = false,
    val previewRoom: String = "casino",
    // Bet slider value while choosing an amount; null when closed.
    val betTo: Int? = null,
    val update: UpdateInfo? = null,
    val updateDismissed: Boolean = false,
    // The possible-hands panel under the table; remembered on this device, open by default.
    val handPanel: Boolean = true,
    val beginner: Boolean? = null,
    // Cards shown large over the screen until tapped away; null when none. Whose shown hand,
    // for Zoom.HAND.
    val zoom: Zoom? = null,
    val zoomPlayer: String = "",
    // A guide is open (the guided-tour component holds the queue); the play clock is held while it is.
    val guiding: Boolean = false,
)

// What is shown large: the community cards, the winning hands, or your own cards (live ones keep
// their check and fold gestures there).
enum class Zoom { BOARD, SHOWCASE, MINE, FOLDED, HAND }

class TableViewModel(app: Application) : AndroidViewModel(app) {
    private val prefs = app.getSharedPreferences("ourpoker", 0).also { forgetSeatAfterInstall(app, it) }
    private val client = TableClient(AppSettings.SERVER_URL)
    val video = Video(app) { DisplayPolicy.canCapture(false) }
    // Video grant from the last join; reconnects after a relaunch need a fresh join, so it is kept in memory only.
    private var grant: VideoGrant? = null
        set(value) { field = value; _hasVideo.value = value != null }
    // This seat may use video (the server gave a grant), and whether camera permission was given.
    private val _hasVideo = MutableStateFlow(false)
    val hasVideo: StateFlow<Boolean> = _hasVideo
    private val _permitted = MutableStateFlow(false)
    val permitted: StateFlow<Boolean> = _permitted
    var permissionsGranted = false
        set(value) { field = value; _permitted.value = value; if (value) connectVideo() }
    // Asks for the camera and microphone; set by the activity, called when the person turns video on.
    var askForMedia: () -> Unit = {}
    val sound = SoundSetting(prefs)
    // Lessons run by the guided-tour component (ui/Lessons.kt).
    val tour = Lessons(app, prefs)
    private val _state = MutableStateFlow(
        UiState(token = prefs.getString("token", null), roomId = prefs.getString("roomId", null), name = prefs.getString("name", "") ?: "", handPanel = prefs.getBoolean("handPanel", true), beginner = tour.enabled),
    )
    val state: StateFlow<UiState> = _state
    // The room's live connection while seated, and the home list's while the home screen shows;
    // closed in the background, reopened in the foreground.
    private var live: Job? = null
    private var liveSocket: WebSocket? = null
    private var home: Job? = null
    private var homeWanted = false
    // Seated (joined or rejoined) in this run of the app, so the stored token is good to connect
    // with; a relaunch rejoins by name first. Video may be off, so the grant cannot tell.
    private var seated = false
    private var idleCut: Job? = null
    private val idleLimitMs = 5 * 60 * 1000L

    init {
        Sound.enabled = sound.on.value
        video.setSpeaker(sound.on.value)
        // Relaunch: rejoin by name first so the seat token and video grant are fresh, then connect.
        if (_state.value.token != null) refreshVideoGrant()
    }

    // Home screen: who is in each room, live while it shows. A connection that cannot be made
    // says the server cannot be reached.
    fun watchRooms(on: Boolean) {
        homeWanted = on
        if (on && foreground) openHome() else { home?.cancel(); home = null }
    }

    private fun openHome() {
        if (home?.isActive == true) return
        home = viewModelScope.launch {
            var retry = 1000L
            while (isActive) {
                var heard = false
                try {
                    client.connect("/rooms/ws", null).collect { text ->
                        heard = true
                        retry = 1000L
                        runCatching { json.decodeFromString(LiveMessage.serializer(), text) }.getOrNull()?.rooms?.let { r ->
                            _state.update { it.copy(rooms = r, roomsDown = false) }
                        }
                    }
                } catch (e: CancellationException) {
                    throw e
                } catch (_: Exception) {
                }
                if (!heard) _state.update { it.copy(roomsDown = true) }
                delay(retry)
                retry = min(retry * 2, 30_000L)
            }
        }
    }

    // Ask the server (which relays the store) for the newest release.
    fun checkForUpdate() = viewModelScope.launch {
        if (!AppSettings.UPDATES_ENABLED) return@launch
        runCatching { client.update() }.onSuccess { info ->
            if (newerRelease(info.version, currentVersion)) _state.update { it.copy(update = info) }
        }
    }

    fun dismissUpdate() = _state.update { it.copy(updateDismissed = true) }
    val currentVersion: String = runCatching { app.packageManager.getPackageInfo(app.packageName, 0).versionName }.getOrNull() ?: "0.0.0-dev"

    fun showHelp(show: Boolean) = _state.update { it.copy(help = show) }
    fun preview(roomId: String) = _state.update { it.copy(previewRoom = roomId) }
    fun setBetTo(to: Int?) = _state.update { it.copy(betTo = to) }

    fun setSound(on: Boolean) {
        sound.set(on)
        Sound.enabled = on
        video.setSpeaker(on)
        Sound.play(SoundName.CLICK)
    }

    // The possible hands come with every view while the panel is open; the room is told at once.
    fun toggleHandPanel() {
        val open = !_state.value.handPanel
        prefs.edit().putBoolean("handPanel", open).apply()
        _state.update { it.copy(handPanel = open) }
        liveSocket?.send("""{"type":"odds","on":$open}""")
    }
    fun editName(edit: Boolean) = _state.update { it.copy(editingName = edit) }

    // At the end of a hand, looking at cards large holds the play clock for everyone.
    fun zoom(what: Zoom?, playerId: String = "") {
        _state.update { it.copy(zoom = what, zoomPlayer = playerId) }
        updateHold()
    }

    // Guides: each shown once ever, one at a time (the guided-tour component keeps the queue).
    fun want(id: GuideId) {
        tour.want(id.key)
        updateHold()
    }
    fun guideDone() {
        tour.skip()
        updateHold()
    }
    // Guides for one screen go when another screen shows.
    fun onScreen(screen: String) {
        tour.screenChanged(screen)
        updateHold()
    }

    // The play clock this device holds for everyone: while cards are looked at large at the end
    // of a hand ("look") or a guide is open at the table ("learn").
    private var hold: String? = null
    private fun updateHold() {
        val s = _state.value
        val v = s.view
        val want = if (v == null || v.status != Status.RUNNING || v.display || s.token == null) null
            else if (tour.holding) "learn" else if (s.zoom != null && v.phase == Phase.HAND_OVER) "look" else null
        if (want == hold) return
        hold = want
        liveSocket?.send(if (want == null) """{"type":"hold","kind":null}""" else """{"type":"hold","kind":"$want"}""")
    }

    // A new view: sounds for what others and the table did, guides for what happens first.
    private fun onNewView(prev: View?, v: View) {
        sounds(prev, v)
        for (g in GuideId.forTable(v)) want(g)
        updateHold()
    }

    private var lastActionKey = ""
    private fun sounds(prev: View?, view: View) {
        val hand = view.hand ?: return
        if (prev == null || prev.gameNumber != view.gameNumber || prev.roomId != view.roomId) return
        val ph = prev.hand
        val sameHand = ph?.no == hand.no
        if (!sameHand) Sound.play(SoundName.DEAL)
        else if (hand.board.size > (ph?.board?.size ?: 0)) { Sound.play(SoundName.BURN); Sound.play(SoundName.FLIP, 300) }
        val id = hand.lastActorId
        if (hand.event == "action" && id != null && id != view.you) {
            val p = view.player(id)
            val a = p?.lastAction
            val key = "${hand.no}|${hand.street}|$id|${a?.kind}|${p?.bet}|${p?.totalIn}"
            if (p != null && a != null && key != lastActionKey) {
                lastActionKey = key
                Sound.play(when (a.kind) { "check" -> SoundName.CHECK; "fold" -> SoundName.FOLD; "allIn" -> SoundName.ALLIN; else -> SoundName.CHIPS })
            }
        }
        if (view.phase == Phase.HAND_OVER && prev.phase != Phase.HAND_OVER) Sound.play(SoundName.WIN, 500)
        val mine = view.phase == Phase.BETTING && hand.actorId == view.you
        val wasMine = sameHand && prev.phase == Phase.BETTING && ph?.actorId == view.you
        if (mine && !wasMine) Sound.play(SoundName.TURN)
    }

    // Every guide shows again, each the next time its screen asks for it; the home one now.
    fun resetGuides() {
        tour.reset()
        _state.update { it.copy(beginner = true, handPanel = true) }
        prefs.edit().putBoolean("handPanel", true).apply()
        want(GuideId.HOME)
    }

    fun chooseBeginner(beginner: Boolean) {
        tour.setEnabled(beginner)
        prefs.edit().putBoolean("handPanel", beginner).apply()
        _state.update { it.copy(beginner = beginner, handPanel = beginner) }
        if (beginner) want(GuideId.HOME)
        updateHold()
    }

    private var warnedTurn: String? = null
    fun warnIfTimeIsShort(now: Long) {
        val ui = _state.value
        val v = ui.view ?: return
        val h = v.hand ?: return
        if (v.phase != Phase.BETTING || h.actorId != v.you) { warnedTurn = null; return }
        if (v.held || v.paused) return
        val left = (h.remainingMs ?: return) - (now - ui.viewAt)
        val turn = "${v.gameNumber}|${h.no}|${h.street}|${h.actorId}"
        if (left in 1..6000 && warnedTurn != turn) {
            warnedTurn = turn
            Sound.play(SoundName.TURN)
            Sound.play(SoundName.TURN, 220)
        }
    }

    // The display name is entered once and kept on the phone.
    fun setName(name: String) {
        prefs.edit().putString("name", name.trim()).apply()
        _state.update { it.copy(name = name.trim(), editingName = false) }
    }

    fun join(roomId: String) = viewModelScope.launch {
        Sound.play(SoundName.ENTER)
        val name = _state.value.name
        _state.update { it.copy(busy = true, error = null) }
        try {
            // The seat token kept for this room: the only way back to a seat.
            val held = if (_state.value.roomId == roomId) _state.value.token else null
            val r = client.join(roomId, name, held)
            prefs.edit().putString("token", r.token).putString("roomId", roomId).apply()
            _state.update { it.copy(token = r.token, roomId = roomId, view = r.view, viewAt = System.currentTimeMillis(), busy = false, betTo = null) }
            grant = r.video
            seated = true
            connectVideo()
            openRoom()
        } catch (e: ApiException) {
            _state.update { it.copy(busy = false, error = UiError(e.code, e.message)) }
        } catch (e: Exception) {
            _state.update { it.copy(busy = false, error = UiError("network", e.message)) }
        }
    }

    fun act(type: String, fields: Map<String, Any> = emptyMap()) = viewModelScope.launch {
        if (!DisplayPolicy.canAct(false)) return@launch
        val token = _state.value.token ?: return@launch
        val roomId = _state.value.roomId ?: return@launch
        val view = _state.value.view ?: return@launch
        val version = view.version
        // What each of your own actions sounds like, played as you tap.
        val me = view.me
        val allIn = me != null && ((type == "call" && (view.legal.call ?: 0) >= me.stack) || (type == "bet" && ((fields["to"] as? Int) ?: 0) >= me.stack + me.bet))
        val sound = if (allIn) SoundName.ALLIN else when (type) {
            "fold" -> SoundName.FOLD; "check" -> SoundName.CHECK; "call", "bet", "rebuy" -> SoundName.CHIPS; "show" -> SoundName.FLIP
            "start", "newGame" -> SoundName.START; "cancel" -> SoundName.END; "addBot" -> SoundName.BOT_ADD; "kick" -> SoundName.BOT_REMOVE
            else -> SoundName.CLICK
        }
        Sound.play(sound)
        _state.update { it.copy(busy = true, error = null, betTo = null) }
        try {
            val v = client.action(roomId, token, version, type, fields, _state.value.handPanel)
            val prev = _state.value.view
            _state.update { if (newer(v, it.view)) it.withView(v).copy(busy = false) else it.copy(busy = false) }
            if (newer(v, prev)) onNewView(prev, v)
        } catch (e: ApiException) {
            if (e.status == 401) return@launch signOut(UiError("tableReset", null))
            _state.update { (e.view?.let { v -> it.withView(v) } ?: it.copy(viewAt = System.currentTimeMillis())).copy(busy = false, error = if (e.code == "staleVersion") null else UiError(e.code, e.message)) }
        } catch (e: Exception) {
            _state.update { it.copy(busy = false, error = UiError("network", e.message)) }
        }
    }

    fun fold() = act("fold")
    fun check() = act("check")
    fun call() = act("call")
    fun bet(to: Int) = act("bet", mapOf("to" to to))
    fun rebuy(accept: Boolean) = act("rebuy", mapOf("accept" to accept))
    fun show(cards: List<Int>) = act("show", mapOf("cards" to cards))
    fun addBot() = act("addBot")
    fun kick(playerId: String) = act("kick", mapOf("playerId" to playerId))
    fun start() = act("start")
    fun sitOut() = act("sitOut")
    fun back() = act("return")
    fun pause() = act("pause")
    fun resume() = act("resume")
    fun cancel() = act("cancel")
    fun newGame() = act("newGame")

    // Leaving tells the table (seat given up, or sit out when a game runs) and goes home. The
    // room's connection ends first, so its goodbye is not taken for a reset table.
    fun leave() = viewModelScope.launch {
        Sound.play(SoundName.EXIT)
        live?.cancel()
        live = null
        val token = _state.value.token
        val roomId = _state.value.roomId
        val version = _state.value.view?.version
        if (token != null && roomId != null && version != null) runCatching { client.action(roomId, token, version, "leave") }
        signOut()
    }

    fun clearError() = _state.update { it.copy(error = null) }

    // Every table change restarts the clock; silence for the limit cuts the video.
    private fun armIdleCut() {
        idleCut?.cancel()
        idleCut = viewModelScope.launch {
            delay(idleLimitMs)
            video.pauseForIdle()
        }
    }

    fun resumeVideo() {
        video.resumeFromPause()
        armIdleCut()
    }

    private fun connectVideo() {
        val g = grant ?: return
        if (permissionsGranted) video.connect(g.url, g.token, g.room)
    }

    // A relaunched app has a seat token but no video grant: rejoin by name to get one.
    fun refreshVideoGrant() {
        val roomId = _state.value.roomId ?: return
        if (seated || _state.value.name.isEmpty()) {
            openRoom()
            return
        }
        viewModelScope.launch {
            for (attempt in 0 until 5) {
                try {
                    val r = client.join(roomId, _state.value.name, _state.value.token)
                    prefs.edit().putString("token", r.token).apply()
                    _state.update { it.withView(r.view).copy(token = r.token) }
                    grant = r.video
                    seated = true
                    connectVideo()
                    openRoom()
                    return@launch
                } catch (e: ApiException) {
                    if (e.status == 401 || e.status == 409) return@launch signOut()
                    delay((1L shl attempt) * 1000)
                } catch (e: Exception) {
                    delay((1L shl attempt) * 1000)
                }
            }
            openRoom()
        }
    }

    fun signOut(error: UiError? = null) {
        seated = false
        live?.cancel()
        live = null
        idleCut?.cancel()
        video.forget()
        grant = null
        prefs.edit().remove("token").remove("roomId").apply()
        _state.update { UiState(error = error, name = it.name, handPanel = prefs.getBoolean("handPanel", true), beginner = tour.enabled) }
    }

    // Connections close while the app is in the background; the foreground reopens them at once.
    var foreground = true
        private set

    fun resumed() {
        foreground = true
        if (seated) openRoom()
        if (homeWanted) openHome()
        video.foreground()
    }

    // Background: the connections close, which tells the table at once that we are away (the
    // host pause depends on it); the away call covers a close that does not get out in time.
    fun paused() {
        foreground = false
        live?.cancel()
        live = null
        home?.cancel()
        video.background()
        val token = _state.value.token
        val roomId = _state.value.roomId
        if (token != null && roomId != null) viewModelScope.launch { client.away(roomId, token) }
    }

    override fun onCleared() = video.close()

    // The room's live connection: it says who we are (and whether the possible hands are
    // wanted), then every change arrives as a view. A token the room no longer knows ends the seat.
    private fun openRoom() {
        live?.cancel()
        if (!foreground) return
        live = viewModelScope.launch {
            var retry = 1000L
            while (isActive) {
                val token = _state.value.token ?: return@launch
                val roomId = _state.value.roomId ?: return@launch
                val holdJson = hold?.let { "\"$it\"" } ?: "null"
                val hello = """{"type":"hello","token":"$token","odds":${_state.value.handPanel},"hold":$holdJson}"""
                try {
                    client.connect("/r/$roomId/ws", hello) { liveSocket = it }.collect { text ->
                        retry = 1000L
                        val m = runCatching { json.decodeFromString(LiveMessage.serializer(), text) }.getOrNull() ?: return@collect
                        when (m.type) {
                            "error" -> return@collect signOut(UiError("tableReset", null))
                            "view" -> m.view?.let { v ->
                                val prev = _state.value.view
                                if (newer(v, prev)) {
                                    _state.update { it.withView(v) }
                                    onNewView(prev, v)
                                    armIdleCut()
                                }
                            }
                        }
                    }
                } catch (e: CancellationException) {
                    throw e
                } catch (_: Exception) {
                }
                delay(retry)
                retry = min(retry * 2, 30_000L)
            }
        }
    }
}

// A new view; an amount being chosen goes once betting is no longer open to you.
private fun UiState.withView(v: View): UiState = copy(view = v, viewAt = System.currentTimeMillis(), betTo = if (v.legal.bet == null) null else betTo)

// A view only replaces one from the same room with a lower version: an action's reply and the
// pushed view can arrive in either order.
private fun newer(v: View, current: View?): Boolean = current == null || current.roomId != v.roomId || v.version > current.version

// A new install (a new version, or the same one installed again) starts at the room list: the seat remembered by the
// previous install is forgotten, so the app does not open at a table the person left long ago.
private fun forgetSeatAfterInstall(app: Application, prefs: android.content.SharedPreferences) {
    val installed = runCatching { app.packageManager.getPackageInfo(app.packageName, 0).lastUpdateTime }.getOrDefault(0L)
    if (prefs.getLong("installedAt", -1L) == installed) return
    prefs.edit().remove("token").remove("roomId").putLong("installedAt", installed).apply()
}
