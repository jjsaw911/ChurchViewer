import Foundation
import SwiftUI

/// The one thing this app needs to know: which church it's driving.
///
/// Not an address — a name. Every church is at `<name>.churchviewer.com`, so
/// asking for the address means asking somebody to type a domain they've never
/// typed before, on a keyboard, standing up, five minutes before a service.
/// They know what their church is called. That's the whole setting.
///
/// Same shape as the Mac's settings and for the same reason: an iPad at a
/// church is set up once, by whoever is free, and then used every week by
/// somebody else.
@MainActor
final class Settings: ObservableObject {
    /// Where every church lives. One place, so nothing else has to know it.
    static let rootDomain = "churchviewer.com"

    /**
     Where the remote opens: whatever service the church is on.

     The same address the projector uses, deliberately. Landing on a list means
     somebody picks a service, and the Sunday they pick last week's the remote
     and the screen are driving two different plans — which looks, from either
     end, exactly like the app being broken.
     */
    static let runPath = "/present/today"

    /** The plans list, for the weeks with two services or a change of mind. */
    static let plansPath = "/admin/services"

    @Published var church: String {
        didSet { UserDefaults.standard.set(church, forKey: "church") }
    }

    init() {
        let defaults = UserDefaults.standard
        // An earlier version asked for the whole address. An iPad that already
        // works must not start asking to be set up again, so whatever was typed
        // then is read back as the name it contained.
        church = defaults.string(forKey: "church")
            ?? Settings.name(in: defaults.string(forKey: "runSheetURL") ?? "")
    }

    /**
     The church's name out of anything somebody might have typed.

     `citychurch`, `citychurch.churchviewer.com`, or the full address of a run
     sheet pasted from a laptop all name the same church, and all of them are
     things people actually do.
     */
    static func name(in typed: String) -> String {
        var text = typed.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if let range = text.range(of: "://") { text = String(text[range.upperBound...]) }
        if let slash = text.firstIndex(of: "/") { text = String(text[..<slash]) }

        // A host, or a bare name. Either way the church is the first label —
        // unless the first label is the site itself, which names no church.
        let first = text.split(separator: ".").first.map(String.init) ?? ""
        return first == "www" ? "" : first
    }

    /**
     Where to open: the church's plans, not its public front page.

     The front page is the sermon library, which is no use at all to somebody
     about to run a service.
     */
    var url: URL? {
        let name = Settings.name(in: church)
        guard !name.isEmpty else { return nil }
        return URL(string: "https://\(name).\(Settings.rootDomain)\(Settings.runPath)")
    }

    /** The same church, back at the list, for switching between services. */
    var plansURL: URL? {
        let name = Settings.name(in: church)
        guard !name.isEmpty else { return nil }
        return URL(string: "https://\(name).\(Settings.rootDomain)\(Settings.plansPath)")
    }

    var isConfigured: Bool { url != nil }
}
