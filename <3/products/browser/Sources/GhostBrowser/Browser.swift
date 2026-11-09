import AppKit
import SwiftUI
import WebKit

struct NavigationContext {
    var source: String?
    var sourceEvent: String?
    var kind: String
    var extra: [String: Any] = [:]
}

final class Browser: NSObject, ObservableObject {
    @Published var tabs: [BrowserTab] = []
    @Published var selected: UUID? {
        didSet {
            guard selected != oldValue else { return }
            addressEditing = false
            syncAddress()
        }
    }
    @Published var addressEditing = false
    @Published var addressFocusRequest = 0
    @Published var address = ""
    @Published var paused = false
    @Published var problem: String?
    let recorder: Recorder
    let websiteDataStore: WKWebsiteDataStore
    var failed: [CaptureEvent] = []
    var recentlyClosed: [URL] = []
    var active: BrowserTab? { tabs.first { $0.id == selected } }
    var isTesting: Bool

    init(root: URL, testing: Bool = false) {
        recorder = Recorder(root: root); isTesting = testing
        websiteDataStore = BrowserProfile.dataStore(testing: testing)
        super.init()
        do { try recorder.prepare() } catch { problem = error.localizedDescription }
    }

    @discardableResult func add(url: URL = URL(string: "about:blank")!, context: NavigationContext? = nil, configuration: WKWebViewConfiguration? = nil, load: Bool = true) -> BrowserTab {
        let tab = BrowserTab(browser: self, configuration: configuration)
        tabs.append(tab); selected = tab.id
        tab.pending = paused ? nil : context
        if load { tab.web.load(URLRequest(url: url)) }
        return tab
    }

    func newTab() {
        add()
        showAddress()
    }

    func close(_ id: UUID? = nil) {
        guard failed.isEmpty else { presentProblem(); return }
        guard let index = tabs.firstIndex(where: { $0.id == (id ?? selected) }) else { return }
        let tab = tabs.remove(at: index)
        if let url = tab.web.url { recentlyClosed.append(url); recentlyClosed = Array(recentlyClosed.suffix(20)) }
        tab.dispose()
        if selected == tab.id { selected = tabs.isEmpty ? nil : tabs[min(index, tabs.count - 1)].id }
        if tabs.isEmpty { newTab() }
    }

    func reopen() { if let url = recentlyClosed.popLast() { add(url: url, context: NavigationContext(kind: "reopened_tab")) } }
    func select(offset: Int) {
        guard let index = tabs.firstIndex(where: { $0.id == selected }), !tabs.isEmpty else { return }
        selected = tabs[(index + offset + tabs.count) % tabs.count].id
    }
    func syncAddress() {
        guard !addressEditing else { return }
        let url = active?.web.url
        address = ["http", "https"].contains(url?.scheme?.lowercased() ?? "") ? url!.absoluteString : ""
    }
    func showAddress() {
        addressEditing = false
        syncAddress()
        addressFocusRequest += 1
    }
    func cancelAddress() {
        addressEditing = false
        syncAddress()
        if let web = active?.web { web.window?.makeFirstResponder(web) }
    }
    func goBack() {
        guard let web = active?.web, web.canGoBack else { return }
        cancelAddress()
        web.goBack()
    }
    func goForward() {
        guard let web = active?.web, web.canGoForward else { return }
        cancelAddress()
        web.goForward()
    }
    func navigate() {
        var value = address.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return }
        if !value.contains("://") {
            if value.contains(" ") || !value.contains(".") {
                var search = URLComponents(string: "https://www.google.com/search")!
                search.queryItems = [URLQueryItem(name: "q", value: value)]
                value = search.string!
            }
            else { value = "https://" + value }
        }
        guard Recorder.webURL(value) != nil, let url = URL(string: value), let tab = active else { NSSound.beep(); return }
        tab.pending = paused ? nil : NavigationContext(source: tab.web.url?.absoluteString, sourceEvent: tab.lastEventID, kind: "address")
        addressEditing = false
        tab.web.load(URLRequest(url: url))
        tab.web.window?.makeFirstResponder(tab.web)
    }

    func emit(_ event: CaptureEvent) {
        guard !paused else { return }
        do { try recorder.write(event) }
        catch {
            failed.append(event)
            let wasHealthy = problem == nil
            problem = "Could not save a browsing event to Ghost. \(error.localizedDescription)"
            if wasHealthy { DispatchQueue.main.async { self.presentProblem() } }
        }
    }

    func captureProblem(_ message: String) {
        let wasHealthy = problem == nil
        problem = message
        if wasHealthy && !isTesting { DispatchQueue.main.async { self.presentProblem() } }
    }

    func presentProblem() {
        guard !isTesting else { return }
        let alert = NSAlert()
        alert.messageText = failed.isEmpty ? "Capture needs attention" : "An event has not reached Ghost"
        alert.informativeText = (problem ?? "") + (failed.isEmpty ? "" : "\n\nThe event is still in memory. Keep this app open and retry after fixing the folder or disk. There is no separate sync store.")
        alert.addButton(withTitle: failed.isEmpty ? "OK" : "Retry")
        if !failed.isEmpty { alert.addButton(withTitle: "Keep open") }
        let response = alert.runModal()
        if response == .alertFirstButtonReturn && !failed.isEmpty { retry() }
    }

    func retry() {
        var remaining: [CaptureEvent] = []
        for event in failed { do { try recorder.write(event) } catch { remaining.append(event); problem = error.localizedDescription } }
        failed = remaining
        if remaining.isEmpty { problem = nil }
    }

    func toggleCapture() {
        if problem != nil { presentProblem(); return }
        paused.toggle()
        for tab in tabs {
            tab.pending = nil; tab.linkIntent = nil; tab.lastEventID = nil
            tab.web.evaluateJavaScript("window.__ghostSetPaused?.(\(paused ? "true" : "false"))", completionHandler: nil)
        }
    }

    func restore() {
        let urls = UserDefaults.standard.stringArray(forKey: "openTabs") ?? []
        for value in urls.prefix(30) {
            if value == "about:blank" { add() }
            else if let safe = Recorder.webURL(value), let url = URL(string: safe) { add(url: url) }
        }
        if tabs.isEmpty { newTab() }
        let index = UserDefaults.standard.integer(forKey: "activeTab")
        selected = tabs[min(index, tabs.count - 1)].id
        if Recorder.webURL(active?.web.url?.absoluteString) == nil { showAddress() }
    }
    func saveTabs() {
        guard !isTesting else { return }
        UserDefaults.standard.set(tabs.map { Recorder.webURL($0.web.url?.absoluteString) ?? "about:blank" }, forKey: "openTabs")
        UserDefaults.standard.set(tabs.firstIndex { $0.id == selected } ?? 0, forKey: "activeTab")
    }
}

final class BrowserTab: NSObject, Identifiable, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    let id = UUID()
    unowned let browser: Browser
    let web: WKWebView
    var title = "New tab"
    var pending: NavigationContext?
    var linkIntent: (url: String, context: NavigationContext, date: Date)?
    var lastEventID: String?
    private var observations: [NSKeyValueObservation] = []

    init(browser: Browser, configuration: WKWebViewConfiguration? = nil) {
        self.browser = browser
        let config = configuration ?? WKWebViewConfiguration()
        if configuration == nil { config.websiteDataStore = browser.websiteDataStore }
        config.preferences.javaScriptCanOpenWindowsAutomatically = true
        config.userContentController = WKUserContentController()
        web = BrowserWebView(frame: .zero, configuration: config)
        super.init()
        let controller = web.configuration.userContentController
        controller.add(self, name: "ghost")
        do {
            let scripts = try ["X", "Capture"].map { name -> String in
                let url = Bundle.main.resourceURL?.appendingPathComponent(name + ".js")
                let source = (url != nil && FileManager.default.fileExists(atPath: url!.path)) ? url : Bundle.module.url(forResource: name, withExtension: "js", subdirectory: "Resources")
                guard let source else { throw CaptureError.invalid("Missing capture script: \(name)") }
                return try String(contentsOf: source, encoding: .utf8)
            }.joined(separator: "\n")
            controller.addUserScript(WKUserScript(source: scripts, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        } catch { browser.captureProblem(error.localizedDescription) }
        web.navigationDelegate = self; web.uiDelegate = self
        web.allowsBackForwardNavigationGestures = true
        web.allowsMagnification = true
        for keyPath in [\WKWebView.canGoBack, \WKWebView.canGoForward] {
            observations.append(web.observe(keyPath, options: [.new]) { [weak self] _, _ in
                self?.browser.objectWillChange.send()
            })
        }
        observations.append(web.observe(\.title, options: [.new]) { [weak self] view, _ in
            guard let self else { return }
            self.title = view.title?.isEmpty == false ? view.title! : (view.url?.host ?? "New tab")
            self.browser.objectWillChange.send()
        })
        observations.append(web.observe(\.url, options: [.new]) { [weak self] _, _ in
            guard let self else { return }
            if self.browser.selected == self.id { self.browser.syncAddress() }
            self.browser.saveTabs()
        })
    }

    func dispose() {
        web.stopLoading(); web.navigationDelegate = nil; web.uiDelegate = nil
        web.configuration.userContentController.removeScriptMessageHandler(forName: "ghost")
        observations.removeAll()
    }

    func context(for url: String, kind: String) -> NavigationContext {
        if let intent = linkIntent, Date().timeIntervalSince(intent.date) < 10, intent.url == url { return intent.context }
        return NavigationContext(source: web.url?.absoluteString, sourceEvent: lastEventID, kind: kind)
    }

    func arrival(_ url: String, context: NavigationContext) {
        guard !browser.paused, let safe = Recorder.webURL(url) else { return }
        var fields = context.extra
        fields["url"] = safe
        fields["source_url"] = Recorder.webURL(context.source)
        fields["source_event_id"] = context.sourceEvent
        fields["navigation_kind"] = context.kind
        fields["tab_id"] = id.uuidString.lowercased()
        // Native top-level navigation and injected SPA navigation use the same event shape.
        if Recorder.isX(URL(string: safe)) {
            let parts = URL(string: safe)!.pathComponents.filter { $0 != "/" }
            if parts.count == 2 && parts[1] == "following" { fields["context"] = "x.following_list"; fields["list_owner"] = parts[0] }
            if let source = context.source, Recorder.isX(URL(string: source)), let sourceURL = URL(string: source) {
                let from = sourceURL.pathComponents.filter { $0 != "/" }
                let reserved: Set<String> = ["home", "explore", "notifications", "messages", "i", "settings", "compose", "search", "login", "logout", "tos", "privacy"]
                if from.count == 2 && from[1] == "following" && parts.count == 1 && !reserved.contains(parts[0].lowercased()) {
                    fields["context"] = "x.profile_from_following_list"; fields["list_owner"] = from[0]; fields["account_handle"] = parts[0]
                }
            }
        }
        let event = CaptureEvent(type: "url.opened", fields: fields)
        browser.emit(event); lastEventID = event.id.uuidString.lowercased()
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if !["http", "https", "about"].contains(url.scheme?.lowercased() ?? "") { decisionHandler(.cancel); return }
        if action.targetFrame == nil { decisionHandler(.allow); return }
        guard action.targetFrame?.isMainFrame == true else { decisionHandler(.allow); return }
        if action.navigationType == .linkActivated && action.modifierFlags.contains(.command) {
            let previous = browser.selected
            browser.add(url: url, context: context(for: url.absoluteString, kind: "link"))
            if !action.modifierFlags.contains(.shift) { browser.selected = previous }
            decisionHandler(.cancel); return
        }
        // WebKit can report the child tab's initial load as linkActivated too.
        // Keep the opener's context instead of replacing it with the empty child page.
        if action.navigationType == .linkActivated { pending = browser.paused ? nil : (pending ?? context(for: url.absoluteString, kind: "link")) }
        if action.navigationType == .backForward { pending = browser.paused ? nil : context(for: url.absoluteString, kind: "back_forward") }
        if action.navigationType == .reload { pending = nil }
        decisionHandler(.allow)
    }
    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        if let pending, let url = webView.url?.absoluteString { arrival(url, context: pending) }
        pending = nil; linkIntent = nil
        if browser.paused { webView.evaluateJavaScript("window.__ghostSetPaused?.(true)", completionHandler: nil) }
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        browser.saveTabs()
        guard Recorder.webURL(webView.url?.absoluteString) != nil else { return }
        webView.evaluateJavaScript("!!window.__ghostInstalled && !!window.GhostXAdapter") { [weak self] result, error in
            guard let self else { return }
            if error != nil || result as? Bool != true { self.browser.captureProblem("The capture observer did not start on this page. Reload the tab before relying on capture.") }
        }
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { pending = nil }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        browser.captureProblem("The web page process stopped. Reload the tab to resume capture.")
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard let url = action.request.url, Recorder.webURL(url.absoluteString) != nil else { return nil }
        let original = browser.selected
        let child = browser.add(url: url, context: context(for: url.absoluteString, kind: "new_tab_link"), configuration: configuration, load: false)
        if action.modifierFlags.contains(.command) && !action.modifierFlags.contains(.shift) { browser.selected = original }
        return child.web
    }
    func webViewDidClose(_ webView: WKWebView) { browser.close(id) }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = NSAlert(); alert.messageText = frame.securityOrigin.host; alert.informativeText = String(message.prefix(2000)); alert.runModal(); completionHandler()
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert(); alert.messageText = frame.securityOrigin.host; alert.informativeText = String(message.prefix(2000)); alert.addButton(withTitle: "OK"); alert.addButton(withTitle: "Cancel"); completionHandler(alert.runModal() == .alertFirstButtonReturn)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if browser.isTesting {
            let kind = (message.body as? [String: Any])?["kind"] ?? "unknown"
            let frame = message.frameInfo.request.url?.absoluteString ?? "nil"
            print("fixture message: \(kind) frame=\(frame) origin=\(message.frameInfo.securityOrigin.host)")
        }
        guard message.frameInfo.isMainFrame, let data = message.body as? [String: Any], let kind = data["kind"] as? String,
              let size = try? JSONSerialization.data(withJSONObject: data).count, size <= 262144 else { return }
        if kind == "ready" {
            if browser.paused { web.evaluateJavaScript("window.__ghostSetPaused?.(true)", completionHandler: nil) }
            return
        }
        guard !browser.paused else { return }
        let frameURL = message.frameInfo.request.url
        if kind == "capture_problem" {
            guard Recorder.isX(frameURL) else { return }
            browser.captureProblem(String((data["message"] as? String ?? "X capture needs attention.").prefix(250))); return
        }
        if kind == "link", let url = data["url"] as? String, Recorder.webURL(url) != nil {
            let context = NavigationContext(source: Recorder.webURL(data["source_url"] as? String), sourceEvent: lastEventID, kind: "link")
            linkIntent = (url, context, Date()); return
        }
        if kind == "navigation", let url = data["url"] as? String {
            guard let destination = URL(string: url), destination.host == frameURL?.host else { return }
            let context = NavigationContext(source: Recorder.webURL(data["source_url"] as? String), sourceEvent: lastEventID, kind: data["navigation_kind"] as? String ?? "site_navigation")
            arrival(url, context: context); pending = nil; linkIntent = nil; return
        }
        guard kind == "event", Recorder.isX(frameURL), let type = data["type"] as? String,
              ["post.liked", "account.followed", "post.published", "reply.published"].contains(type),
              var fields = data["fields"] as? [String: Any],
              fields["platform"] as? String == "x", fields["verification"] as? String == "successful_site_response",
              let url = Recorder.webURL(fields["url"] as? String), Recorder.isX(URL(string: url)) else { return }
        fields["url"] = url; fields["source_url"] = Recorder.webURL(fields["source_url"] as? String)
        fields["source_event_id"] = lastEventID; fields["tab_id"] = id.uuidString.lowercased()
        browser.emit(CaptureEvent(type: type, fields: fields, text: data["text"] as? String))
    }
}

struct WebSurface: NSViewRepresentable {
    let web: WKWebView
    func makeNSView(context: Context) -> WKWebView { web }
    func updateNSView(_ view: WKWebView, context: Context) {}
}

struct AddressField: NSViewRepresentable {
    @Binding var text: String
    @Binding var editing: Bool
    var focusRequest: Int
    var tabID: UUID?
    var submit: () -> Void
    var cancel: () -> Void
    final class Coordinator: NSObject, NSTextFieldDelegate {
        var parent: AddressField
        var lastFocusRequest = 0
        var lastTabID: UUID?
        init(_ parent: AddressField) { self.parent = parent }
        func controlTextDidBeginEditing(_ notification: Notification) { parent.editing = true }
        func controlTextDidEndEditing(_ notification: Notification) { parent.editing = false }
        func controlTextDidChange(_ notification: Notification) {
            if let field = notification.object as? NSTextField { parent.text = field.stringValue }
        }
        func control(_ control: NSControl, textView: NSTextView, doCommandBy commandSelector: Selector) -> Bool {
            if commandSelector == #selector(NSResponder.insertNewline(_:)) { parent.submit(); return true }
            if commandSelector == #selector(NSResponder.cancelOperation(_:)) { parent.cancel(); return true }
            return false
        }
    }
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeNSView(context: Context) -> NSTextField {
        let field = NSTextField(string: text)
        field.delegate = context.coordinator; field.isBezeled = false; field.drawsBackground = false
        field.font = .systemFont(ofSize: 13); field.placeholderString = "Search or enter website address"
        field.setAccessibilityLabel("Website address")
        field.setAccessibilityIdentifier("address-field")
        field.lineBreakMode = .byTruncatingTail
        return field
    }
    func updateNSView(_ field: NSTextField, context: Context) {
        let coordinator = context.coordinator
        coordinator.parent = self
        if coordinator.lastTabID != tabID {
            coordinator.lastTabID = tabID
            if field.currentEditor() != nil { field.window?.makeFirstResponder(nil) }
        }
        if field.stringValue != text { field.stringValue = text }
        if coordinator.lastFocusRequest != focusRequest {
            coordinator.lastFocusRequest = focusRequest
            DispatchQueue.main.async {
                guard coordinator.lastFocusRequest == self.focusRequest else { return }
                field.window?.makeFirstResponder(field)
                field.selectText(nil)
            }
        }
    }
}

struct BrowserView: View {
    @ObservedObject var browser: Browser
    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 4) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 3) {
                        ForEach(browser.tabs) { tab in
                            ZStack(alignment: .trailing) {
                                Button {
                                    browser.selected = tab.id
                                } label: {
                                    Text(tab.title)
                                        .font(.system(size: 12, weight: browser.selected == tab.id ? .medium : .regular))
                                        .lineLimit(1)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .padding(.leading, 11).padding(.trailing, 34)
                                        .frame(width: 185, height: 32)
                                }
                                .buttonStyle(ChromeButtonStyle(selected: browser.selected == tab.id))
                                .help(tab.title)
                                .accessibilityLabel("Tab: " + tab.title)
                                .accessibilityAddTraits(browser.selected == tab.id ? .isSelected : [])

                                Button { browser.close(tab.id) } label: {
                                    Image(systemName: "xmark").font(.system(size: 9, weight: .medium))
                                        .frame(width: 24, height: 24)
                                }
                                .buttonStyle(ChromeButtonStyle(cornerRadius: 5))
                                .help("Close tab (⌘W)")
                                .accessibilityLabel("Close " + tab.title)
                                .padding(.trailing, 4)
                            }
                            .accessibilityElement(children: .contain).accessibilityLabel("Tab: " + tab.title)
                        }
                    }
                }
                Button { browser.newTab() } label: {
                    Image(systemName: "plus").font(.system(size: 13, weight: .medium))
                        .frame(width: 28, height: 28)
                }
                .buttonStyle(ChromeButtonStyle()).help("New tab (⌘T)").accessibilityLabel("New tab")
                Button { browser.toggleCapture() } label: {
                    Circle().fill(browser.problem != nil ? Color.orange : browser.paused ? Color.gray : Color.red)
                        .frame(width: 7, height: 7).frame(width: 28, height: 28)
                }.buttonStyle(ChromeButtonStyle()).help(browser.problem ?? (browser.paused ? "Capture paused — click to resume" : "Recording directly to Ghost — click to pause")).accessibilityLabel(browser.problem != nil ? "Capture problem" : browser.paused ? "Resume capture" : "Pause capture")
            }
            .padding(.horizontal, 7).frame(height: 42).background(Color(nsColor: .windowBackgroundColor))
            Divider()
            HStack(spacing: 12) {
                HStack(spacing: 4) {
                    Button { browser.goBack() } label: {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 16, weight: .medium))
                            .frame(width: 30, height: 30)
                    }
                    .disabled(browser.active?.web.canGoBack != true)
                    .help("Back (⌘[)").accessibilityLabel("Back")
                    Button { browser.goForward() } label: {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 16, weight: .medium))
                            .frame(width: 30, height: 30)
                    }
                    .disabled(browser.active?.web.canGoForward != true)
                    .help("Forward (⌘])").accessibilityLabel("Forward")
                }
                .buttonStyle(ChromeButtonStyle())
                Spacer(minLength: 0)
                AddressField(text: $browser.address, editing: $browser.addressEditing,
                             focusRequest: browser.addressFocusRequest, tabID: browser.selected,
                             submit: { browser.navigate() }, cancel: { browser.cancelAddress() })
                    .frame(height: 20)
                    .padding(.horizontal, 12).padding(.vertical, 6)
                    .background(Color(nsColor: .textBackgroundColor), in: RoundedRectangle(cornerRadius: 8))
                    .overlay(RoundedRectangle(cornerRadius: 8)
                        .strokeBorder(browser.addressEditing ? Color.accentColor : Color.primary.opacity(0.15),
                                      lineWidth: browser.addressEditing ? 2 : 1))
                    .frame(maxWidth: 820)
                Spacer(minLength: 0)
                Color.clear.frame(width: 64, height: 30).accessibilityHidden(true)
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 12).padding(.vertical, 8)
            .background(Color(nsColor: .windowBackgroundColor))
            Divider()
            if let tab = browser.active { WebSurface(web: tab.web).id(tab.id) }
        }
        .frame(minWidth: 600, minHeight: 400)
    }
}
