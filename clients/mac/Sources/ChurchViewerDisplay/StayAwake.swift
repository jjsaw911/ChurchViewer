import Foundation

/**
 Keeps the screens on while an output window is open.

 A Mac left alone dims and then sleeps its displays, and every part of that is
 wrong here: the projector is showing a slide to a room that is reading it, and
 nobody has touched the keyboard because the person driving is holding an iPad
 twenty feet away. From the Mac's point of view, an hour of a service and an
 hour of an empty office look identical.

 `beginActivity` is the supported way to say otherwise — the same mechanism a
 video player uses, so the reason shows up in `pmset -g assertions` and the
 machine goes back to normal the moment the token is released. Both display and
 system sleep are held off: a sleeping Mac takes the sound with it.
 */
@MainActor
enum StayAwake {
    private static var token: NSObjectProtocol?
    private static var holders = 0

    /// Called as each output window appears.
    static func hold() {
        holders += 1
        guard token == nil else { return }

        token = ProcessInfo.processInfo.beginActivity(
            options: [.idleDisplaySleepDisabled, .idleSystemSleepDisabled],
            reason: "ChurchViewer is showing a service on this screen"
        )
    }

    /// Called as each one goes away. The last one out lets the Mac sleep again.
    static func release() {
        holders = max(0, holders - 1)
        guard holders == 0, let held = token else { return }

        ProcessInfo.processInfo.endActivity(held)
        token = nil
    }
}
