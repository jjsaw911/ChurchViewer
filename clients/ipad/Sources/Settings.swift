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

    var url: URL? {
        guard let url = URL(string: runSheetURL), url.scheme?.hasPrefix("http") == true else {
            return nil
        }
        return url
    }

    var isConfigured: Bool { url != nil }
}
