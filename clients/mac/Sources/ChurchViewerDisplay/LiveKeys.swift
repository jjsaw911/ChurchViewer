import WebKit

/**
 Pressing a key inside the projector's page, from outside it.

 The menu bar is the one thing reachable while two windows are filling two
 screens, so it is where an override belongs — but the state it is overriding
 lives in the page, shared with every remote in the building. Rather than teach
 this app the protocol as well, it presses the same keys a person would: one
 place decides what "pause" means, and it is the same place for the operator's
 iPad and for whoever is standing at the machine.

 Held weakly. A window that has been closed should not be kept alive by a menu
 item nobody has clicked.
 */
@MainActor
enum LiveKeys {
    private static weak var projector: WKWebView?

    static func register(_ view: WKWebView, as surface: String) {
        guard surface == "Projector" else { return }
        projector = view
    }

    static func press(_ key: String) {
        guard let projector else { return }

        let script = """
        (function () {
          window.dispatchEvent(new KeyboardEvent('keydown', {
            key: '\(key)', bubbles: true, cancelable: true
          }));
          return true;
        })();
        """

        projector.evaluateJavaScript(script)
    }
}
