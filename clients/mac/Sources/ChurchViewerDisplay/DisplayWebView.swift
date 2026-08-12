import SwiftUI
import WebKit

/// The output screen itself.
///
/// It's the web presenter in a `WKWebView` rather than a slide renderer written
/// a second time in Swift. That isn't laziness about the work — it's that two
/// renderers drift, and the day they disagree is a Sunday where the screen at
/// the back of the room shows something the operator's screen doesn't.
///
/// The web view keeps its own cookies in the app's data store, so signing in
/// happens once and survives restarts.
struct DisplayWebView: NSViewRepresentable {
    let url: URL
    /// Bumped to force a reload — a projector that showed a blank page needs a
    /// way back that isn't quitting the app.
    let reloadToken: Int

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()

        // This window plays the recordings, and nothing here will ever start on
        // its own: the instruction comes from a person pressing Start on the
        // remote. It just arrives over the network instead of as a click in
        // this window, which is precisely what a browser's autoplay rule cannot
        // tell apart — left switched on, it refuses the play, the flag goes
        // back, and Start looks like a button that does nothing.
        //
        // The sound system is wired to this Mac. That is the whole reason the
        // audio plays here rather than in the operator's hand.
        configuration.mediaTypesRequiringUserActionForPlayback = []

        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = context.coordinator
        view.setValue(false, forKey: "drawsBackground")
        view.load(URLRequest(url: url))
        return view
    }

    func updateNSView(_ view: WKWebView, context: Context) {
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
        Coordinator(loadedURL: url, reloadToken: reloadToken)
    }

    /// Retries a failed load rather than sitting on an error page.
    ///
    /// The wifi at a church drops. When it comes back, nobody should have to
    /// walk to the Mac — and the page it's trying to reach is the one thing
    /// standing between the room and the words.
    final class Coordinator: NSObject, WKNavigationDelegate {
        var loadedURL: URL
        var reloadToken: Int
        private var retries = 0

        init(loadedURL: URL, reloadToken: Int) {
            self.loadedURL = loadedURL
            self.reloadToken = reloadToken
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            retries = 0
        }

        func webView(
            _ webView: WKWebView,
            didFail navigation: WKNavigation!,
            withError error: Error
        ) {
            scheduleRetry(webView)
        }

        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation!,
            withError error: Error
        ) {
            scheduleRetry(webView)
        }

        private func scheduleRetry(_ webView: WKWebView) {
            // Backs off to half a minute and stays there: a service is an hour
            // long and the network usually comes back inside one.
            retries += 1
            let delay = min(30, pow(2, Double(min(retries, 5))))

            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak webView] in
                guard let webView, webView.url == nil || webView.isLoading == false else { return }
                webView.load(URLRequest(url: self.loadedURL))
            }
        }
    }
}
