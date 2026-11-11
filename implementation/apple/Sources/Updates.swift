import Foundation

// The only application file that names store-update: the manifest installs it only when the design includes that component,
// and a stand-in otherwise.
func newerRelease(_ latest: String, than current: String) -> Bool { isNewer(latest, than: current) }
let applicationVersion = currentVersion
