import AppKit
import SwiftUI

@main
enum GhostBrowserApp {
    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.regular)
        app.run()
        withExtendedLifetime(delegate) {}
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    var window: NSWindow!
    var browser: Browser!
    var keyMonitor: Any?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let home = FileManager.default.homeDirectoryForCurrentUser
        let renamedRoot = home.appendingPathComponent("code/self").path
        let defaultRoot = FileManager.default.fileExists(atPath: renamedRoot) ? renamedRoot : home.appendingPathComponent("code/ghost").path
        let root = ProcessInfo.processInfo.environment["SELF_ROOT"] ?? ProcessInfo.processInfo.environment["GHOST_ROOT"] ?? UserDefaults.standard.string(forKey: "ghostRoot") ?? defaultRoot
        let testMode = CommandLine.arguments.contains("--smoke-test") || CommandLine.arguments.contains("--ui-test")
        if testMode && !root.hasPrefix("/private/tmp/") { fputs("Tests require a temporary GHOST_ROOT.\n", stderr); exit(2) }
        if !testMode {
            do { try BrowserProfile.validateApplicationIdentity() }
            catch {
                let alert = NSAlert()
                alert.messageText = "Your browser profile needs the original app identity"
                alert.informativeText = error.localizedDescription
                alert.runModal()
                exit(1)
            }
        }
        browser = Browser(root: URL(fileURLWithPath: root), testing: testMode)
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1200, height: 850), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "Ghost Browser"; window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true; window.isReleasedWhenClosed = false
        window.delegate = self
        window.contentView = NSHostingView(rootView: BrowserView(browser: browser))
        window.setFrameAutosaveName("GhostBrowserWindow"); window.center()
        installMenus()
        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self, NSApp.keyWindow === self.window else { return event }
            let modifiers = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
            let command = modifiers.contains(.command), shift = modifiers.contains(.shift)
            let key = event.charactersIgnoringModifiers?.lowercased() ?? ""
            if command {
                switch key {
                case "t": shift ? self.browser.reopen() : self.browser.newTab(); return nil
                case "w": self.browser.close(); return nil
                case "l": self.browser.showAddress(); return nil
                case "r": self.browser.active?.pending = nil; self.browser.active?.web.reload(); return nil
                case "[": if shift { self.browser.select(offset: -1) } else { self.browser.goBack() }; return nil
                case "]": if shift { self.browser.select(offset: 1) } else { self.browser.goForward() }; return nil
                case "{": self.browser.select(offset: -1); return nil
                case "}": self.browser.select(offset: 1); return nil
                case "1"..."9":
                    let index = key == "9" ? self.browser.tabs.count - 1 : (Int(key) ?? 1) - 1
                    if self.browser.tabs.indices.contains(index) { self.browser.selected = self.browser.tabs[index].id }; return nil
                case "+", "=": self.browser.active?.web.pageZoom *= 1.1; return nil
                case "-": self.browser.active?.web.pageZoom /= 1.1; return nil
                case "0": self.browser.active?.web.pageZoom = 1; return nil
                default: break
                }
            }
            if modifiers.contains(.control) && event.keyCode == 48 { self.browser.select(offset: shift ? -1 : 1); return nil }
            if event.keyCode == 53 && self.browser.addressEditing { self.browser.cancelAddress(); return nil }
            return event
        }
        window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
        if CommandLine.arguments.contains("--smoke-test") { SmokeTest.run(browser: browser) }
        else if CommandLine.arguments.contains("--ui-test") { browser.newTab() }
        else { browser.restore(); if browser.problem != nil { browser.presentProblem() } }
    }

    func installMenus() {
        // Standard macOS app/edit commands keep Quit and clipboard shortcuts functional.
        // There are no in-window menus, settings, bookmarks or history screens.
        let menu = NSMenu()
        let appItem = NSMenuItem(); menu.addItem(appItem)
        let appMenu = NSMenu(); appItem.submenu = appMenu
        appMenu.addItem(withTitle: "Hide Ghost Browser", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(withTitle: "Quit Ghost Browser", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let editItem = NSMenuItem(); menu.addItem(editItem)
        let edit = NSMenu(title: "Edit"); editItem.submenu = edit
        for (title, action, key) in [("Undo", "undo:", "z"), ("Cut", "cut:", "x"), ("Copy", "copy:", "c"), ("Paste", "paste:", "v"), ("Select All", "selectAll:", "a")] {
            edit.addItem(withTitle: title, action: Selector(action), keyEquivalent: key)
        }
        NSApp.mainMenu = menu
    }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard browser.failed.isEmpty else { browser.presentProblem(); return .terminateCancel }
        browser.saveTabs(); return .terminateNow
    }
    func windowShouldClose(_ sender: NSWindow) -> Bool {
        guard browser.failed.isEmpty else { browser.presentProblem(); return false }
        browser.saveTabs(); return true
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}
