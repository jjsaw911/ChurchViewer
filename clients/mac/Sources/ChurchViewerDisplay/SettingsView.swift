import SwiftUI
import AppKit

/// The three things somebody sets on the Sunday they install this, and then
/// never again: which page, which screen, and whether to go straight to it.
struct SettingsView: View {
    @ObservedObject var settings: Settings
    let onClose: () -> Void

    @State private var screens: [String] = NSScreen.screens.map(\.localizedName)

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Display settings")
                .font(.title3.weight(.semibold))

            VStack(alignment: .leading, spacing: 6) {
                Text("Output screen address").font(.callout.weight(.medium))
                TextField(
                    "https://yourchurch.churchviewer.com/present/services/…/screen",
                    text: $settings.displayURL
                )
                .textFieldStyle(.roundedBorder)
                .frame(width: 460)

                Text(
                    "From a plan, press Run it and then Open the output screen; copy that "
                    + "window's address. You'll be asked to sign in here once."
                )
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(width: 460, alignment: .leading)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Screen").font(.callout.weight(.medium))
                Picker("", selection: $settings.screenName) {
                    Text("Wherever the window is").tag("")
                    ForEach(screens, id: \.self) { name in
                        Text(name).tag(name)
                    }
                }
                .labelsHidden()
                .frame(width: 320)

                Text("The projector is usually the one that isn't the built-in display.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Toggle("Fill that screen as soon as the app opens", isOn: $settings.fullScreenOnLaunch)

            HStack {
                Button("Refresh the screen list") {
                    screens = NSScreen.screens.map(\.localizedName)
                }
                Spacer()
                Button("Done", action: onClose)
                    .keyboardShortcut(.defaultAction)
            }
            .frame(width: 460)
        }
        .padding(24)
    }
}
