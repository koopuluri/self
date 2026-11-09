import AppKit
import SwiftUI
import WebKit

/// Shared hover, press and cursor feedback for the browser chrome controls.
struct ChromeButtonStyle: ButtonStyle {
    var selected = false
    var cornerRadius: CGFloat = 7

    func makeBody(configuration: Configuration) -> some View {
        ChromeButtonBody(configuration: configuration, selected: selected, cornerRadius: cornerRadius)
    }

    private struct ChromeButtonBody: View {
        let configuration: ButtonStyle.Configuration
        let selected: Bool
        let cornerRadius: CGFloat
        @State private var hovered = false
        @Environment(\.isEnabled) private var isEnabled
        @Environment(\.accessibilityReduceMotion) private var reduceMotion

        private var opacity: Double {
            guard isEnabled else { return 0 }
            if configuration.isPressed { return selected ? 0.22 : 0.16 }
            if hovered { return selected ? 0.17 : 0.08 }
            return selected ? 0.12 : 0
        }

        var body: some View {
            configuration.label
                .foregroundStyle(Color.primary.opacity(!isEnabled ? 0.25 : selected || hovered || configuration.isPressed ? 1 : 0.72))
                .background(Color.primary.opacity(opacity), in: RoundedRectangle(cornerRadius: cornerRadius))
                .overlay {
                    RoundedRectangle(cornerRadius: cornerRadius)
                        .strokeBorder(Color.primary.opacity(selected ? 0.08 : 0), lineWidth: 1)
                        .allowsHitTesting(false)
                }
                .contentShape(RoundedRectangle(cornerRadius: cornerRadius))
                .onHover { hovered = $0 }
                .animation(reduceMotion ? nil : .easeOut(duration: 0.12), value: hovered)
                .modifier(ChromePointer())
        }
    }
}

private struct ChromePointer: ViewModifier {
    @Environment(\.isEnabled) private var isEnabled

    func body(content: Content) -> some View {
        if !isEnabled {
            content
        } else if #available(macOS 15, *) {
            content.pointerStyle(.link)
        } else {
            content.background(LegacyCursorRegion())
        }
    }
}

/// Cursor rectangles let AppKit restore the cursor when a tab moves or disappears.
private struct LegacyCursorRegion: NSViewRepresentable {
    final class CursorView: NSView {
        override func resetCursorRects() {
            super.resetCursorRects()
            addCursorRect(visibleRect, cursor: .pointingHand)
        }
        override func hitTest(_ point: NSPoint) -> NSView? { nil }
    }
    func makeNSView(context: Context) -> CursorView { CursorView() }
    func updateNSView(_ view: CursorView, context: Context) {
        view.window?.invalidateCursorRects(for: view)
    }
}

/// Keep WebKit's native link hit-testing and action. The UI delegate routes its
/// new-window request into a Ghost tab, including links in frames and images.
final class BrowserWebView: WKWebView {
    override func willOpenMenu(_ menu: NSMenu, with event: NSEvent) {
        super.willOpenMenu(menu, with: event)
        for item in menu.items where item.identifier?.rawValue == "WKMenuItemIdentifierOpenLinkInNewWindow" {
            item.title = "Open Link in New Tab"
        }
    }
}
