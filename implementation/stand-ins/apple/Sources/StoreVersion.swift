import Foundation

// Installed when the design leaves out store-update: the running version for the home screen, and no update is ever newer.
func isNewer(_ latest: String, than current: String) -> Bool { false }

let currentVersion = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.0.0"
