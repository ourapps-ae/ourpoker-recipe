import Foundation
import Observation

// The app's language: the one picked on the home screen, else the phone's. Text read through
// localized() redraws when it changes.
@Observable final class Language {
    static let shared = Language()
    static let all: [(code: String, name: String)] = [("en", "English"), ("fr", "Français"), ("de", "Deutsch"), ("es", "Español")]
        .filter { ApplicationSettings.languages.contains($0.code) }

    private(set) var picked: String? = UserDefaults.standard.string(forKey: "lang")
    @ObservationIgnored private var bundle: Bundle = .main

    private init() { bundle = Self.bundle(picked) }

    // nil goes back to the phone's language.
    func pick(_ code: String?) {
        UserDefaults.standard.set(code, forKey: "lang")
        bundle = Self.bundle(code)
        picked = code
    }

    // The language the text is in.
    var current: String { selectLanguage(picked ?? Bundle.main.preferredLocalizations.first ?? "en", supported: Self.all.map(\.code), fallback: "en") }

    func text(_ key: String) -> String {
        _ = picked
        return bundle.localizedString(forKey: key, value: nil, table: nil)
    }

    private static func bundle(_ code: String?) -> Bundle {
        guard let code, let path = Bundle.main.path(forResource: code, ofType: "lproj"), let b = Bundle(path: path) else { return .main }
        return b
    }
}

func localized(_ key: String) -> String { Language.shared.text(key) }

// Localised text: L("key") for plain strings, L("key", a, b) for ones with placeholders.
// Every placeholder is %@, so arguments go in as text whatever they were.
func L(_ key: String, _ args: CVarArg...) -> String {
    let format = localized(key)
    let texts: [CVarArg] = args.map { ($0 as? String) ?? String(describing: $0) }
    return args.isEmpty ? format : String(format: format, locale: .current, arguments: texts)
}

func chips(_ n: Int) -> String { formatCount(n) }

// Server-provided prompt rendered in the phone's language; falls back to the server's English.
func promptText(_ view: GameView) -> String {
    let key = "p_" + view.promptKey
    let format = localized(key)
    if format == key { return view.prompt }
    return String(format: format, locale: .current, arguments: view.promptArgs.map(\.text))
}

func errorText(_ error: UiError?) -> String? {
    guard let error else { return nil }
    let key: String
    switch error.code {
    case "tableReset": key = "table_reset"
    case "network": key = "network_error"
    case let c?: key = "err_" + c
    case nil: return error.message
    }
    let text = localized(key)
    return text == key ? error.message : text
}

func actionText(_ a: LastAction) -> String {
    let key = "act_" + a.kind
    let format = localized(key)
    let text = format == key ? a.kind : String(format: format, locale: .current, arguments: [a.amount.map(chips) ?? ""])
    return a.auto ? text + " " + L("auto_mark") : text
}

// What the table is settling on: the deal, a street, or the last action.
func eventText(_ view: GameView) -> String? {
    guard let h = view.hand, let ev = h.event else { return nil }
    if ev != "action" {
        let key = "ev_" + (ev == "deal" ? "dealt" : ev)
        let text = localized(key)
        return text == key ? nil : text
    }
    guard let p = view.player(h.lastActorId), let a = p.lastAction else { return nil }
    let key = "ev_" + a.kind
    let format = localized(key)
    if format == key { return nil }
    return String(format: format, locale: .current, arguments: [p.name, a.amount.map(chips) ?? ""])
}

func roomName(_ id: String) -> String { L(id == "home" ? "room_home" : "room_casino") }
