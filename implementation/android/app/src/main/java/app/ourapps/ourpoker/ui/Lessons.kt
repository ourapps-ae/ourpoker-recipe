package app.ourapps.ourpoker.ui

import ae.tour.LessonsJson
import ae.tour.PreferencesTourStorage
import ae.tour.Tour
import ae.tour.TourButtons
import ae.tour.TourHost
import ae.tour.TourKeys
import ae.tour.tourAnchor
import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

// The only application file that names guided-tour: the manifest installs it only when the design includes that component,
// and a stand-in with the same declarations otherwise. Lessons (res/raw/lessons.json, from locales/lessons.json): each is
// shown once ever, after any already waiting; progress and the choice to be guided are kept on this phone.
class Lessons(context: Context, prefs: SharedPreferences) {
    val tour: Tour = run {
        val id = context.resources.getIdentifier("lessons", "raw", context.packageName)
        val lessons = LessonsJson.parse(context.resources.openRawResource(id).bufferedReader().use { it.readText() })
        Tour(lessons, PreferencesTourStorage(prefs), translate = { context.text(it) }, keys = TourKeys(prefix = "tut.", enabled = "beginner"))
    }
    val enabled: Boolean? get() = tour.enabled
    val holding: Boolean get() = tour.holding
    fun setEnabled(on: Boolean) = tour.setEnabled(on)
    fun want(id: String) { tour.want(id) }
    fun skip() = tour.skip()
    fun screenChanged(screen: String) = tour.screenChanged(screen)
    fun reset() = tour.reset()
}

// Marks an element a lesson step can ring.
fun Modifier.guideAnchor(name: String, on: Boolean = true): Modifier = tourAnchor(name, on)

// The lesson on show, over the content, with the buttons in the phone's language.
@Composable
fun Guided(lessons: Lessons, content: @Composable () -> Unit) {
    TourHost(lessons.tour, TourButtons(next = L("guide_next"), skip = L("guide_skip"), done = L("got_it")), content)
}
