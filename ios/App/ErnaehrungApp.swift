import SwiftUI

@main
struct ErnaehrungApp: App {
    @StateObject private var model = AppModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            Group {
                if model.user == nil {
                    LoginView()
                } else {
                    RootView()
                }
            }
            .environmentObject(model)
            .environment(\.theme, model.theme)
            .preferredColorScheme(model.theme.colorScheme)
            .tint(model.theme.accent)
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await model.refreshAll() } }
        }
    }
}

struct RootView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.theme) var theme

    var body: some View {
        TabView {
            TodayView()
                .tabItem { Label("Heute", systemImage: "flame.fill") }
            PlanView()
                .tabItem { Label("Plan", systemImage: "calendar") }
            ShoppingView()
                .tabItem { Label("Einkauf", systemImage: "cart.fill") }
            FortschrittView()
                .tabItem { Label("Fortschritt", systemImage: "chart.line.uptrend.xyaxis") }
        }
        .task { await model.refreshAll() }
    }
}

/// Karten-Hintergrund im jeweiligen Look.
struct CardStyle: ViewModifier {
    @Environment(\.theme) var theme
    var padding: CGFloat = 16
    func body(content: Content) -> some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(theme.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(theme.isDark ? Color.white.opacity(0.07) : theme.accent.opacity(0.12), lineWidth: 1))
            .shadow(color: theme.isDark ? .clear : theme.accent.opacity(0.08), radius: 14, y: 6)
    }
}

extension View {
    func card(padding: CGFloat = 16) -> some View { modifier(CardStyle(padding: padding)) }
}

/// Seitentitel mit Profil-Knopf (Abmelden etc.).
struct ScreenHeader: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.theme) var theme
    let eyebrow: String
    let title: String
    @State private var showProfile = false

    var body: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text(eyebrow.uppercased())
                    .font(.caption.weight(.semibold)).tracking(1.2)
                    .foregroundStyle(theme.muted)
                HStack(spacing: 8) {
                    Text(title).font(.system(.largeTitle, design: .rounded).weight(.bold))
                        .foregroundStyle(theme.ink)
                    if theme.id == "freundin" {
                        Image(systemName: "hare.fill").foregroundStyle(theme.accent).font(.title2)
                    }
                }
            }
            Spacer()
            Button { showProfile = true } label: {
                Text(theme.id == "freundin" ? "♡" : String((model.user?.name ?? "I").prefix(1)))
                    .font(.headline.weight(.bold))
                    .foregroundStyle(theme.onAccent)
                    .frame(width: 40, height: 40)
                    .background(theme.accent, in: Circle())
            }
            .accessibilityLabel("Profil")
        }
        .sheet(isPresented: $showProfile) { ProfileSheet().environmentObject(model).environment(\.theme, theme) }
    }
}
