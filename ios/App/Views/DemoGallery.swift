import SwiftUI
import WidgetKit

/// Vorschau von Dynamic Island, Sperrbildschirm und Widgets mit Beispieldaten
/// (nur im Vorschau-Modus: Start-Argumente „-demo …“ und „-gallery YES“).
struct DemoGallery: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.theme) var theme

    var body: some View {
        if let t = model.today {
            let state = MealActivityAttributes.ContentState(today: t)
            ZStack {
                LinearGradient(colors: theme.isDark
                               ? [Color(hex: 0x10261C), Color(hex: 0x0B0D0C)]
                               : [Color(hex: 0xFFD6E6), Color(hex: 0xFFF4F8)],
                               startPoint: .top, endPoint: .bottom)
                    .ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 18) {
                        // Dynamic Island – kompakt
                        HStack {
                            KcalRing(progress: state.progress, lineWidth: 3.5, theme: theme).frame(width: 20, height: 20)
                            Spacer()
                            Text(t.next?.time ?? "✓").font(.caption.weight(.bold).monospacedDigit()).foregroundStyle(theme.accent)
                        }
                        .padding(.horizontal, 14)
                        .frame(width: 250, height: 37)
                        .background(.black, in: Capsule())
                        .padding(.top, 2)

                        label("Dynamic Island – aufgeklappt")
                        expandedIsland(state)

                        label("Sperrbildschirm")
                        LockScreenActivityView(state: state, theme: theme, name: t.person.name)
                            .background(theme.background.opacity(0.92), in: RoundedRectangle(cornerRadius: 24, style: .continuous))

                        label("Widgets")
                        HStack(spacing: 16) {
                            KcalWidgetView(family: .systemSmall, entry: TodayEntry(date: Date(), today: t), inApp: true)
                                .frame(width: 158, height: 158)
                                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                            lockWidgets(t)
                        }
                        KcalWidgetView(family: .systemMedium, entry: TodayEntry(date: Date(), today: t), inApp: true)
                            .frame(width: 338, height: 158)
                            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 30)
                }
            }
        }
    }

    private func label(_ s: String) -> some View {
        Text(s.uppercased()).font(.caption2.weight(.bold)).tracking(1.2)
            .foregroundStyle(theme.isDark ? Color.white.opacity(0.55) : theme.ink2)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func expandedIsland(_ s: MealActivityAttributes.ContentState) -> some View {
        VStack(spacing: 12) {
            HStack(alignment: .center, spacing: 12) {
                ZStack {
                    KcalRing(progress: s.progress, lineWidth: 6, theme: theme)
                    Text("\(Int((s.progress * 100).rounded()))%").font(.system(size: 12, weight: .bold, design: .rounded)).foregroundStyle(.white)
                }
                .frame(width: 52, height: 52)
                VStack(spacing: 1) {
                    Text(s.mainName.map { n in "\(s.mainGrams.map { "\($0) g " } ?? "")\(n)" } ?? s.mealLabel)
                        .font(.headline).foregroundStyle(.white).lineLimit(1)
                    Text(s.mealName).font(.caption).foregroundStyle(.white.opacity(0.6)).lineLimit(1)
                }
                .frame(maxWidth: .infinity)
                VStack(alignment: .trailing, spacing: 2) {
                    Text(s.mealTime.map { DateFormatter.hhmm.string(from: $0) } ?? "✓")
                        .font(.system(.title3, design: .rounded).weight(.bold)).foregroundStyle(theme.accent)
                    Text(s.mealLabel).font(.caption2).foregroundStyle(.white.opacity(0.6))
                }
            }
            VStack(spacing: 6) {
                MacroBar(value: s.kcalEaten, target: s.kcalTarget, color: theme.accent, track: Color.white.opacity(0.12), height: 6)
                HStack {
                    Text("\(s.kcalEaten.de) / \(s.kcalTarget.de) kcal")
                    Spacer()
                    Text("Protein \(s.proteinEaten) / \(s.proteinTarget) g")
                }
                .font(.caption2.monospacedDigit())
                .foregroundStyle(.white.opacity(0.6))
            }
        }
        .padding(18)
        .background(.black, in: RoundedRectangle(cornerRadius: 42, style: .continuous))
    }

    /// Sperrbildschirm-Widgets (rund + rechteckig), nachgebaut
    private func lockWidgets(_ t: TodayPayload) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            ZStack {
                Circle().stroke(Color.white.opacity(0.25), lineWidth: 5)
                Circle().trim(from: 0, to: min(t.kcalProgress, 1))
                    .stroke(Color.white, style: StrokeStyle(lineWidth: 5, lineCap: .round)).rotationEffect(.degrees(-90))
                Text("\(Int((t.kcalProgress * 100).rounded()))").font(.system(size: 15, weight: .bold, design: .rounded))
            }
            .frame(width: 52, height: 52)
            VStack(alignment: .leading, spacing: 2) {
                Text("\(t.eaten.kcal.de) / \(t.targets.kcal.de) kcal").font(.subheadline.weight(.bold))
                Capsule().fill(Color.white.opacity(0.25)).frame(height: 4)
                    .overlay(alignment: .leading) { GeometryReader { g in Capsule().fill(.white).frame(width: g.size.width * min(t.kcalProgress, 1)) } }
                Text("\(t.next?.time ?? "") · \(t.next?.main.map { "\($0.grams ?? 0) g \($0.name)" } ?? "fertig")").font(.caption2).lineLimit(1)
            }
        }
        .foregroundStyle(.white)
        .padding(12)
        .frame(width: 162, height: 158, alignment: .leading)
        .background(Color.black.opacity(theme.isDark ? 0.35 : 0.25), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}
