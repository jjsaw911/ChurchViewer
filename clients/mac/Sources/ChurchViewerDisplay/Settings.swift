import Foundation
import AppKit

/// One output: an address, a screen to put it on, and whether to fill that
/// screen the moment the app opens.
///
/// There are two of these — the projector and the stage monitor — because a
/// church Mac usually has both hanging off it, showing different things to
/// different people. The stage one is optional; plenty of rooms have no monitor
/// facing the platform.
@MainActor
final class OutputSettings: ObservableObject {
    let name: String
    private let prefix: String

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

    init(name: String, prefix: String, legacyURLKey: String? = nil) {
        self.name = name
        self.prefix = prefix

        let defaults = UserDefaults.standard
        // An earlier version stored the projector under different names; a Mac
        // that has already been set up shouldn't be set up again.
        address = defaults.string(forKey: "\(prefix)URL")
            ?? legacyURLKey.flatMap { defaults.string(forKey: $0) }
            ?? ""
        screenName = defaults.string(forKey: "\(prefix)Screen")
            ?? defaults.string(forKey: "screenName")
            ?? ""
        fillOnLaunch = defaults.object(forKey: "\(prefix)FullScreen") as? Bool
            ?? defaults.bool(forKey: "fullScreenOnLaunch")
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
    /// Where every church lives. One place, so nothing else has to know it.
    static let rootDomain = "churchviewer.com"

    /// The standing addresses: not one service, but whichever one the church is
    /// on. Pointed at a single Sunday, this Mac would need somebody to come and
    /// change it every week — and the week they forget, the screen quietly puts
    /// last week's songs in front of the congregation.
    static let projectorPath = "/present/today/screen"
    static let stagePath = "/present/today/stage"

    /// What the room sees: words, over whatever background the plan carries.
    let projector = OutputSettings(name: "Projector", prefix: "projector", legacyURLKey: "displayURL")

    /// What the platform sees: this slide, the next one, the notes, the clock.
    let stage = OutputSettings(name: "Stage", prefix: "stage")

    @Published var openAtLogin: Bool {
        didSet { LoginItem.set(enabled: openAtLogin) }
    }

    init() {
        openAtLogin = LoginItem.isEnabled
    }

    var isConfigured: Bool { projector.isConfigured || stage.isConfigured }

    /**
     The church's name out of anything somebody might have typed or pasted.

     `citychurch`, `citychurch.churchviewer.com`, or a whole run sheet address
     copied off a laptop all name the same church, and all three are things
     people actually do.
     */
    static func name(in typed: String) -> String {
        var text = typed.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if let range = text.range(of: "://") { text = String(text[range.upperBound...]) }
        if let slash = text.firstIndex(of: "/") { text = String(text[..<slash]) }

        let first = text.split(separator: ".").first.map(String.init) ?? ""
        return first == "www" ? "" : first
    }

    /// Which church both outputs are currently pointed at, if they are.
    var church: String { Settings.name(in: projector.address.isEmpty ? stage.address : projector.address) }

    /**
     Point both windows at a church, and stop asking about addresses.

     One name is all a church has to remember. The two addresses are written
     underneath it, and stay editable for the rare case of driving one specific
     service from a machine that isn't the one at the projector.
     */
    func point(at typed: String) {
        let name = Settings.name(in: typed)
        guard !name.isEmpty else { return }

        let host = "https://\(name).\(Settings.rootDomain)"
        projector.address = host + Settings.projectorPath
        stage.address = host + Settings.stagePath
        objectWillChange.send()
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
