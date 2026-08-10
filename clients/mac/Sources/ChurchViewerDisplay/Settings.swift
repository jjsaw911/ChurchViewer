import Foundation
import AppKit

/// What the church sets once and never thinks about again.
///
/// Kept in `UserDefaults` rather than in a file next to the app: the Mac at a
/// church gets rebuilt, moved between users, and occasionally re-installed by
/// somebody who is not the person who set it up, and defaults survive all of
/// that in the place a Mac administrator would look.
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
    }

    var isConfigured: Bool { URL(string: displayURL)?.scheme?.hasPrefix("http") == true }

    /// The screen the words belong on, or the main one if that screen has gone.
    ///
    /// A projector that has been unplugged shouldn't leave the app with nowhere
    /// to draw; falling back to the main screen is visible and recoverable,
    /// where refusing to open a window is neither.
    func targetScreen() -> NSScreen? {
        NSScreen.screens.first { $0.localizedName == screenName } ?? NSScreen.main
    }
}
