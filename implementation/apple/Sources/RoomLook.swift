import SwiftUI

// One look per room: a theme from the theme component and a scene picture behind it (art/scene-<room>-back.jpg)
// with figures in front (scene-<room>-front.png). The art is this application's; the drawing is the theme's.

// Artwork from the bundle's Art folder (a folder reference, so the directory survives), or nil when
// the file is absent. Cached: the table asks for the same pictures on every frame.
enum Art {
    private static var cache: [String: UIImage?] = [:]

    static func image(_ name: String, ext: String = "png") -> UIImage? {
        if let hit = cache[name] { return hit }
        let url = Bundle.main.url(forResource: name, withExtension: ext, subdirectory: "Art")
        let img = url.flatMap { UIImage(contentsOfFile: $0.path) }
        cache[name] = img
        return img
    }

    // The card art the card-graphics component asks for by file name ("card-back-casino.png").
    static func cardImage(_ file: String) -> UIImage? {
        let name = (file as NSString).deletingPathExtension, ext = (file as NSString).pathExtension
        return image(name, ext: ext.isEmpty ? "png" : ext)
    }
}

enum SceneCrop {
    static func anchor(room: String, size: CGSize, portraitAnchor: CGFloat, onMac: Bool) -> CGFloat {
        onMac && room == "home" && size.width > size.height ? 0 : portraitAnchor
    }

    static var onMac: Bool {
        #if targetEnvironment(macCatalyst)
        true
        #else
        ProcessInfo.processInfo.isiOSAppOnMac
        #endif
    }
}

struct RoomLook {
    let id: String
    let theme: ThemeSet
    let anchor: CGFloat
    let fronts: [SceneFront]
    var felt: Color { Color(theme.colour.table) }

    var scene: BackgroundScene {
        BackgroundScene(id: id, back: Art.image("scene-\(id)-back", ext: "jpg"), front: Art.image("scene-\(id)-front"), anchor: anchor, fronts: fronts)
    }
}

private let looks: [String: RoomLook] = [
    "casino": RoomLook(id: "casino", theme: .named("night"), anchor: 0.5, fronts: [SceneFront(at: .bottomRight, h: 0.68, maxW: 1)]),
    "home": RoomLook(id: "home", theme: .named("lounge"), anchor: 1, fronts: [SceneFront(at: .bottomRight, h: 0.6, maxW: 1)]),
]

func themeFor(_ roomId: String?) -> RoomLook { looks[roomId ?? ""] ?? looks["casino"]! }

struct PokerBackground: View {
    var theme: RoomLook = themeFor(nil)
    // Figures are for the home, lobby and standings screens; the table shows only the picture behind.
    var figures = true

    var body: some View {
        ThemeBackgroundView(theme: theme.theme, scene: theme.scene, figures: figures)
    }
}

// The artwork name a card looks for ("card-back-<room>.png"): set by the room being shown.
extension EnvironmentValues {
    var cardTheme: String {
        get { cardStyle.artTheme }
        set { cardStyle.artTheme = newValue }
    }
}

// The styles every screen reads from the environment: the controls' and the cards' look and the chips'.
extension View {
    func pokerStyles() -> some View {
        let night = ThemeSet.named("night")
        let cards = CardStyle(colours: night, artTheme: "casino", image: { Art.cardImage($0) }, rankLabel: { "TJQKA".contains($0) ? L("rank_\($0)") : String($0) })
        return self.controlsTheme(night).cardStyle(cards).chipStyle(ChipStyle())
    }
}
