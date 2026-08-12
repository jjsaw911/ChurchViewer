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
    }
}

/// The buttons, along the bottom where a thumb already is.
///
/// Native rather than part of the page: they must be reachable while the list
/// above is being scrolled, they must not move when it does, and they have to
/// be hittable without looking — this gets used one-handed, in a dark room, by
/// somebody also watching a band.
///
/// One shape, one height, one corner radius, and colour used for exactly two
/// things: which button is the one you want (Next), and what is true right now
/// (a song running, a screen blanked). Everything else is quiet. A row of
/// competing colours is unreadable at a glance, and a glance is all this gets.
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
        HStack(spacing: 10) {
            // The two that aren't part of running a service, kept small and out
            // of the way of the three that are.
            quiet("list.bullet.rectangle", "All plans", action: onPlans)
            quiet("gearshape", "Settings", action: onSettings)

            key(
                title: "Back",
                symbol: "chevron.left",
                tint: .secondary.opacity(0.16),
                foreground: .primary,
                width: narrow ? 64 : 132,
                action: onBack
            )

            // Next is pressed ten times as often as anything else here, so it
            // gets the room and the one strong colour.
            key(
                title: "Next",
                symbol: "chevron.right",
                tint: .accentColor,
                foreground: .white,
                width: nil,
                prominent: true,
                action: onNext
            )

            // Green while stopped means "this will start"; grey while running
            // means "this will stop". The word changes with it.
            key(
                title: status.playing ? "Stop" : "Play",
                symbol: status.playing ? "stop.fill" : "play.fill",
                tint: status.playing ? Color.primary.opacity(0.85) : Color.green,
                foreground: status.playing ? Color(.systemBackground) : .white,
                width: narrow ? 64 : 128,
                action: onPlay
            )
            .opacity(status.canPlay ? 1 : 0.35)
            .disabled(!status.canPlay)

            // Filled red only while the screen really is blank, so the button
            // is the answer to "is it blank?" and not just a way to ask.
            key(
                title: "Blank",
                symbol: status.blank ? "eye.slash.fill" : "eye.slash",
                tint: status.blank ? Color.red : Color.secondary.opacity(0.16),
                foreground: status.blank ? .white : .primary,
                width: narrow ? 64 : 128,
                action: onBlank
            )
        }
        .padding(.horizontal, narrow ? 10 : 16)
        .padding(.vertical, 10)
        .background(.bar)
        .animation(.easeOut(duration: 0.15), value: status)
    }

    /// A small, unobtrusive icon button.
    private func quiet(
        _ symbol: String,
        _ label: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 17, weight: .medium))
                .frame(width: narrow ? 42 : 52, height: height)
                .foregroundStyle(.secondary)
                .background(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(Color.secondary.opacity(0.10))
                )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    /// One of the three that run the service. All the same shape.
    private func key(
        title: String,
        symbol: String,
        tint: Color,
        foreground: Color,
        width: CGFloat?,
        prominent: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 7) {
                Image(systemName: symbol)
                    .font(.system(size: prominent ? 20 : 17, weight: .semibold))
                // On a phone there are about a hundred points less to go round,
                // so the words come off rather than the buttons shrinking: a
                // smaller target is worse than an unlabelled one when nobody is
                // looking at their hands anyway.
                if !narrow || prominent {
                    Text(title).font(.system(size: prominent ? 19 : 16, weight: .semibold))
                }
            }
            .foregroundStyle(foreground)
            .frame(maxWidth: width == nil ? .infinity : nil, minHeight: height)
            .frame(width: width)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(tint))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
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
