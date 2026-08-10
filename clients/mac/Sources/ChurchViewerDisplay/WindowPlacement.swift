import AppKit

/// Putting the window on the right screen.
///
/// The standard full-screen button fills whichever screen the window happens to
/// be on, and the church's Mac has two — one with the menu bar and one hanging
/// off an HDMI cable. So the window is moved onto the chosen screen first and
/// only then told to fill it.
@MainActor
enum WindowPlacement {
    static func moveKeyWindow(to screen: NSScreen?, fullScreen: Bool) {
        guard let window = NSApp.keyWindow ?? NSApp.windows.first else { return }

        if let screen, window.screen != screen {
            // Leaving full screen first: a window already filling one screen
            // cannot be dragged onto another.
            if window.styleMask.contains(.fullScreen) {
                window.toggleFullScreen(nil)
            }
            window.setFrame(screen.visibleFrame, display: true)
        }

        guard fullScreen, !window.styleMask.contains(.fullScreen) else { return }

        // A beat for the move to land before the mode change; doing both in one
        // pass puts it full screen on the screen it came from.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
            window.toggleFullScreen(nil)
        }
    }

    static func leaveFullScreen() {
        guard let window = NSApp.keyWindow ?? NSApp.windows.first else { return }
        if window.styleMask.contains(.fullScreen) {
            window.toggleFullScreen(nil)
        }
    }
}
