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
    @State private var reloadToken = 0
    @State private var showingSettings = false

    var body: some View {
        Group {
            if let url = settings.url {
                VStack(spacing: 0) {
                    RunSheetWebView(url: url, reloadToken: reloadToken) { webView = $0 }
                    ControlBar(
                        onBack: { PageKeys.press("ArrowLeft", in: webView) },
                        onNext: { PageKeys.press("ArrowRight", in: webView) },
                        onBlank: { PageKeys.press("b", in: webView) },
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
/// The same bar serves an iPad on a stand and a phone held one-handed. On a
/// phone there isn't room for four labelled buttons, so the three secondary
/// ones drop to icons and Next keeps its word — it's the one pressed ten times
/// as often, and it stays the biggest target on either device.
private struct ControlBar: View {
    let onBack: () -> Void
    let onNext: () -> Void
    let onBlank: () -> Void
    let onSettings: () -> Void

    @Environment(\.horizontalSizeClass) private var sizeClass

    private var compact: Bool { sizeClass == .compact }

    /// Apple's minimum touch target is 44pt. A dark room and a moving band
    /// argue for more, so even the tightest phone layout keeps well above it.
    private var height: CGFloat { compact ? 62 : 72 }
    private var iconWidth: CGFloat { compact ? 52 : 60 }
    private var backWidth: CGFloat { compact ? 68 : 150 }
    private var blankWidth: CGFloat { compact ? 68 : 140 }

    var body: some View {
        HStack(spacing: compact ? 8 : 12) {
            Button(action: onSettings) {
                Image(systemName: "gearshape.fill")
                    .font(.title2)
                    .frame(width: iconWidth, height: height)
            }
            .buttonStyle(.bordered)
            .accessibilityLabel("Settings")

            // Back is deliberately the smaller of the two. Next is pressed ten
            // times as often, and hitting the wrong one mid-verse is the
            // mistake worth designing against — so Next gets whatever room is
            // left, and it's always the bigger target.
            Button(action: onBack) {
                secondaryLabel("Back", systemImage: "chevron.left")
                    .frame(width: backWidth, height: height)
            }
            .buttonStyle(.borderedProminent)
            .tint(.gray)
            .accessibilityLabel("Back")

            Button(action: onNext) {
                Label("Next", systemImage: "chevron.right")
                    .font(compact ? .title3.weight(.bold) : .title.weight(.bold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .frame(maxWidth: .infinity, minHeight: height)
            }
            .buttonStyle(.borderedProminent)
            .accessibilityLabel("Next")

            Button(action: onBlank) {
                secondaryLabel("Blank", systemImage: "rectangle.slash")
                    .frame(width: blankWidth, height: height)
            }
            .buttonStyle(.bordered)
            .tint(.red)
            .accessibilityLabel("Blank")
        }
        .padding(.horizontal, compact ? 10 : 16)
        .padding(.vertical, compact ? 8 : 12)
        .background(.bar)
    }

    /// Icon alone on a phone, icon and word on an iPad.
    @ViewBuilder
    private func secondaryLabel(_ title: String, systemImage: String) -> some View {
        if compact {
            Image(systemName: systemImage).font(.title2.weight(.semibold))
        } else {
            Label(title, systemImage: systemImage).font(.title3.weight(.semibold))
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
                "Open the service plan in a browser, press Run it, and copy that page's "
                + "address — the run sheet, not the output screen."
            )
            .font(.body)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
            .frame(maxWidth: 520)

            TextField("https://yourchurch.churchviewer.com/present/services/…", text: $typed)
                .textFieldStyle(.roundedBorder)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.URL)
                .frame(maxWidth: 520)

            Button("Use this run sheet") {
                settings.runSheetURL = typed.trimmingCharacters(in: .whitespacesAndNewlines)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(typed.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(40)
    }
}
