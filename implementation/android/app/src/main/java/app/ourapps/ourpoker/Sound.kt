package app.ourapps.ourpoker

import ae.preferences.DevicePreferences
import ae.preferences.PreferenceStorage
import ae.sound.ManifestJson
import ae.sound.SoundCuePlayer
import ae.sound.SoundManifest
import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

// The game's sounds: short and quiet, as players' microphones are open. The sound-cues component plays
// them; the manifest (res/raw/sounds_manifest.json) and the files (res/raw/snd_<cue>.wav) are this
// application's, from assets/web/sounds-manifest.json and assets/sounds.
enum class SoundName(val cue: String) {
    CLICK("click"), ENTER("enter"), EXIT("exit"), START("start"), END("end"),
    BOT_ADD("bot_add"), BOT_REMOVE("bot_remove"), DEAL("deal"), BURN("burn"),
    FLIP("flip"), CHECK("check"), FOLD("fold"), CHIPS("chips"), ALLIN("allin"),
    WIN("win"), TURN("turn"),
}

object Sound {
    private var player: SoundCuePlayer? = null
    var enabled = true
        set(value) { field = value; if (!value) player?.stopAll() }

    fun init(context: Context) {
        if (player != null) return
        val id = context.resources.getIdentifier("sounds_manifest", "raw", context.packageName)
        val manifest = if (id == 0) SoundManifest(emptyMap()) else ManifestJson.parse(context.resources.openRawResource(id).bufferedReader().use { it.readText() })
        player = SoundCuePlayer(manifest, isMuted = { !enabled }).also { it.init(context) }
    }

    fun play(name: SoundName, delayMs: Long = 0) { player?.play(name.cue, delayMs) }
}

private class PrefsStorage(private val prefs: SharedPreferences) : PreferenceStorage {
    override fun getString(key: String): String? = prefs.getString(key, null)
    override fun getBoolean(key: String, default: Boolean): Boolean = prefs.getBoolean(key, default)
    override fun putString(key: String, value: String) { prefs.edit().putString(key, value).apply() }
    override fun putBoolean(key: String, value: Boolean) { prefs.edit().putBoolean(key, value).apply() }
    override fun remove(key: String) { prefs.edit().remove(key).apply() }
}

// Sounds on or off for this device, on by default: the game's sounds and other players' voices, never
// your microphone. Kept by the preferences component.
class SoundSetting(prefs: SharedPreferences) {
    private val preferences = DevicePreferences(PrefsStorage(prefs))
    private val _on = MutableStateFlow(preferences.sound)
    val on: StateFlow<Boolean> = _on

    fun set(on: Boolean) {
        preferences.sound = on
        _on.value = on
    }
}
