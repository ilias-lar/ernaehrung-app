import SwiftUI

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255,
                  opacity: alpha)
    }
}

/// Zwei Looks: Ilias (dunkel, Smaragd) und Freundin (rosa, Häschen).
struct Theme: Equatable {
    let id: String
    let background: Color
    let card: Color
    let card2: Color
    let ink: Color
    let ink2: Color
    let muted: Color
    let accent: Color
    let onAccent: Color
    let protein: Color
    let carbs: Color
    let fat: Color
    let warn: Color
    let track: Color
    let isDark: Bool
    let mascot: String

    var colorScheme: ColorScheme { isDark ? .dark : .light }

    static let ilias = Theme(
        id: "ilias",
        background: Color(hex: 0x0D0F0E), card: Color(hex: 0x1B1A18), card2: Color(hex: 0x23221F),
        ink: Color(hex: 0xF0EFEC), ink2: Color(hex: 0xC3C2B7), muted: Color(hex: 0x8D8B84),
        accent: Color(hex: 0x36C48F), onAccent: Color(hex: 0x07140F),
        protein: Color(hex: 0x3987E5), carbs: Color(hex: 0xD95926), fat: Color(hex: 0x199E70),
        warn: Color(hex: 0xF2B33D), track: Color.white.opacity(0.08), isDark: true, mascot: "leaf.fill")

    static let freundin = Theme(
        id: "freundin",
        background: Color(hex: 0xFFF1F6), card: Color.white, card2: Color(hex: 0xFFE4EE),
        ink: Color(hex: 0x4A1D36), ink2: Color(hex: 0x7A4560), muted: Color(hex: 0xB0849A),
        accent: Color(hex: 0xFF4F9A), onAccent: Color.white,
        protein: Color(hex: 0xFF4F9A), carbs: Color(hex: 0xF6A04D), fat: Color(hex: 0xA77BF0),
        warn: Color(hex: 0xF08A3C), track: Color(hex: 0xFF4F9A, alpha: 0.12), isDark: false, mascot: "hare.fill")

    static func of(_ id: String?) -> Theme { id == "freundin" ? .freundin : .ilias }
}

private struct ThemeKey: EnvironmentKey { static let defaultValue = Theme.ilias }
extension EnvironmentValues {
    var theme: Theme {
        get { self[ThemeKey.self] }
        set { self[ThemeKey.self] = newValue }
    }
}

// MARK: - Gemeinsame Bausteine (App + Widgets)

/// Kalorien-Ring mit Verlauf.
struct KcalRing: View {
    let progress: Double
    var lineWidth: CGFloat = 12
    var theme: Theme

    var body: some View {
        ZStack {
            Circle().stroke(theme.track, lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: min(max(progress, 0), 1))
                .stroke(AngularGradient(colors: [theme.accent.opacity(0.65), theme.accent], center: .center),
                        style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
            if progress > 1 {
                Circle()
                    .trim(from: 0, to: min(progress - 1, 1))
                    .stroke(theme.warn, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                    .rotationEffect(.degrees(-90))
            }
        }
    }
}

/// Dünner Fortschrittsbalken mit runden Enden.
struct MacroBar: View {
    let value: Int
    let target: Int
    let color: Color
    var track: Color
    var height: CGFloat = 8

    var body: some View {
        GeometryReader { geo in
            let p = target > 0 ? min(Double(value) / Double(target), 1) : 0
            ZStack(alignment: .leading) {
                Capsule().fill(track)
                Capsule().fill(color).frame(width: max(p > 0 ? height : 0, geo.size.width * p))
            }
        }
        .frame(height: height)
    }
}
