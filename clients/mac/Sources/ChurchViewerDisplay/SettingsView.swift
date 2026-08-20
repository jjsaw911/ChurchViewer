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

    /// Spares stay folded away. A room with two screens shouldn't have to read
    /// past two it hasn't got.
    @State private var showingSpares = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("ChurchViewer Display").font(.title3.weight(.semibold))
                    Text("A faces the platform. B faces the room. C and D are spare.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }

                OutputSection(output: settings.stage, screens: $screens, onRescan: rescan)

                Divider()

                OutputSection(output: settings.audience, screens: $screens, onRescan: rescan)

                Divider()

                DisclosureGroup(isExpanded: $showingSpares) {
                    VStack(alignment: .leading, spacing: 18) {
                        OutputSection(output: settings.spareC, screens: $screens, onRescan: rescan)
                        Divider()
                        OutputSection(output: settings.spareD, screens: $screens, onRescan: rescan)
                    }
                    .padding(.top, 12)
                } label: {
                    Text("More screens (C and D)").font(.headline)
                }

                Divider()

                Toggle("Open automatically when this Mac starts up", isOn: $settings.openAtLogin)

                HStack {
                    Button("Reload all", action: onReload)
                    Spacer()
                    Button("Close") { NSApp.keyWindow?.close() }
                        .keyboardShortcut(.defaultAction)
                }
            }
            .padding(24)
        }
        // A definite size, not a natural one: the window is `.contentSize`, and
        // a ScrollView has no height of its own to offer it. 620 shows A and B
        // without scrolling and keeps the window on a laptop screen when all
        // four are open.
        .frame(width: 580, height: 620)
        .onAppear {
            rescan()
            showingSpares = settings.spareC.isConfigured || settings.spareD.isConfigured
            WindowPlacement.bringSettingsToOperator()
        }
    }

    private func rescan() { screens = NSScreen.screens.map(\.localizedName) }
}

/// One output's three settings, and the two buttons for trying them now.
private struct OutputSection: View {
    @ObservedObject var output: OutputSettings
    @Binding var screens: [String]
    let onRescan: () -> Void

    @Environment(\.openWindow) private var openWindow

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Label(output.label, systemImage: output.symbol).font(.headline)
                Spacer()
                // A spare with no address is doing what it's meant to, so it
                // doesn't get the red "not set" that A and B would earn.
                Text(output.isConfigured ? (output.url?.host ?? "") : (output.isSpare ? "unused" : "not set"))
                    .font(.caption)
                    .foregroundStyle(status)
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

            Text(output.purpose).font(.caption).foregroundStyle(.secondary)

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
                    openWindow(id: output.id)
                    WindowPlacement.move(
                        window: output.windowTitle,
                        to: output.targetScreen(),
                        fullScreen: true
                    )
                }
                .disabled(!output.isConfigured)

                Button("Leave full screen") {
                    WindowPlacement.leaveFullScreen(window: output.windowTitle)
                }
            }
        }
    }

    private var status: Color {
        if output.isConfigured { return .secondary }
        return output.isSpare ? .secondary : .red
    }
}
