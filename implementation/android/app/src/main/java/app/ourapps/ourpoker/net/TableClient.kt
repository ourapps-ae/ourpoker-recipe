package app.ourapps.ourpoker.net

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.io.IOException
import java.util.concurrent.TimeUnit

class ApiException(val status: Int, val code: String, message: String, val view: View?) : IOException(message)

// A live connection ended; code 1000 is a normal close.
typealias LiveClosed = ae.rooms.LiveClosed

class TableClient(private val baseUrl: String) {
    private val http = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(35, TimeUnit.SECONDS)
        .build()
    private val jsonType = "application/json".toMediaType()
    // Live connections stay open; a protocol ping every 20 s finds a dead one, and a text "ping"
    // every 25 s tells the server we are still here (it answers without waking the room).
    private val transport = ae.rooms.RoomTransport(baseUrl)

    // Messages from a live connection at path, sending hello first when given; ends when it
    // closes. `opened` gets the connection, for sending on it.
    fun connect(path: String, hello: String?, opened: (WebSocket?) -> Unit = {}): Flow<String> = transport.connect(path, hello, opened)

    // Store route relayed by the server: the newest published version and where to get it.
    suspend fun update(): UpdateInfo {
        val req = Request.Builder().url("$baseUrl/update").build()
        return json.decodeFromString(UpdateInfo.serializer(), send(req))
    }

    // `token`: the seat token this device holds for the room; a name in use is given back only with it.
    suspend fun join(roomId: String, name: String, token: String? = null): JoinResponse {
        val body = buildJsonObject { put("name", name) }
        val builder = Request.Builder().url("$baseUrl/r/$roomId/join").post(body.toString().toRequestBody(jsonType))
        if (token != null) builder.header("Authorization", "Bearer $token")
        val req = builder.build()
        return json.decodeFromString(JoinResponse.serializer(), send(req))
    }

    // Tells the table we are gone; errors do not matter.
    suspend fun away(roomId: String, token: String) {
        val req = Request.Builder().url("$baseUrl/r/$roomId/away").header("Authorization", "Bearer $token").post("".toRequestBody(jsonType)).build()
        runCatching { send(req) }
    }

    suspend fun action(roomId: String, token: String, expectedVersion: Int, type: String, fields: Map<String, Any> = emptyMap(), odds: Boolean = false): View {
        val body = buildJsonObject {
            put("type", type)
            put("expectedVersion", expectedVersion)
            put("odds", odds)
            for ((k, v) in fields) when (v) {
                is Int -> put(k, v)
                is Boolean -> put(k, v)
                is List<*> -> put(k, JsonArray(v.map { JsonPrimitive(it as Int) }))
                else -> put(k, v.toString())
            }
        }
        val req = Request.Builder().url("$baseUrl/r/$roomId/action")
            .header("Authorization", "Bearer $token")
            .post(body.toString().toRequestBody(jsonType)).build()
        return json.decodeFromString(View.serializer(), send(req))
    }

    private suspend fun send(req: Request): String = withContext(Dispatchers.IO) {
        http.newCall(req).execute().use { res ->
            val text = res.body?.string() ?: ""
            if (res.isSuccessful) return@withContext text
            val err = runCatching { json.decodeFromString(ErrorBody.serializer(), text) }.getOrNull()
            throw ApiException(res.code, err?.error ?: "http", err?.message ?: "Server error ${res.code}", err?.view)
        }
    }
}
