import SwiftUI
import AppKit

/// ChurchViewer Display — the Mac at the church, wired to the projector.
///
/// It shows one page: the output screen of whatever service is running. The
/// operator drives it from somewhere else — the run sheet in a browser today,
/// an iPad later — and both reach it through the server's live channel, so the
/// two machines need nothing of each other but a network.
///
/// Everything you can change is reachable from the menu bar icon, because the
/// window itself spends the service full screen on a projector with nothing on
/// it but words.
@main
struct ChurchViewerDisplayApp: App {
    @StateObject private var settings = Settings()
    @State private var reloadToken = 0

    var body: some Scene {
        Window("ChurchViewer Display", id: "display") {
            DisplayScene(settings: settings, reloadToken: reloadToken)
                .onAppear {
                    guard settings.isConfigured, settings.fullScreenOnLaunch else { return }
                    // Once the window exists and has been placed on a screen.
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
                        WindowPlacement.moveDisplayWindow(to: settings.targetScreen(), fullScreen: true)
                    }
                }
        }
        .windowStyle(.hiddenTitleBar)
        .commands {
            CommandGroup(replacing: .newItem) {}
            CommandMenu("Display") {
                DisplayCommands(settings: settings, reload: { reloadToken += 1 })
            }
        }

        Window("Settings", id: "settings") {
            SettingsView(settings: settings, onReload: { reloadToken += 1 })
        }
        .windowResizability(.contentSize)

        /// Always there, whatever the display window is doing — including
        /// filling a projector with the menu bar hidden behind it.
        MenuBarExtra("ChurchViewer Display", systemImage: "sparkles.tv") {
            DisplayCommands(settings: settings, reload: { reloadToken += 1 })
            Divider()
            Button("Quit") { NSApp.terminate(nil) }
        }
    }
}

/// The same handful of things, offered from the menu bar and the menu.
private struct DisplayCommands: View {
    @ObservedObject var settings: Settings
    let reload: () -> Void

    @Environment(\.openWindow) private var openWindow

    var body: some View {
        Button("Settings…") {
            openWindow(id: "settings")
            NSApp.activate(ignoringOtherApps: true)
        }
        .keyboardShortcut(",", modifiers: .command)

        Button("Fill the projector") {
            WindowPlacement.moveDisplayWindow(to: settings.targetScreen(), fullScreen: true)
        }
        .keyboardShortcut("f", modifiers: [.command, .shift])
        .disabled(!settings.isConfigured)

        Button("Leave full screen") { WindowPlacement.leaveFullScreen() }
            .keyboardShortcut(.escape, modifiers: .command)

        Button("Reload the page", action: reload)
            .keyboardShortcut("r", modifiers: .command)
            .disabled(!settings.isConfigured)
    }
}

/// The window the room sees: the page, and nothing else — plus one button that
/// shows itself when the mouse moves and gets out of the way when it doesn't.
private struct DisplayScene: View {
    @ObservedObject var settings: Settings
    let reloadToken: Int

    @Environment(\.openWindow) private var openWindow
    @State private var showingControls = false

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color.black.ignoresSafeArea()

            if let url = settings.url {
                DisplayWebView(url: url, reloadToken: reloadToken)
                    .ignoresSafeArea()
            } else {
                SetupPrompt { openSettings() }
            }

            if showingControls && settings.isConfigured {
                Button {
                    openSettings()
                } label: {
                    Label("Settings", systemImage: "gearshape.fill")
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(.black.opacity(0.65), in: Capsule())
                        .foregroundStyle(.white)
                }
                .buttonStyle(.plain)
                .padding(16)
                .transition(.opacity)
            }
        }
        // Nothing is drawn over the words unless somebody is at the machine
        // with a hand on the mouse.
        .onContinuousHover { phase in
            switch phase {
            case .active:
                withAnimation(.easeOut(duration: 0.15)) { showingControls = true }
            case .ended:
                withAnimation(.easeIn(duration: 0.4)) { showingControls = false }
            }
        }
    }

    private func openSettings() {
        openWindow(id: "settings")
        NSApp.activate(ignoringOtherApps: true)
    }
}

/// What a Mac shows before anybody has told it which screen to be.
private struct SetupPrompt: View {
    let onOpenSettings: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "sparkles.tv")
                .font(.system(size: 44))
                .foregroundStyle(.white.opacity(0.5))

            Text("ChurchViewer Display")
                .font(.title2.weight(.semibold))
                .foregroundStyle(.white)

            Text(
                "Open a service plan in a browser, press Run it, then Open the output screen — "
                + "and paste that window's address into Settings."
            )
            .font(.callout)
            .foregroundStyle(.white.opacity(0.6))
            .multilineTextAlignment(.center)
            .frame(maxWidth: 420)

            Button("Open Settings", action: onOpenSettings)
                .controlSize(.large)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
