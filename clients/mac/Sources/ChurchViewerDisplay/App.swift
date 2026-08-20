import SwiftUI
import AppKit

/// ChurchViewer Display — the Mac at the church.
///
/// Four windows, because a church Mac drives more than one thing at once.
/// **A** is the monitor facing the platform and **B** is the projector the room
/// watches; **C** and **D** are spare, for an overflow screen or a foyer
/// television. They show different pages and belong on different screens, so
/// they're separate windows with separate settings rather than one window
/// somebody keeps dragging about.
///
/// A window per output rather than a list of them, because macOS wants its
/// windows declared when the app is built. Unused ones cost nothing: nothing
/// opens them until they've been given an address.
///
/// Everything you can change is reachable from the menu bar icon, because those
/// windows spend the service full screen with nothing on them but their job.
@main
struct ChurchViewerDisplayApp: App {
    @StateObject private var settings = Settings()
    @State private var reloadToken = 0

    var body: some Scene {
        Window("Stage", id: "stage") {
            OutputScene(output: settings.stage, reloadToken: reloadToken)
                .onAppear { fillIfAsked(settings.stage) }
        }
        .windowStyle(.hiddenTitleBar)
        .commands {
            CommandGroup(replacing: .newItem) {}
            CommandMenu("Display") {
                DisplayCommands(settings: settings, reload: { reloadToken += 1 })
            }
        }

        Window("Projector", id: "projector") {
            OutputScene(output: settings.audience, reloadToken: reloadToken)
                .onAppear { fillIfAsked(settings.audience) }
        }
        .windowStyle(.hiddenTitleBar)

        Window("Screen C", id: "screenC") {
            OutputScene(output: settings.spareC, reloadToken: reloadToken)
                .onAppear { fillIfAsked(settings.spareC) }
        }
        .windowStyle(.hiddenTitleBar)

        Window("Screen D", id: "screenD") {
            OutputScene(output: settings.spareD, reloadToken: reloadToken)
                .onAppear { fillIfAsked(settings.spareD) }
        }
        .windowStyle(.hiddenTitleBar)

        Window("Settings", id: "settings") {
            SettingsView(settings: settings, onReload: { reloadToken += 1 })
        }
        .windowResizability(.contentSize)

        /// Always there, whatever the windows are doing — including filling
        /// every screen with the menu bar hidden behind them.
        MenuBarExtra("ChurchViewer Display", systemImage: "sparkles.tv") {
            DisplayCommands(settings: settings, reload: { reloadToken += 1 })
            Divider()
            Button("Quit") { NSApp.terminate(nil) }
        }
    }

    private func fillIfAsked(_ output: OutputSettings) {
        guard output.isConfigured, output.fillOnLaunch else { return }
        // Once the window exists and has been placed on a screen.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) {
            WindowPlacement.move(
                window: output.windowTitle,
                to: output.targetScreen(),
                fullScreen: true
            )
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

        Divider()

        // Cmd-Shift and the output's own letter: A fills the stage monitor, B
        // the projector, and so on. One rule to remember rather than four.
        ForEach(settings.all) { output in
            FillButton(output: output)
        }

        Button("Leave full screen (all)") {
            for output in settings.all {
                WindowPlacement.leaveFullScreen(window: output.windowTitle)
            }
        }
        .keyboardShortcut(.escape, modifiers: .command)

        Button("Reload all", action: reload)
            .keyboardShortcut("r", modifiers: .command)
    }
}

/// Put one output on its screen and fill it.
///
/// Its own view because it observes its own output: the menu item has to grey
/// itself out the moment an address is cleared, and watching `Settings` doesn't
/// see that — each output is a separate source of changes.
private struct FillButton: View {
    @ObservedObject var output: OutputSettings

    @Environment(\.openWindow) private var openWindow

    var body: some View {
        Button("Fill \(output.label)") {
            openWindow(id: output.id)
            WindowPlacement.move(
                window: output.windowTitle,
                to: output.targetScreen(),
                fullScreen: true
            )
        }
        .keyboardShortcut(shortcut, modifiers: [.command, .shift])
        .disabled(!output.isConfigured)
    }

    private var shortcut: KeyEquivalent {
        KeyEquivalent(Character(output.letter.lowercased()))
    }
}

/// One output window: the page, and nothing else — plus a button that shows
/// itself when the mouse moves and gets out of the way when it doesn't.
private struct OutputScene: View {
    @ObservedObject var output: OutputSettings
    let reloadToken: Int

    @Environment(\.openWindow) private var openWindow
    @State private var showingControls = false

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color.black.ignoresSafeArea()

            if let url = output.url {
                DisplayWebView(url: url, reloadToken: reloadToken)
                    .ignoresSafeArea()
            } else {
                SetupPrompt(output: output) { openSettings() }
            }

            if showingControls {
                Button {
                    openSettings()
                } label: {
                    Label(output.label, systemImage: "gearshape.fill")
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

/// What a window shows before anybody has told it what it's for.
private struct SetupPrompt: View {
    @ObservedObject var output: OutputSettings
    let onOpenSettings: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: output.symbol)
                .font(.system(size: 44))
                .foregroundStyle(.white.opacity(0.5))

            Text(output.label)
                .font(.title2.weight(.semibold))
                .foregroundStyle(.white)

            Text(output.purpose)
                .font(.callout)
                .foregroundStyle(.white.opacity(0.6))
                .multilineTextAlignment(.center)
                .frame(maxWidth: 440)

            Button("Open Settings", action: onOpenSettings)
                .controlSize(.large)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
