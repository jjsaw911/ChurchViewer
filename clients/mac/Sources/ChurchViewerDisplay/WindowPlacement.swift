import AppKit

/// Putting each window where it belongs.
///
/// Three windows and two or three screens, and getting them the wrong way round
/// is the whole problem this solves: the words go on the projector, the stage
/// view goes on the monitor facing the platform, and anything the operator
/// touches stays on the Mac's own screen where the room can't read it.
@MainActor
enum WindowPlacement {
    private static func find(_ title: String) -> NSWindow? {
        NSApp.windows.first { $0.title == title && $0.isVisible }
    }

    static func move(window title: String, to screen: NSScreen?, fullScreen: Bool) {
        guard let window = find(title) else { return }

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

    static func leaveFullScreen(window title: String) {
        guard let window = find(title), window.styleMask.contains(.fullScreen) else { return }
        window.toggleFullScreen(nil)
    }

    /// Settings belongs in front of whoever opened it — never on the projector.
    static func bringSettingsToOperator() {
        guard let settings = find("Settings"), let main = NSScreen.main else { return }

        if settings.screen != main {
            let frame = settings.frame
            let visible = main.visibleFrame
            settings.setFrameOrigin(
                NSPoint(x: visible.midX - frame.width / 2, y: visible.midY - frame.height / 2)
            )
        }

        settings.level = .floating
        settings.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
}
