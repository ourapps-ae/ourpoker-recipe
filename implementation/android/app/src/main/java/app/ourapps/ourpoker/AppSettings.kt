package app.ourapps.ourpoker

// Filled in from the design's answers when the application is assembled.
object AppSettings {
    // The design's server address, or the one given when building (`./gradlew assembleDebug -PserverUrl=<address>`).
    val SERVER_URL: String = BuildConfig.SERVER_URL
    const val UPDATES_ENABLED = "{{updatesEnabled}}" == "true"
    const val APPLICATION_NAME = "{{applicationName}}"
    // The languages the design offers, space-separated (the strings of the others are not in the project).
    const val LANGUAGES = "{{languages}}"
    // The design's look: the theme of both rooms and every screen, and the card backs (stripes or plain).
    const val LOOK = "{{look}}"
    const val CARD_BACK = "{{cardBack}}"
}
