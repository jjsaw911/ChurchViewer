import SwiftUI
import AppKit

/// ChurchViewer Display — the Mac at the church.
///
/// Two windows, because a church Mac drives two things: the projector the room
/// watches, and the monitor facing the platform. They show different pages and
/// belong on different screens, so they're separate windows with separate
/// settings rather than one window somebody keeps dragging about.
///
/// Everything you can change is reachable from the menu bar icon, because both
/// windows spend the service full screen with nothing on them but their job.
@main
struct ChurchViewerDisplayApp: App {
    @StateObject private var settings = Settings()
    @State private var reloadToken = 0

    var body: some Scene {
        Window("Projector", id: "projector") {
            OutputScene(output: settings.projector, reloadToken: reloadToken)
                .onAppear {
                    fillIfAsked(settings.projector, window: "Projector")
                    StayAwake.hold()
                }
                .onDisappear { StayAwake.release() }
        }
        .windowStyle(.hiddenTitleBar)
        .commands {
            CommandGroup(replacing: .newItem) {}
            CommandMenu("Display") {
                DisplayCommands(settings: settings, reload: { reloadToken += 1 })
            }
        }

        Window("Stage", id: "stage") {
            OutputScene(output: settings.stage, reloadToken: reloadToken)
                .onAppear {
                    fillIfAsked(settings.stage, window: "Stage")
                    StayAwake.hold()
                }
                .onDisappear { StayAwake.release() }
        }
        .windowStyle(.hiddenTitleBar)

        Window("Settings", id: "settings") {
            SettingsView(settings: settings, onReload: { reloadToken += 1 })
        }
        .windowResizability(.contentSize)

        /// Always there, whatever the windows are doing — including filling two
        /// screens with the menu bar hidden behind them.
        MenuBarExtra("ChurchViewer Display", systemImage: "sparkles.tv") {
            DisplayCommands(settings: settings, reload: { reloadToken += 1 })
            Divider()
            Button("Quit") { NSApp.terminate(nil) }
        }
    }

    private func fillIfAsked(_ output: OutputSettings, window: String) {
        guard output.isConfigured, output.fillOnLaunch else { return }
        // Once the window exists and has been placed on a screen.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) {
            WindowPlacement.move(window: window, to: output.targetScreen(), fullScreen: true)
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

        Button("Fill the projector") {
            openWindow(id: "projector")
            WindowPlacement.move(
                window: "Projector",
                to: settings.projector.targetScreen(),
                fullScreen: true
            )
        }
        .keyboardShortcut("f", modifiers: [.command, .shift])
        .disabled(!settings.projector.isConfigured)

        Button("Fill the stage monitor") {
            openWindow(id: "stage")
            WindowPlacement.move(
                window: "Stage",
                to: settings.stage.targetScreen(),
                fullScreen: true
            )
        }
        .keyboardShortcut("s", modifiers: [.command, .shift])
        .disabled(!settings.stage.isConfigured)

        Button("Leave full screen (both)") {
            WindowPlacement.leaveFullScreen(window: "Projector")
            WindowPlacement.leaveFullScreen(window: "Stage")
        }
        .keyboardShortcut(.escape, modifiers: .command)

        Divider()

        // The override, for whoever is standing next to the machine rather than
        // holding the remote. The microphone feeds back, or somebody starts
        // speaking over the music, and going to find the person with the iPad
        // is not a plan. These press the same keys the remote does, so there is
        // one way for a thing to happen rather than two that can disagree.
        Button("Pause or resume the music") { LiveKeys.press("p") }
            .keyboardShortcut("p", modifiers: [.command, .shift])
            .disabled(!settings.projector.isConfigured)

        Button("Blank or unblank the screen") { LiveKeys.press("b") }
            .keyboardShortcut("b", modifiers: [.command, .shift])
            .disabled(!settings.projector.isConfigured)

        Divider()

        Button("Reload both", action: reload)
            .keyboardShortcut("r", modifiers: .command)
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
                DisplayWebView(url: url, surface: output.name, reloadToken: reloadToken)
                    .ignoresSafeArea()
            } else {
                SetupPrompt(output: output) { openSettings() }
            }

            if showingControls {
                Button {
                    openSettings()
                } label: {
                    Label(output.name, systemImage: "gearshape.fill")
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
            Image(systemName: output.name == "Stage" ? "music.mic" : "sparkles.tv")
                .font(.system(size: 44))
                .foregroundStyle(.white.opacity(0.5))

            Text(output.name)
                .font(.title2.weight(.semibold))
                .foregroundStyle(.white)

            Text(
                output.name == "Stage"
                    ? "For a monitor facing the platform. In a browser: open the plan, press "
                        + "Run it, then Open the stage display — and paste that window's address."
                    : "For the projector. In a browser: open the plan, press Run it, then "
                        + "Open the output screen — and paste that window's address."
            )
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
