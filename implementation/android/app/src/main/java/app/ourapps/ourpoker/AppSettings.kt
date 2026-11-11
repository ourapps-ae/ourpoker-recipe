package app.ourapps.ourpoker

// Filled in from the design's answers when the application is assembled.
object AppSettings {
    const val SERVER_URL = "{{serverAddress}}"
    const val UPDATES_ENABLED = "{{updatesEnabled}}" == "true"
    const val APPLICATION_NAME = "{{applicationName}}"
    // The languages the design offers, space-separated (the strings of the others are not in the project).
    const val LANGUAGES = "{{languages}}"
    // The design's look: the theme of both rooms and every screen, and the card backs (stripes or plain).
    const val LOOK = "{{look}}"
    const val CARD_BACK = "{{cardBack}}"
}
