import SwiftUI

// Installed in place of the lessons when the design leaves out guided-tour: nobody is guided and nothing is held.
@MainActor
final class Lessons {
    var enabled: Bool? { false }
    var holding: Bool { false }
    func setEnabled(_ on: Bool) {}
    func want(_ id: String) {}
    func skip() {}
    func screenChanged(_ screen: String) {}
    func reset() {}
}

struct GuideAnchorIf: ViewModifier {
    let name: String
    let on: Bool
    func body(content: Content) -> some View { content }
}

extension View {
    func guideAnchor(_ name: String) -> some View { self }
    func lessonsHost(_ lessons: Lessons) -> some View { self }
}
