import SwiftUI
import AppKit

/// ChurchViewer Display — the Mac at the church, wired to the projector.
///
/// It shows one page: the output screen of whatever service is running. The
/// operator drives it from somewhere else — the run sheet in a browser today,
/// an iPad later — and both reach it through the server's live channel, so the
/// two machines need nothing of each other but a network.
@main
struct ChurchViewerDisplayApp: App {
    @StateObject private var settings = Settings()
    @State private var reloadToken = 0
    @State private var showingSettings = false

    var body: some Scene {
        Window("ChurchViewer Display", id: "display") {
            RootView(
                settings: settings,
                reloadToken: reloadToken,
                showingSettings: $showingSettings
            )
            .background(.black)
            .ignoresSafeArea()
            .onAppear {
                if settings.isConfigured && settings.fullScreenOnLaunch {
                    // After the window exists and has been placed on a screen.
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
                        WindowPlacement.moveKeyWindow(to: settings.targetScreen(), fullScreen: true)
                    }
                }
            }
        }
        .windowStyle(.hiddenTitleBar)
        .commands {
            CommandGroup(replacing: .newItem) {}

            CommandMenu("Display") {
                Button("Settings…") { showingSettings = true }
                    .keyboardShortcut(",", modifiers: .command)

                Button("Reload") { reloadToken += 1 }
                    .keyboardShortcut("r", modifiers: .command)

                Divider()

                // Full screen on the *chosen* screen, which the standard green
                // button can't do — it fills whichever screen the window is on.
                Button("Fill the projector") {
                    WindowPlacement.moveKeyWindow(to: settings.targetScreen(), fullScreen: true)
                }
                .keyboardShortcut("f", modifiers: [.command, .shift])

                Button("Leave full screen") {
                    WindowPlacement.leaveFullScreen()
                }
                .keyboardShortcut(.escape, modifiers: .command)
            }
        }
    }
}

private struct RootView: View {
    @ObservedObject var settings: Settings
    let reloadToken: Int
    @Binding var showingSettings: Bool

    var body: some View {
        Group {
            if let url = URL(string: settings.displayURL), settings.isConfigured {
                DisplayWebView(url: url, reloadToken: reloadToken)
            } else {
                SetupPrompt { showingSettings = true }
            }
        }
        .sheet(isPresented: $showingSettings) {
            SettingsView(settings: settings) { showingSettings = false }
        }
    }
}

/// What a Mac shows before anybody has told it which screen to be.
private struct SetupPrompt: View {
    let onOpenSettings: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Text("ChurchViewer Display")
                .font(.title2.weight(.semibold))
                .foregroundStyle(.white)

            Text(
                "Open a service plan in a browser, press Run it, then Open the output screen — "
                + "and paste that window's address here."
            )
            .font(.callout)
            .foregroundStyle(.white.opacity(0.6))
            .multilineTextAlignment(.center)
            .frame(maxWidth: 420)

            Button("Settings…", action: onOpenSettings)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.black)
    }
}
