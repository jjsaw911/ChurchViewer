import Foundation
import AppKit

/// One output: an address, a screen to put it on, and whether to fill that
/// screen the moment the app opens.
///
/// Four of these exist. **A** faces the platform and **B** faces the room —
/// those are the two every church uses. **C** and **D** are spare, for an
/// overflow screen, a lobby television, or a feed going to a stream, and they
/// stay out of the way until somebody gives one an address.
///
/// Four rather than an open-ended list because each output is a real macOS
/// window, and windows have to be declared when the app is built rather than
/// conjured while it runs. Four is more than any room here needs.
@MainActor
final class OutputSettings: ObservableObject, Identifiable {
    /// The window this output owns. Also its `Identifiable` id.
    ///
    /// `nonisolated` because `Identifiable` doesn't promise the main actor, and
    /// this class does. It's a constant `String`, so there's nothing to race.
    nonisolated let id: String

    /// A, B, C or D — the shorthand used when setting the room up.
    let letter: String

    /// What it's for, in one word: Stage, Audience, Screen C…
    let name: String

    /// The window's title. `WindowPlacement` finds windows by this, so no two
    /// outputs may share one.
    let windowTitle: String

    /// Shown in the settings window and on the window before it's set up.
    let purpose: String

    let symbol: String

    /// C and D, which are hidden behind a disclosure until wanted.
    let isSpare: Bool

    private let prefix: String

    var label: String { "\(letter) — \(name)" }

    @Published var address: String {
        didSet { UserDefaults.standard.set(address, forKey: "\(prefix)URL") }
    }

    /// Matched by name, because the number a screen has changes the moment a
    /// projector is unplugged and plugged back in.
    @Published var screenName: String {
        didSet { UserDefaults.standard.set(screenName, forKey: "\(prefix)Screen") }
    }

    @Published var fillOnLaunch: Bool {
        didSet { UserDefaults.standard.set(fillOnLaunch, forKey: "\(prefix)FullScreen") }
    }

    init(
        id: String,
        letter: String,
        name: String,
        windowTitle: String,
        purpose: String,
        symbol: String,
        prefix: String,
        isSpare: Bool = false,
        legacyURLKey: String? = nil
    ) {
        self.id = id
        self.letter = letter
        self.name = name
        self.windowTitle = windowTitle
        self.purpose = purpose
        self.symbol = symbol
        self.isSpare = isSpare
        self.prefix = prefix

        let defaults = UserDefaults.standard
        // An earlier version stored the projector under different names; a Mac
        // that has already been set up shouldn't be set up again.
        address = defaults.string(forKey: "\(prefix)URL")
            ?? legacyURLKey.flatMap { defaults.string(forKey: $0) }
            ?? ""

        // The pre-A/B settings had one screen and one fill flag for the whole
        // app. A and B inherit them so a Mac already set up stays set up; the
        // spares must not, or C and D would silently arrive pointed at the
        // projector.
        let legacyScreen: String? = isSpare ? nil : defaults.string(forKey: "screenName")
        let legacyFill: Bool = isSpare ? false : defaults.bool(forKey: "fullScreenOnLaunch")

        screenName = defaults.string(forKey: "\(prefix)Screen") ?? legacyScreen ?? ""
        fillOnLaunch = defaults.object(forKey: "\(prefix)FullScreen") as? Bool ?? legacyFill
    }

    var url: URL? {
        guard let url = URL(string: address), url.scheme?.hasPrefix("http") == true else {
            return nil
        }
        return url
    }

    var isConfigured: Bool { url != nil }

    /// The screen this output belongs on, or the main one if it has gone.
    func targetScreen() -> NSScreen? {
        NSScreen.screens.first { $0.localizedName == screenName } ?? NSScreen.main
    }
}

/// Everything the church sets once and never thinks about again.
@MainActor
final class Settings: ObservableObject {
    /// **A** — what the platform sees, looking back down the room: this slide,
    /// the next one, the notes, the clock. No background behind any of it; the
    /// people reading it are the ones who need the words, not the atmosphere.
    let stage = OutputSettings(
        id: "stage",
        letter: "A",
        name: "Stage",
        windowTitle: "Stage",
        purpose: "For the monitor facing the platform. Notes, what's next and the "
            + "clock, with no background. From a plan: Run it, then Open the stage display.",
        symbol: "music.mic",
        prefix: "stage"
    )

    /// **B** — what the room sees: the words, over whatever background the plan
    /// carries. The one the congregation is actually looking at.
    let audience = OutputSettings(
        id: "projector",
        letter: "B",
        name: "Audience",
        windowTitle: "Projector",
        purpose: "For the projector the congregation watches. Slides and lyrics over "
            + "the plan's background. From a plan: Run it, then Open the output screen.",
        symbol: "sparkles.tv",
        prefix: "projector",
        legacyURLKey: "displayURL"
    )

    /// **C** and **D** — spare. An overflow room, a screen in the foyer, a
    /// second projector showing something other than B. Empty until needed.
    let spareC = OutputSettings(
        id: "screenC",
        letter: "C",
        name: "Screen C",
        windowTitle: "Screen C",
        purpose: "Spare. An overflow room, a foyer screen, or a second projector "
            + "showing something other than B. Leave empty if unused.",
        symbol: "display",
        prefix: "screenC",
        isSpare: true
    )

    let spareD = OutputSettings(
        id: "screenD",
        letter: "D",
        name: "Screen D",
        windowTitle: "Screen D",
        purpose: "Spare. Leave empty if unused.",
        symbol: "display",
        prefix: "screenD",
        isSpare: true
    )

    /// In the order they're offered, which is the order a room gets set up in.
    var all: [OutputSettings] { [stage, audience, spareC, spareD] }

    /// The ones with an address — everything the app should actually open.
    var configured: [OutputSettings] { all.filter(\.isConfigured) }

    @Published var openAtLogin: Bool {
        didSet { LoginItem.set(enabled: openAtLogin) }
    }

    init() {
        openAtLogin = LoginItem.isEnabled
    }

    var isConfigured: Bool { !configured.isEmpty }
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
