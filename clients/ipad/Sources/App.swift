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

    var body: some View {
        Group {
            if let url = settings.url {
                VStack(spacing: 0) {
                    RunSheetWebView(url: current ?? url, reloadToken: reloadToken) { webView = $0 }
                    ControlBar(
                        onBack: { PageKeys.press("ArrowLeft", in: webView) },
                        onNext: { PageKeys.press("ArrowRight", in: webView) },
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
/// On a phone the same four buttons have about a hundred points less to live
/// in, so the words come off Back and Blank rather than the buttons shrinking:
/// a smaller target is worse than an unlabelled one when nobody is looking at
/// their hands anyway.
private struct ControlBar: View {
    let onBack: () -> Void
    let onNext: () -> Void
    let onBlank: () -> Void
    let onPlans: () -> Void
    let onSettings: () -> Void

    @Environment(\.horizontalSizeClass) private var width

    private var narrow: Bool { width == .compact }

    var body: some View {
        HStack(spacing: narrow ? 8 : 12) {
            Button(action: onPlans) {
                Image(systemName: "list.bullet.rectangle")
                    .font(.title3)
                    .frame(width: narrow ? 44 : 56, height: 68)
            }
            .buttonStyle(.bordered)
            .accessibilityLabel("All plans")

            Button(action: onSettings) {
                Image(systemName: "gearshape.fill")
                    .font(.title3)
                    .frame(width: narrow ? 44 : 56, height: 68)
            }
            .buttonStyle(.bordered)
            .accessibilityLabel("Settings")

            // Back is deliberately the smaller of the two. Next is pressed ten
            // times as often, and hitting the wrong one mid-verse is the
            // mistake worth designing against — so Next gets whatever room is
            // left, and it's always the bigger target.
            Button(action: onBack) {
                label("Back", "chevron.left", .title3)
                    .frame(width: narrow ? 62 : 150, height: 68)
            }
            .buttonStyle(.borderedProminent)
            .tint(.gray)
            .accessibilityLabel("Back")

            Button(action: onNext) {
                label("Next", "chevron.right", .title)
                    .frame(maxWidth: .infinity, minHeight: 68)
            }
            .buttonStyle(.borderedProminent)
            .accessibilityLabel("Next")

            Button(action: onBlank) {
                label("Blank", "rectangle.slash", .title3)
                    .frame(width: narrow ? 62 : 140, height: 68)
            }
            .buttonStyle(.bordered)
            .tint(.red)
            .accessibilityLabel("Blank the screen")
        }
        .padding(.horizontal, narrow ? 10 : 16)
        .padding(.vertical, narrow ? 8 : 12)
        .background(.bar)
    }

    @ViewBuilder
    private func label(_ text: String, _ symbol: String, _ font: Font) -> some View {
        if narrow {
            Image(systemName: symbol).font(font.weight(.bold))
        } else {
            Label(text, systemImage: symbol).font(font.weight(.semibold))
        }
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
