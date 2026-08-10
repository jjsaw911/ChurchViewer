import SwiftUI

/// Settings, reachable from the button in the control bar rather than hidden
/// behind a gesture — an iPad handed to somebody new on a Sunday morning has to
/// explain itself.
struct SettingsView: View {
    @ObservedObject var settings: Settings
    let onReload: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var typed = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Run sheet address") {
                    TextField("https://…/present/services/…", text: $typed)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)

                    Button("Paste") {
                        if let clipboard = UIPasteboard.general.string {
                            typed = clipboard.trimmingCharacters(in: .whitespacesAndNewlines)
                        }
                    }

                    Text(
                        "From a plan, press Run it and copy that page's address. This is the "
                        + "page you drive from — not the output screen the projector shows."
                    )
                    .font(.footnote)
                    .foregroundStyle(.secondary)
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
                        let trimmed = typed.trimmingCharacters(in: .whitespacesAndNewlines)
                        if !trimmed.isEmpty { settings.runSheetURL = trimmed }
                        dismiss()
                    }
                }
            }
            .onAppear { typed = settings.runSheetURL }
        }
    }
}
