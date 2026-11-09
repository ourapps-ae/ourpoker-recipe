import SwiftUI
import XCTest
@testable import OurPoker

@MainActor
final class GuideTests: XCTestCase {
    private final class Seen { var keys: [String] = [] }

    private struct Recorder: View {
        let keys: [String]
        let seen: Seen
        var body: some View {
            seen.keys = keys
            return Color.clear
        }
    }

    // A part inside another part, such as a room inside the rooms card, must still be found.
    func testNestedAnchorsAllReachTheOverlay() {
        let seen = Seen()
        let probe = VStack { Color.red.frame(width: 10, height: 10).guideAnchor("inner") }
            .padding(20)
            .guideAnchor("outer")
            .overlayPreferenceValue(GuideAnchorKey.self) { anchors in Recorder(keys: anchors.keys.sorted(), seen: seen) }
        let host = UIHostingController(rootView: probe)
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        let window = scene.map { UIWindow(windowScene: $0) } ?? UIWindow()
        window.frame = CGRect(x: 0, y: 0, width: 300, height: 300)
        window.rootViewController = host
        window.makeKeyAndVisible()
        host.view.layoutIfNeeded()
        RunLoop.main.run(until: Date().addingTimeInterval(0.3))
        XCTAssertEqual(seen.keys, ["inner", "outer"])
        window.isHidden = true
    }
}
