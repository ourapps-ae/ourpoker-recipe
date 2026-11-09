package app.ourapps.ourpoker

import ae.androidhost.ShellLanguage

// The app's language: the one picked on the home screen, else the phone's. The android-host shell
// carries it on the activity's context, so a change takes effect when the activity is recreated.
object AppLanguage {
    val shell = ShellLanguage("ourpoker", listOf("en" to "English", "fr" to "Français", "de" to "Deutsch", "es" to "Español"))
    val all get() = shell.all
    fun picked(ctx: android.content.Context): String? = shell.picked(ctx)
    fun pick(ctx: android.content.Context, code: String?) = shell.pick(ctx, code)
    fun current(ctx: android.content.Context): String = shell.current(ctx)
    fun wrap(base: android.content.Context): android.content.Context = shell.wrap(base)
}
