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
private struct ControlBar: View {
    let onBack: () -> Void
    let onNext: () -> Void
    let onBlank: () -> Void
    let onSettings: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Button(action: onSettings) {
                Image(systemName: "gearshape.fill")
                    .font(.title2)
                    .frame(width: 60, height: 72)
            }
            .buttonStyle(.bordered)

            // Back is deliberately the smaller of the two. Next is pressed ten
            // times as often, and hitting the wrong one mid-verse is the
            // mistake worth designing against — so Next gets whatever room is
            // left, and it's always the bigger target.
            Button(action: onBack) {
                Label("Back", systemImage: "chevron.left")
                    .font(.title3.weight(.semibold))
                    .frame(width: 150, height: 72)
            }
            .buttonStyle(.borderedProminent)
            .tint(.gray)

            Button(action: onNext) {
                Label("Next", systemImage: "chevron.right")
                    .font(.title.weight(.bold))
                    .frame(maxWidth: .infinity, minHeight: 72)
            }
            .buttonStyle(.borderedProminent)

            Button(action: onBlank) {
                Label("Blank", systemImage: "rectangle.slash")
                    .font(.title3.weight(.semibold))
                    .frame(width: 140, height: 72)
            }
            .buttonStyle(.bordered)
            .tint(.red)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(.bar)
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
