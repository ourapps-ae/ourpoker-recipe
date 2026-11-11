package app.ourapps.ourpoker

// The only application file that names store-update: the manifest installs it only when the design includes that component.
fun newerRelease(latest: String, current: String): Boolean = ae.update.isNewer(latest, current)
