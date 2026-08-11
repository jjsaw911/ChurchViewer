import Foundation
import SwiftUI

/// The one thing this app needs to know: which run sheet it's driving.
///
/// Same shape as the Mac's settings and for the same reason — an iPad at a
/// church is set up once, by whoever is free, and then used every week by
/// somebody else.
@MainActor
final class Settings: ObservableObject {
    @Published var runSheetURL: String {
        didSet { UserDefaults.standard.set(runSheetURL, forKey: "runSheetURL") }
    }

    init() {
        runSheetURL = UserDefaults.standard.string(forKey: "runSheetURL") ?? ""
    }

    /**
     Where to open.

     Typing the church's address is the thing somebody can do from memory, so
     that's what's asked for — and a bare address opens the plans list rather
     than the church's public front page, which is the library and no use at
     all to whoever is running the service. A full address with a path on it is
     left alone, for going straight to one service.

     A missing scheme is filled in: nobody types https:// on a phone.
     */
    var url: URL? {
        let typed = runSheetURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !typed.isEmpty else { return nil }

        let withScheme = typed.contains("://") ? typed : "https://\(typed)"
        guard var parts = URLComponents(string: withScheme), parts.host != nil else { return nil }

        if parts.path.isEmpty || parts.path == "/" {
            parts.path = Settings.plansPath
        }
        return parts.url
    }

    /** The plans list — every service, each with a way into its run sheet. */
    static let plansPath = "/admin/services"

    /** The same church, back at the list, for switching between services. */
    var plansURL: URL? {
        guard let url, var parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            return nil
        }
        parts.path = Settings.plansPath
        parts.query = nil
        return parts.url
    }

    var isConfigured: Bool { url != nil }
}
