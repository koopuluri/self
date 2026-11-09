import AppKit
import WebKit

// A standalone test app with its own random bundle ID. It never opens the real
// browser's profile or any external URL, and never reads or prints real cookies.
enum CaptureError: LocalizedError {
    case invalid(String)
    var errorDescription: String? { if case let .invalid(message) = self { return message }; return nil }
}

@main enum ProfileProbe {
    static func main() {
        guard Bundle.main.bundleIdentifier?.hasPrefix("local.ghost.browser.persistence-probe.") == true,
              CommandLine.arguments.count == 3 else { exit(2) }
        let app = NSApplication.shared
        app.setActivationPolicy(.prohibited)
        let delegate = ProbeDelegate(mode: CommandLine.arguments[1], marker: CommandLine.arguments[2])
        app.delegate = delegate
        app.run()
        withExtendedLifetime(delegate) {}
    }
}

final class ProbeDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    let mode: String
    let marker: String
    let store = BrowserProfile.dataStore(testing: false)
    var web: WKWebView!
    init(mode: String, marker: String) { self.mode = mode; self.marker = marker }

    func applicationDidFinishLaunching(_ notification: Notification) {
        guard store.isPersistent else { fail("Production store is not persistent") }
        let config = WKWebViewConfiguration(); config.websiteDataStore = store
        web = WKWebView(frame: .zero, configuration: config); web.navigationDelegate = self
        web.loadHTMLString("<!doctype html><title>Local profile fixture</title>", baseURL: URL(string: "https://profile-check.invalid/"))
        DispatchQueue.main.asyncAfter(deadline: .now() + 25) { self.fail("Profile probe timed out") }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        let script = """
        const db = await new Promise((resolve, reject) => {
            const r = indexedDB.open('ghost-profile-probe', 1);
            r.onupgradeneeded = () => r.result.createObjectStore('values');
            r.onsuccess = () => resolve(r.result);
            r.onerror = () => reject(r.error);
        });
        if (mode === 'write') {
            localStorage.setItem('ghost-profile-probe', marker);
            await new Promise((resolve, reject) => {
                const tx = db.transaction('values', 'readwrite');
                tx.objectStore('values').put(marker, 'marker');
                tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
            });
            db.close(); return true;
        }
        const stored = await new Promise((resolve, reject) => {
            const r = db.transaction('values').objectStore('values').get('marker');
            r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
        });
        db.close();
        return localStorage.getItem('ghost-profile-probe') === marker && stored === marker;
        """
        web.callAsyncJavaScript(script, arguments: ["mode": mode, "marker": marker], in: nil, in: .page) { result in
            switch result {
            case .failure(let error): self.fail("Site-storage check failed: \(error.localizedDescription)")
            case .success(let value):
                guard value as? Bool == true else { self.fail("localStorage or IndexedDB did not survive") }
                self.checkCookie()
            }
        }
    }

    func checkCookie() {
        if mode == "write" {
            let cookie = HTTPCookie(properties: [.name: "ghost_profile_probe", .value: marker, .domain: "profile-check.invalid", .path: "/", .secure: "TRUE", .expires: Date().addingTimeInterval(86400)])!
            store.httpCookieStore.setCookie(cookie) {
                // Allow WebKit's asynchronous disk writes to settle before normal process exit.
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                    print("PASS: build 1 saved a synthetic persistent cookie, localStorage and IndexedDB.")
                    NSApp.terminate(nil)
                }
            }
        } else {
            store.httpCookieStore.getAllCookies { cookies in
                guard cookies.contains(where: { $0.name == "ghost_profile_probe" && $0.domain == "profile-check.invalid" && $0.value == self.marker }) else {
                    self.fail("Persistent cookie did not survive")
                }
                self.store.removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast) {
                    print("PASS: build 2 in a different app location retained the cookie, localStorage and IndexedDB; synthetic test data cleared.")
                    NSApp.terminate(nil)
                }
            }
        }
    }

    func fail(_ message: String) -> Never { fputs("FAIL: \(message)\n", stderr); exit(1) }
}
