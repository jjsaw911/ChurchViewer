import SwiftUI
import WebKit

/// The run sheet, in the app.
///
/// The same page the operator uses in a browser, for the same reason the Mac
/// shows the same output screen: one control surface, one set of rules about
/// what "next" means, one place to fix it. The app's job is the things a
/// browser tab on an iPad is bad at — big buttons that work in a dark room, a
/// screen that doesn't sleep, and a session that survives being put down.
struct RunSheetWebView: UIViewRepresentable {
    let url: URL
    let reloadToken: Int
    /// Handed back so the buttons below can talk to the page.
    let onReady: (WKWebView) -> Void
    /// What the page says is true, so the buttons can show it.
    let onStatus: (LiveStatus) -> Void

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        // The page posts here whenever what's on the screen changes. Without
        // it, Blank is a button that changes no colour whatever it does.
        configuration.userContentController.add(context.coordinator, name: "live")

        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = context.coordinator
        view.allowsBackForwardNavigationGestures = false
        view.load(URLRequest(url: url))
        onReady(view)
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {
        if context.coordinator.reloadToken != reloadToken {
            context.coordinator.reloadToken = reloadToken
            view.load(URLRequest(url: url))
            return
        }

        if context.coordinator.loadedURL != url {
            context.coordinator.loadedURL = url
            view.load(URLRequest(url: url))
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(url: url, reloadToken: reloadToken, onStatus: onStatus)
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        var loadedURL: URL
        var reloadToken: Int
        private let onStatus: (LiveStatus) -> Void
        private var retries = 0

        init(url: URL, reloadToken: Int, onStatus: @escaping (LiveStatus) -> Void) {
            self.loadedURL = url
            self.reloadToken = reloadToken
            self.onStatus = onStatus
        }

        func userContentController(
            _ controller: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            guard let body = message.body as? [String: Any] else { return }
            onStatus(
                LiveStatus(
                    blank: body["blank"] as? Bool ?? false,
                    playing: body["playing"] as? Bool ?? false,
                    canPlay: body["canPlay"] as? Bool ?? false
                )
            )
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { retries = 0 }

        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation!,
            withError error: Error
        ) {
            retry(webView)
        }

        func webView(
            _ webView: WKWebView,
            didFail navigation: WKNavigation!,
            withError error: Error
        ) {
            retry(webView)
        }

        /// Wifi drops and iPads sleep. Coming back on its own is the difference
        /// between a remote and a thing somebody has to fiddle with mid-song.
        private func retry(_ webView: WKWebView) {
            retries += 1
            let delay = min(20, pow(2, Double(min(retries, 4))))

            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak webView] in
                guard let webView, !webView.isLoading else { return }
                webView.load(URLRequest(url: self.loadedURL))
            }
        }
    }
}

/// Pressing the page's own keys from a native button.
///
/// The run sheet already listens for arrows, space and `B`, and everything
/// behind them — what "next" means at the end of a song, how the change reaches
/// the projector, who is allowed to do it — lives there. Sending a key is how
/// this app borrows all of it instead of writing a second copy that can
/// disagree with the first.
enum PageKeys {
    static func press(_ key: String, in webView: WKWebView?) {
        guard let webView else { return }

        let script = """
        (function () {
          const event = new KeyboardEvent('keydown', {
            key: '\(key)', bubbles: true, cancelable: true
          });
          window.dispatchEvent(event);
          return true;
        })();
        """

        webView.evaluateJavaScript(script)
    }
}
