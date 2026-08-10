import Foundation
import AppKit

/// What the church sets once and never thinks about again.
///
/// Kept in `UserDefaults` rather than in a file next to the app: the Mac at a
/// church gets rebuilt, moved between users, and occasionally re-installed by
/// somebody who is not the person who set it up, and defaults survive all of
/// that in the place a Mac administrator would look. It's also what the
/// installer writes, so a scripted setup and the settings window are two doors
/// into one room.
@MainActor
final class Settings: ObservableObject {
    /// The output screen for the service, copied from the browser's address bar.
    @Published var displayURL: String {
        didSet { UserDefaults.standard.set(displayURL, forKey: Keys.displayURL) }
    }

    /// Which physical screen the words go on. Matched by name, because the
    /// number a screen has changes when a projector is unplugged and plugged in.
    @Published var screenName: String {
        didSet { UserDefaults.standard.set(screenName, forKey: Keys.screenName) }
    }

    /// Whether to go straight to full screen on the chosen display at launch.
    @Published var fullScreenOnLaunch: Bool {
        didSet { UserDefaults.standard.set(fullScreenOnLaunch, forKey: Keys.fullScreenOnLaunch) }
    }

    /// Whether the Mac opens this by itself after a restart — which is what
    /// happens to a church machine on a Saturday night after an update.
    @Published var openAtLogin: Bool {
        didSet { LoginItem.set(enabled: openAtLogin) }
    }

    private enum Keys {
        static let displayURL = "displayURL"
        static let screenName = "screenName"
        static let fullScreenOnLaunch = "fullScreenOnLaunch"
    }

    init() {
        let defaults = UserDefaults.standard
        displayURL = defaults.string(forKey: Keys.displayURL) ?? ""
        screenName = defaults.string(forKey: Keys.screenName) ?? ""
        fullScreenOnLaunch = defaults.bool(forKey: Keys.fullScreenOnLaunch)
        openAtLogin = LoginItem.isEnabled
    }

    var isConfigured: Bool { URL(string: displayURL)?.scheme?.hasPrefix("http") == true }

    var url: URL? { isConfigured ? URL(string: displayURL) : nil }

    /// The screen the words belong on, or the main one if that screen has gone.
    ///
    /// A projector that has been unplugged shouldn't leave the app with nowhere
    /// to draw; falling back to the main screen is visible and recoverable,
    /// where refusing to open a window is neither.
    func targetScreen() -> NSScreen? {
        NSScreen.screens.first { $0.localizedName == screenName } ?? NSScreen.main
    }
}

/// Opening at login, as a launch agent.
///
/// The same file the installer writes, so turning the switch off in the app
/// undoes what the installer did rather than fighting it.
enum LoginItem {
    private static let label = "com.churchviewer.display"

    private static var plistURL: URL {
        FileManager.default
            .homeDirectoryForCurrentUser
            .appendingPathComponent("Library/LaunchAgents/\(label).plist")
    }

    static var isEnabled: Bool { FileManager.default.fileExists(atPath: plistURL.path) }

    static func set(enabled: Bool) {
        let path = plistURL
        if enabled {
            let app = Bundle.main.bundlePath
            let plist = """
            <?xml version="1.0" encoding="UTF-8"?>
            <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
            <plist version="1.0">
            <dict>
              <key>Label</key><string>\(label)</string>
              <key>ProgramArguments</key>
              <array>
                <string>/usr/bin/open</string>
                <string>-a</string>
                <string>\(app)</string>
              </array>
              <key>RunAtLoad</key><true/>
            </dict>
            </plist>
            """

            try? FileManager.default.createDirectory(
                at: path.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try? plist.write(to: path, atomically: true, encoding: .utf8)
            launchctl("load")
        } else {
            launchctl("unload")
            try? FileManager.default.removeItem(at: path)
        }
    }

    private static func launchctl(_ verb: String) {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/bin/launchctl")
        task.arguments = [verb, plistURL.path]
        // A launch agent that won't register is worth a switch that goes back,
        // not a crash in front of somebody setting up a projector.
        try? task.run()
    }
}
