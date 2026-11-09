import SwiftUI

// The application entry: the apple-host component's window around this recipe's screen flow.
@main
struct OurPokerApp: App {
    @State private var model = TableModel()

    var body: some Scene {
        ApplicationShell(configuration: ShellConfiguration(
            displayName: "{{applicationName}}",
            tint: Palette.gold,
            colourScheme: .dark,
            becameActive: { model.resumed() },
            wentToBackground: { model.paused() })) {
            RootView(model: model)
        }
    }
}
