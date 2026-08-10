import AppKit

/// Putting each window where it belongs.
///
/// Two windows, two screens, and getting them the wrong way round is the whole
/// problem this solves: the words go on the projector, and everything the
/// operator touches stays on the Mac's own screen where the congregation can't
/// read it.
@MainActor
enum WindowPlacement {
    /// The display window is the one showing the page; the settings window is
    /// the other one. Titles are how SwiftUI's scenes are told apart from here.
    private static func window(titled title: String) -> NSWindow? {
        NSApp.windows.first { $0.title == title && $0.isVisible }
    }

    private static var displayWindow: NSWindow? {
        window(titled: "ChurchViewer Display") ?? NSApp.windows.first { $0.isVisible }
    }

    static func moveDisplayWindow(to screen: NSScreen?, fullScreen: Bool) {
        guard let window = displayWindow else { return }

        if let screen, window.screen != screen {
            // Leaving full screen first: a window already filling one screen
            // cannot be dragged onto another.
            if window.styleMask.contains(.fullScreen) {
                window.toggleFullScreen(nil)
            }
            window.setFrame(screen.visibleFrame, display: true)
        }

        window.makeKeyAndOrderFront(nil)

        guard fullScreen, !window.styleMask.contains(.fullScreen) else { return }

        // A beat for the move to land before the mode change; doing both in one
        // pass puts it full screen on the screen it came from.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
            window.toggleFullScreen(nil)
        }
    }

    static func leaveFullScreen() {
        guard let window = displayWindow else { return }
        if window.styleMask.contains(.fullScreen) {
            window.toggleFullScreen(nil)
        }
    }

    /// Settings belongs in front of whoever opened it — never on the projector.
    static func bringSettingsToOperator() {
        guard let settings = window(titled: "Settings"), let main = NSScreen.main else { return }

        if settings.screen != main {
            let frame = settings.frame
            let visible = main.visibleFrame
            settings.setFrameOrigin(
                NSPoint(
                    x: visible.midX - frame.width / 2,
                    y: visible.midY - frame.height / 2
                )
            )
        }

        settings.level = .floating
        settings.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
}
