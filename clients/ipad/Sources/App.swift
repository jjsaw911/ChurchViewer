import SwiftUI
import WebKit
import UIKit

/// ChurchViewer — the remote.
///
/// Held by whoever is running the service. It drives the display; it never puts
/// anything on the projector itself.
@main
struct ChurchViewerRemoteApp: App {
    @StateObject private var settings = Settings()

    var body: some Scene {
        WindowGroup {
            RemoteView(settings: settings)
                // A service is an hour long and an operator's hands are busy;
                // the screen going to sleep mid-song is not acceptable.
                .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
                .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
        }
    }
}

private struct RemoteView: View {
    @ObservedObject var settings: Settings

    @State private var webView: WKWebView?
    /// Where the app has been sent since it opened; nil means the stored address.
    @State private var current: URL?
    @State private var reloadToken = 0
    @State private var showingSettings = false
    @State private var status = LiveStatus()
    @Environment(\.scenePhase) private var phase

    var body: some View {
        Group {
            if let url = settings.url {
                VStack(spacing: 0) {
                    RunSheetWebView(
                        url: current ?? url,
                        reloadToken: reloadToken,
                        onReady: { webView = $0 },
                        onStatus: { status = $0 }
                    )
                    ControlBar(
                        status: status,
                        onBack: { PageKeys.press("ArrowLeft", in: webView) },
                        onNext: { PageKeys.press("ArrowRight", in: webView) },
                        onPlay: { PageKeys.press("p", in: webView) },
                        onBlank: { PageKeys.press("b", in: webView) },
                        onPlans: {
                            // Somewhere to get back to. Without it, moving from
                            // last Sunday's service to this one means retyping
                            // an address into settings.
                            current = settings.plansURL
                            reloadToken += 1
                        },
                        onSettings: { showingSettings = true }
                    )
                }
                .ignoresSafeArea(.keyboard)
            } else {
                SetupView(settings: settings)
            }
        }
        .sheet(isPresented: $showingSettings) {
            SettingsView(settings: settings, onReload: { reloadToken += 1 })
        }
        // Picked up again after being put down.
        //
        // An app in the background has its connections closed under it by iOS,
        // and the page has no way to notice — so it comes back showing whatever
        // was true when it was put down, which during a service is a remote
        // quietly describing the wrong song. Loading it again asks the server
        // what is actually on the screen, which is the only thing worth
        // trusting.
        .onChange(of: phase) { _, now in
            if now == .active { reloadToken += 1 }
        }
    }
}

/// The buttons, along the bottom where a thumb already is.
///
/// Native rather than part of the page: they must be reachable while the list
/// above is being scrolled, they must not move when it does, and they have to
/// be hittable without looking — this gets used one-handed, in a dark room, by
/// somebody also watching a band.
///
/// Six of the same button. Same size, same shape, same colour, and a symbol
/// rather than a word — the ones every phone already uses, so the bar reads at
/// a glance and in any language. What changes with state is the symbol itself:
/// play becomes pause while a song runs, and the crossed-out eye fills in while
/// the screen is blank. A row of competing colours is unreadable at a glance,
/// and a glance is all this gets.
private struct ControlBar: View {
    let status: LiveStatus
    let onBack: () -> Void
    let onNext: () -> Void
    let onPlay: () -> Void
    let onBlank: () -> Void
    let onPlans: () -> Void
    let onSettings: () -> Void

    @Environment(\.horizontalSizeClass) private var width

    private var narrow: Bool { width == .compact }
    private var height: CGFloat { 64 }

    var body: some View {
        HStack(spacing: 8) {
            key("list.bullet", "Plans", action: onPlans)
            key("gearshape", "Settings", action: onSettings)
            key("chevron.left", "Back", action: onBack)
            key("chevron.right", "Next", action: onNext)

            key(
                status.playing ? "pause.fill" : "play.fill",
                status.playing ? "Pause" : "Play",
                action: onPlay
            )
            .opacity(status.canPlay ? 1 : 0.35)
            .disabled(!status.canPlay)

            key(
                status.blank ? "eye.slash.fill" : "eye.slash",
                status.blank ? "Blanked" : "Blank",
                action: onBlank
            )
        }
        .padding(.horizontal, narrow ? 8 : 16)
        .padding(.vertical, 10)
        .background(.bar)
        .animation(.easeOut(duration: 0.15), value: status)
    }

    /// One button. There is only one kind.
    private func key(
        _ symbol: String,
        _ label: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            VStack(spacing: 3) {
                Image(systemName: symbol)
                    .font(.system(size: 22, weight: .semibold))
                // The word under the symbol rather than instead of it: the
                // symbol is what gets recognised, the word is what settles it
                // the first time somebody uses this.
                Text(label)
                    .font(.system(size: 11, weight: .medium))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .foregroundStyle(.primary)
            .frame(maxWidth: .infinity, minHeight: height)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(Color.secondary.opacity(0.14))
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// What the iPad shows before anybody has told it which service it's driving.
private struct SetupView: View {
    @ObservedObject var settings: Settings
    @State private var typed = ""

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "slider.horizontal.3")
                .font(.system(size: 52))
                .foregroundStyle(.secondary)

            Text("ChurchViewer Remote").font(.largeTitle.weight(.semibold))

            Text(
                "Your church's name. It opens on the list of plans, and you'll be asked "
                + "to sign in once."
            )
            .font(.body)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
            .frame(maxWidth: 520)

            // The name and nothing else. The rest of the address is the same
            // for every church, so it's printed rather than typed.
            HStack(spacing: 6) {
                TextField("yourchurch", text: $typed)
                    .textFieldStyle(.roundedBorder)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.asciiCapable)
                    .submitLabel(.go)
                    .onSubmit(connect)

                Text(".\(Settings.rootDomain)")
                    .font(.body)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: 520)

            Button("Connect", action: connect)
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(Settings.name(in: typed).isEmpty)
        }
        .padding(40)
    }

    private func connect() {
        let name = Settings.name(in: typed)
        if !name.isEmpty { settings.church = name }
    }
}
