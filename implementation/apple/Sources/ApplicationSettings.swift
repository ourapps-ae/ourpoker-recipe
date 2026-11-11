enum ApplicationSettings {
    static let updatesEnabled = {{updatesEnabled}}
    // The languages the design offers (the strings of the others are not in the project).
    static let languages = "{{languages}}".split(separator: " ").map(String.init)
}
