import Foundation

// Installed in place of Updates.swift when the design leaves out store-update: the running version, and no release is ever newer.
func newerRelease(_ latest: String, than current: String) -> Bool { false }
let applicationVersion = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.0.0"
