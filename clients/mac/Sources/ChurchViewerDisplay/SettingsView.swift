import SwiftUI
import AppKit

/// The settings window.
///
/// A window rather than a sheet, and deliberately: a sheet belongs to the window
/// it hangs off, and that window is the one filling the projector. Settings
/// would have opened in front of the congregation.
struct SettingsView: View {
    @ObservedObject var settings: Settings
    let onReload: () -> Void

    @State private var screens: [String] = NSScreen.screens.map(\.localizedName)

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            header

            Divider()

            address
            screenChoice
            behaviour

            Divider()

            actions
        }
        .padding(24)
        .frame(width: 540)
        .onAppear {
            screens = NSScreen.screens.map(\.localizedName)
            WindowPlacement.bringSettingsToOperator()
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("ChurchViewer Display").font(.title3.weight(.semibold))
            Text(settings.isConfigured ? "Showing \(hostDescription)" : "Not set up yet")
                .font(.callout)
                .foregroundStyle(settings.isConfigured ? Color.secondary : Color.red)
        }
    }

    private var hostDescription: String {
        settings.url?.host ?? settings.displayURL
    }

    private var address: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Output screen address").font(.callout.weight(.medium))

            HStack {
                TextField(
                    "https://yourchurch.churchviewer.com/present/services/…/screen",
                    text: $settings.displayURL
                )
                .textFieldStyle(.roundedBorder)

                Button("Paste") {
                    if let clipboard = NSPasteboard.general.string(forType: .string) {
                        settings.displayURL = clipboard.trimmingCharacters(in: .whitespacesAndNewlines)
                    }
                }
            }

            Text(
                "In a browser: open the service plan, press Run it, then Open the output "
                + "screen — and copy that window's address. You'll sign in here once."
            )
            .font(.caption)
            .foregroundStyle(.secondary)
        }
    }

    private var screenChoice: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Screen").font(.callout.weight(.medium))

            HStack {
                Picker("", selection: $settings.screenName) {
                    Text("Wherever the window is").tag("")
                    ForEach(screens, id: \.self) { name in
                        Text(name).tag(name)
                    }
                }
                .labelsHidden()

                Button("Rescan") { screens = NSScreen.screens.map(\.localizedName) }
            }

            Text(
                screens.count > 1
                    ? "The projector is usually the one that isn't the built-in display."
                    : "Only one screen is connected at the moment. Plug the projector in and press Rescan."
            )
            .font(.caption)
            .foregroundStyle(.secondary)
        }
    }

    private var behaviour: some View {
        VStack(alignment: .leading, spacing: 8) {
            Toggle("Fill that screen as soon as the app opens", isOn: $settings.fullScreenOnLaunch)
            Toggle("Open automatically when this Mac starts up", isOn: $settings.openAtLogin)
        }
    }

    private var actions: some View {
        HStack {
            Button("Fill the projector now") {
                WindowPlacement.moveDisplayWindow(to: settings.targetScreen(), fullScreen: true)
            }
            .disabled(!settings.isConfigured)

            Button("Leave full screen") { WindowPlacement.leaveFullScreen() }

            Button("Reload the page", action: onReload)
                .disabled(!settings.isConfigured)

            Spacer()

            Button("Close") { NSApp.keyWindow?.close() }
                .keyboardShortcut(.defaultAction)
        }
    }
}
