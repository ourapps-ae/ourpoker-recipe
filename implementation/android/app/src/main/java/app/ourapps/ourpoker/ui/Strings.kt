package app.ourapps.ourpoker.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import app.ourapps.ourpoker.net.LastAction
import app.ourapps.ourpoker.net.View
import ae.controls.formatCount
import android.content.Context

// Text by key. The string resources are generated from locales/strings.json by the translations
// component's generator, so they are looked up by name: the application's resource package is the
// installer's package id, which no source file can name.
fun Context.text(key: String, vararg args: Any): String {
    val id = resources.getIdentifier(key, "string", packageName)
    return if (id == 0) key else getString(id, *args)
}

// Localised text: L("key") for plain strings, L("key", a, b) for ones with placeholders.
@Composable
fun L(key: String, vararg args: Any): String = LocalContext.current.text(key, *args)

fun chips(n: Int): String = formatCount(n)

// Localised text for server-provided keys (prompts, error codes); falls back to the server's English.
@Composable
fun promptText(view: View): String {
    val ctx = LocalContext.current
    val id = ctx.resources.getIdentifier("p_" + view.promptKey, "string", ctx.packageName)
    if (id == 0) return view.prompt
    val args = view.promptArgs.map { a -> a.content.toIntOrNull()?.let { chips(it) } ?: a.content }
    return ctx.getString(id, *args.toTypedArray())
}

// What the table is settling on: the deal, a street, or the last action.
@Composable
fun eventText(view: View): String? {
    val h = view.hand ?: return null
    val ev = h.event ?: return null
    val ctx = LocalContext.current
    if (ev != "action") {
        val id = ctx.resources.getIdentifier("ev_" + (if (ev == "deal") "dealt" else ev), "string", ctx.packageName)
        return if (id == 0) null else ctx.getString(id)
    }
    val p = view.player(h.lastActorId) ?: return null
    val a = p.lastAction ?: return null
    val id = ctx.resources.getIdentifier("ev_" + a.kind, "string", ctx.packageName)
    return if (id == 0) null else ctx.getString(id, p.name, a.amount?.let { chips(it) } ?: "")
}

@Composable
fun errorText(code: String?, message: String?): String? {
    if (code == null && message == null) return null
    val ctx = LocalContext.current
    val name = when (code) {
        "tableReset" -> "table_reset"
        "network" -> "network_error"
        null -> ""
        else -> "err_$code"
    }
    val id = if (name.isEmpty()) 0 else ctx.resources.getIdentifier(name, "string", ctx.packageName)
    return if (id != 0) ctx.getString(id) else message
}

@Composable
fun actionText(a: LastAction): String {
    val ctx = LocalContext.current
    val id = ctx.resources.getIdentifier("act_" + a.kind, "string", ctx.packageName)
    val text = if (id == 0) a.kind else ctx.getString(id, a.amount?.let { chips(it) } ?: "")
    return if (a.auto) "$text " + L("auto_mark") else text
}

@Composable
fun roomName(id: String): String = L(if (id == "home") "room_home" else "room_casino")
