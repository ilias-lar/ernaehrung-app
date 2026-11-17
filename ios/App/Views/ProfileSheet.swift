import SwiftUI

struct ProfileSheet: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.theme) var theme
    @Environment(\.dismiss) var dismiss
    @State private var live = SharedStore.liveActivityEnabled

    var body: some View {
        NavigationStack {
            List {
                if let u = model.user {
                    Section {
                        HStack(spacing: 14) {
                            Image(systemName: theme.mascot)
                                .foregroundStyle(theme.onAccent)
                                .frame(width: 48, height: 48)
                                .background(theme.accent, in: Circle())
                            VStack(alignment: .leading) {
                                Text(u.name).font(.headline)
                                Text(u.email).font(.subheadline).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                Section {
                    Toggle(isOn: $live) {
                        Label("Live-Aktivität & Dynamic Island", systemImage: "platter.filled.top.iphone")
                    }
                    .onChange(of: live) { _, on in
                        SharedStore.liveActivityEnabled = on
                        if on, let t = model.today { LiveActivityManager.shared.sync(with: t) } else { LiveActivityManager.shared.end() }
                    }
                } footer: {
                    Text("Zeigt deine nächste Mahlzeit und den Kalorienstand oben in der Dynamic Island und auf dem Sperrbildschirm.")
                }
                Section {
                    Label("Widgets: Home-Bildschirm lange drücken → „+“ → Ernährung", systemImage: "square.grid.2x2")
                        .font(.footnote)
                }
                Section {
                    Button(role: .destructive) {
                        dismiss()
                        model.signOut()
                    } label: {
                        Label("Abmelden", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                } footer: {
                    Text("Server: \(SharedStore.server)").font(.caption2)
                }
            }
            .navigationTitle("Profil")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Fertig") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
    }
}
