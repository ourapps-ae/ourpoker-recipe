package app.ourapps.ourpoker.net

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive

// Mirrors server/src/contract.ts. Unknown enum strings decode to UNKNOWN.
val json = Json {
    ignoreUnknownKeys = true
    coerceInputValues = true
    explicitNulls = false
}

@Serializable
enum class Status {
    @SerialName("lobby") LOBBY,
    @SerialName("running") RUNNING,
    @SerialName("completed") COMPLETED,
    @SerialName("cancelled") CANCELLED,
    UNKNOWN,
}

@Serializable
enum class Phase {
    @SerialName("lobby") LOBBY,
    @SerialName("betting") BETTING,
    @SerialName("runout") RUNOUT,
    @SerialName("handOver") HAND_OVER,
    @SerialName("rebuy") REBUY,
    @SerialName("completed") COMPLETED,
    @SerialName("cancelled") CANCELLED,
    UNKNOWN,
}

@Serializable
data class LastAction(val kind: String, val amount: Int? = null, val auto: Boolean = false)

@Serializable
// best: the combination's cards in reading order, from the hand or the board, then (spare) the
// kickers that decided the showdown.
data class HandRank(val category: String, val ranks: List<Int>, val name: String, val best: List<OddsCard>? = null)

@Serializable
data class PlayerView(
    val id: String,
    val name: String,
    val seat: Int,
    val isBot: Boolean = false,
    val isHost: Boolean = false,
    val stack: Int,
    val bet: Int = 0,
    val totalIn: Int = 0,
    val inHand: Boolean = false,
    val folded: Boolean = false,
    val allIn: Boolean = false,
    // null entries are face down.
    val cards: List<String?> = emptyList(),
    val status: String = "in",
    val place: Int? = null,
    val connected: Boolean = true,
    val sittingOut: Boolean = false,
    val rebuysUsed: Int = 0,
    val lastAction: LastAction? = null,
    val hand: HandRank? = null,
) {
    val out: Boolean get() = status == "out"
}

@Serializable
data class PotView(val amount: Int, val eligible: List<String> = emptyList())

@Serializable
data class HandView(
    val no: Int,
    val level: Int,
    val sb: Int,
    val bb: Int,
    val button: Int,
    val sbSeat: Int,
    val bbSeat: Int,
    val street: String,
    val board: List<String>,
    val pots: List<PotView>,
    val potTotal: Int,
    val currentBet: Int,
    val actorId: String? = null,
    val remainingMs: Long? = null,
    val settleMs: Long? = null,
    val event: String? = null,
    val lastActorId: String? = null,
)

@Serializable
data class WinnerView(val playerId: String, val amount: Int, val handName: String? = null)

@Serializable
data class ResultPot(val amount: Int, val winners: List<WinnerView>)

@Serializable
data class HandResultView(val no: Int, val board: List<String>, val pots: List<ResultPot>, val uncontested: Boolean, val voided: Boolean, val showdown: ShowdownView? = null, val holdMs: Long? = null)

// How the main pot was won at a showdown: "combination", "kicker" or "draw"; per hand, how many
// kickers its shown cards include.
@Serializable
data class ShowdownView(val kind: String, val winners: List<String>, val kickers: Map<String, Int> = emptyMap())

@Serializable
data class ClockView(val level: Int, val sb: Int, val bb: Int, val nextSb: Int, val nextBb: Int, val nextLevelInMs: Long, val levelDurationMs: Long)

@Serializable
data class RebuyOfferView(val playerId: String, val remainingMs: Long)

// A card of a possible hand in reading order: known (`code`) or still needed (code null, rank
// and suit as far as known); spare cards are kickers outside the pattern.
@Serializable
data class OddsCard(val code: String? = null, val rank: String? = null, val suit: String? = null, val from: String = "board", val spare: Boolean = false)

@Serializable
data class OddsRow(val category: String, val rank: Int, val probability: Double, val cards: List<OddsCard> = emptyList(), val more: Boolean = false)

@Serializable
data class BetRange(val min: Int, val max: Int, val opening: Boolean = false)

@Serializable
data class Legal(
    val start: Boolean = false,
    val addBot: Boolean = false,
    val kick: Boolean = false,
    val leave: Boolean = false,
    val sitOut: Boolean = false,
    @SerialName("return") val back: Boolean = false,
    val fold: Boolean = false,
    val check: Boolean = false,
    val call: Int? = null,
    val bet: BetRange? = null,
    val rebuy: Boolean = false,
    val show: List<Int> = emptyList(),
    val pause: Boolean = false,
    val resume: Boolean = false,
    val cancel: Boolean = false,
    val newGame: Boolean = false,
)

@Serializable
data class HistoryEntry(val no: Int, val level: Int, val winners: List<HistoryWinner>, val voided: Boolean)

@Serializable
data class HistoryWinner(val playerId: String, val amount: Int)

// What a live connection sends: a view of the room, the home list, or an error.
@Serializable
data class LiveMessage(val type: String, val view: View? = null, val rooms: List<RoomInfo>? = null, val error: String? = null)

@Serializable
data class RoomInfo(val id: String, val status: Status = Status.UNKNOWN, val playerCount: Int, val names: List<String>)

@Serializable
data class View(
    val contractVersion: Int,
    val version: Int,
    val gameNumber: Int,
    val roomId: String = "",
    val you: String,
    val status: Status = Status.UNKNOWN,
    val phase: Phase = Phase.UNKNOWN,
    val pauseReasons: List<String> = emptyList(),
    val hostId: String? = null,
    val players: List<PlayerView>,
    val hand: HandView? = null,
    val lastResult: HandResultView? = null,
    val clock: ClockView? = null,
    val rebuyOffers: List<RebuyOfferView> = emptyList(),
    val winnerId: String? = null,
    val history: List<HistoryEntry> = emptyList(),
    val odds: List<OddsRow>? = null,
    val legal: Legal,
    val prompt: String,
    val promptKey: String = "",
    val promptArgs: List<JsonPrimitive> = emptyList(),
    val inviteUrl: String? = null,
    // A table viewer's view (the iPad in the middle of the table).
    val display: Boolean = false,
    // Players holding the play clock (looking at cards, reading a guide); every countdown waits.
    val holds: List<ClockHold> = emptyList(),
) {
    val held: Boolean get() = holds.isNotEmpty()
    fun player(id: String?): PlayerView? = players.firstOrNull { it.id == id }
    fun name(id: String?): String = player(id)?.name ?: "someone"
    val me: PlayerView? get() = player(you)
    val paused: Boolean get() = pauseReasons.isNotEmpty()
}

@Serializable
data class ClockHold(val playerId: String, val kind: String)

@Serializable
data class VideoGrant(val url: String, val token: String, val room: String)

@Serializable
data class UpdateInfo(val name: String = "", val version: String, val android: AndroidUpdate? = null)

@Serializable
data class AndroidUpdate(val apkUrl: String)

@Serializable
data class JoinResponse(val token: String, val playerId: String, val spectator: Boolean = false, val view: View, val video: VideoGrant? = null)

@Serializable
data class ErrorBody(val error: String, val message: String, val view: View? = null)

const val CONTRACT_VERSION = 1
