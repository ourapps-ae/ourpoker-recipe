package app.ourapps.ourpoker.ui

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

// Installed in place of the lessons when the design leaves out guided-tour: nobody is guided and nothing is held.
@Suppress("UNUSED_PARAMETER")
class Lessons(context: Context, prefs: SharedPreferences) {
    val enabled: Boolean? get() = false
    val holding: Boolean get() = false
    fun setEnabled(on: Boolean) {}
    fun want(id: String) {}
    fun skip() {}
    fun screenChanged(screen: String) {}
    fun reset() {}
}

@Suppress("UNUSED_PARAMETER")
fun Modifier.guideAnchor(name: String, on: Boolean = true): Modifier = this

@Suppress("UNUSED_PARAMETER")
@Composable
fun Guided(lessons: Lessons, content: @Composable () -> Unit) = content()
