enum ApplicationSettings {
    static let updatesEnabled = {{updatesEnabled}}
    // The languages the design offers (the strings of the others are not in the project).
    static let languages = "{{languages}}".split(separator: " ").map(String.init)
    // The design's look: the theme of both rooms and every screen, and the card backs (stripes or plain).
    static let look = "{{look}}"
    static let cardBack = "{{cardBack}}"
}
