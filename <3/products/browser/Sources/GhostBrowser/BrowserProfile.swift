import Foundation
import WebKit

/// This identity belongs to the user's browser data, not to a particular build.
/// Keep using the original default store: switching to a new UUID would strand
/// existing cookies, local storage, IndexedDB and other website login state.
enum BrowserProfile {
    static let applicationIdentifier = "local.ghost.browser"

    static func validateApplicationIdentity() throws {
        guard Bundle.main.bundleIdentifier == applicationIdentifier else {
            throw CaptureError.invalid("This build has a different application identity. Rebuild Ghost Browser with bundle identifier \(applicationIdentifier) to use your existing website logins. No new browser profile has been opened.")
        }
    }

    static func dataStore(testing: Bool) -> WKWebsiteDataStore {
        testing ? .nonPersistent() : .default()
    }
}
