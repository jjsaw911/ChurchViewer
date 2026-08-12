import SwiftUI

/// Settings, reachable from the button in the control bar rather than hidden
/// behind a gesture — an iPad handed to somebody new on a Sunday morning has to
/// explain itself.
struct SettingsView: View {
    @ObservedObject var settings: Settings
    let onReload: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var typed = ""

    private var preview: String {
        let name = Settings.name(in: typed)
        return name.isEmpty ? "" : "\(name).\(Settings.rootDomain)"
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Church") {
                    HStack(spacing: 4) {
                        TextField("yourchurch", text: $typed)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .keyboardType(.asciiCapable)

                        Text(".\(Settings.rootDomain)")
                            .foregroundStyle(.secondary)
                    }

                    if !preview.isEmpty {
                        Text("Opens \(preview)\(Settings.runPath)")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }

                Section {
                    Button("Reload the page", action: {
                        onReload()
                        dismiss()
                    })
                }
            }
            .navigationTitle("Settings")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        let name = Settings.name(in: typed)
                        if !name.isEmpty { settings.church = name }
                        dismiss()
                    }
                }
            }
            .onAppear { typed = settings.church }
        }
    }
}
