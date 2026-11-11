import SwiftUI

// The colours the screens draw with: the tokens of the design's look (ApplicationSettings.look, a theme of the theme component).
enum Palette {
    private static let look = ThemeSet.named(ApplicationSettings.look)
    static let gold = Color(look.colour.primary)
    static let table = Color(look.colour.background)
    static let surface = Color(red: 0.15, green: 0.14, blue: 0.12)
    static let cardFace = Color(look.colour.paper)
    static let cardRed = Color(look.colour.paperAccent)
    static let ink = Color(look.colour.onPrimary)
    static let feltEdge = Color(look.colour.tableEdge)
    static let danger = Color(look.colour.danger)
    static let good = Color(look.colour.good)
}
