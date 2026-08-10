import SwiftUI
import AppKit

/// The settings window.
///
/// A window rather than a sheet, and deliberately: a sheet belongs to the window
/// it hangs off, and those windows are the ones filling the projector and the
/// stage monitor. Settings would have opened in front of the congregation.
struct SettingsView: View {
    @ObservedObject var settings: Settings
    let onReload: () -> Void

    @State private var screens: [String] = NSScreen.screens.map(\.localizedName)

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 4) {
                Text("ChurchViewer Display").font(.title3.weight(.semibold))
                Text("Two outputs: what the room sees, and what the platform sees.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }

            OutputSection(
                output: settings.projector,
                screens: $screens,
                windowTitle: "Projector",
                explanation: "From a plan: Run it, then Open the output screen.",
                onRescan: rescan
            )

            Divider()

            OutputSection(
                output: settings.stage,
                screens: $screens,
                windowTitle: "Stage",
                explanation: "From a plan: Run it, then Open the stage display. Leave empty if there's no monitor facing the platform.",
                onRescan: rescan
            )

            Divider()

            Toggle("Open automatically when this Mac starts up", isOn: $settings.openAtLogin)

            HStack {
                Button("Reload both", action: onReload)
                Spacer()
                Button("Close") { NSApp.keyWindow?.close() }
                    .keyboardShortcut(.defaultAction)
            }
        }
        .padding(24)
        .frame(width: 580)
        .onAppear {
            rescan()
            WindowPlacement.bringSettingsToOperator()
        }
    }

    private func rescan() { screens = NSScreen.screens.map(\.localizedName) }
}

/// One output's three settings, and the two buttons for trying them now.
private struct OutputSection: View {
    @ObservedObject var output: OutputSettings
    @Binding var screens: [String]
    let windowTitle: String
    let explanation: String
    let onRescan: () -> Void

    @Environment(\.openWindow) private var openWindow

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(output.name).font(.headline)
                Spacer()
                Text(output.isConfigured ? (output.url?.host ?? "") : "not set")
                    .font(.caption)
                    .foregroundStyle(output.isConfigured ? Color.secondary : Color.red)
            }

            HStack {
                TextField("https://…", text: $output.address)
                    .textFieldStyle(.roundedBorder)

                Button("Paste") {
                    if let clipboard = NSPasteboard.general.string(forType: .string) {
                        output.address = clipboard.trimmingCharacters(in: .whitespacesAndNewlines)
                    }
                }
            }

            Text(explanation).font(.caption).foregroundStyle(.secondary)

            HStack {
                Picker("Screen", selection: $output.screenName) {
                    Text("Wherever the window is").tag("")
                    ForEach(screens, id: \.self) { name in
                        Text(name).tag(name)
                    }
                }
                .frame(maxWidth: 320)

                Button("Rescan", action: onRescan)
            }

            Toggle("Fill that screen when the app opens", isOn: $output.fillOnLaunch)

            HStack {
                Button("Show it now") {
                    openWindow(id: windowTitle.lowercased())
                    WindowPlacement.move(
                        window: windowTitle,
                        to: output.targetScreen(),
                        fullScreen: true
                    )
                }
                .disabled(!output.isConfigured)

                Button("Leave full screen") {
                    WindowPlacement.leaveFullScreen(window: windowTitle)
                }
            }
        }
    }
}
