import SwiftUI

// The only application file that names guided-tour: the manifest installs it only when the design includes that component,
// and a stand-in with the same declarations otherwise. Lessons (locales/lessons.json): each is shown once ever, after any
// already waiting; progress and the choice to be guided are kept on this device.
@MainActor
final class Lessons {
    let tour: Tour = {
        let data = Bundle.main.url(forResource: "lessons", withExtension: "json").flatMap { try? Data(contentsOf: $0) } ?? Data()
        let lessons = (try? TourModel.parseLessons(data)) ?? []
        return Tour(lessons: lessons, storage: UserDefaultsTourStorage(), translate: { localized($0) })
    }()
    var enabled: Bool? { tour.enabled }
    var holding: Bool { tour.holding }
    func setEnabled(_ on: Bool) { tour.setEnabled(on) }
    func want(_ id: String) { _ = tour.want(id) }
    func skip() { tour.skip() }
    func screenChanged(_ screen: String) { tour.screenChanged(screen) }
    func reset() { tour.reset() }
}

// An anchor on one of several alike views, such as the first room or the first computer player.
struct GuideAnchorIf: ViewModifier {
    let name: String
    let on: Bool
    func body(content: Content) -> some View {
        if on { content.tourAnchor(name) } else { content }
    }
}

extension View {
    func guideAnchor(_ name: String) -> some View { tourAnchor(name) }
    // The lesson on show, over the screens, with its buttons in the application's language.
    func lessonsHost(_ lessons: Lessons) -> some View {
        tourHost(lessons.tour, buttons: TourButtons(next: L("guide_next"), skip: L("guide_skip"), done: L("got_it")))
    }
}
