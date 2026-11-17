import SwiftUI

struct PlanView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.theme) var theme
    @State private var selected: Int?

    var body: some View {
        ZStack {
            theme.background.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 16) {
                    ScreenHeader(eyebrow: "Mo – So · deine Mengen", title: "Wochenplan")
                    if let w = model.week {
                        let day = selected ?? w.todayIndex
                        dayPicker(w, selected: day)
                        TwoColumn {
                            if let d = w.days.first(where: { $0.index == day }) { dayCard(d) }
                        } right: {
                            weekBars(w, selected: day)
                        }
                    } else {
                        ProgressView().padding(60)
                    }
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 24)
                .readableWidth()
            }
            .refreshable { await model.refreshWeek() }
        }
    }

    private func dayPicker(_ w: WeekPayload, selected: Int) -> some View {
        HStack(spacing: 6) {
            ForEach(w.days) { d in
                let on = d.index == selected
                Button { withAnimation(.snappy) { self.selected = d.index } } label: {
                    VStack(spacing: 4) {
                        Text(d.short).font(.subheadline.weight(.bold))
                        Circle().fill(d.index == w.todayIndex ? (on ? theme.onAccent : theme.accent) : .clear).frame(width: 5, height: 5)
                    }
                    .frame(maxWidth: .infinity).padding(.vertical, 10)
                    .foregroundStyle(on ? theme.onAccent : theme.ink2)
                    .background(on ? theme.accent : theme.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func dayCard(_ d: WeekDay) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                Text(d.label).font(.title3.weight(.bold)).foregroundStyle(theme.ink)
                Spacer()
                Text("\(d.kcal.de) kcal · \(d.protein) g P").font(.subheadline.monospacedDigit()).foregroundStyle(theme.ink2)
            }
            ForEach(d.meals) { m in
                VStack(alignment: .leading, spacing: 6) {
                    Text(m.label.uppercased()).font(.caption2.weight(.bold)).tracking(0.8).foregroundStyle(theme.accent)
                    Text(m.name).font(.subheadline.weight(.semibold)).foregroundStyle(theme.ink)
                    Text(m.ingredients.map { "\($0.grams ?? 0) g \($0.name)" }.joined(separator: " · "))
                        .font(.caption).foregroundStyle(theme.ink2)
                    Text("\(m.kcal.de) kcal · P \(m.protein) · KH \(m.carbs) · F \(m.fat)")
                        .font(.caption.monospacedDigit()).foregroundStyle(theme.muted)
                }
                if m.id != d.meals.last?.id { Divider().overlay(theme.track) }
            }
        }
        .card()
    }

    private func weekBars(_ w: WeekPayload, selected: Int) -> some View {
        let target = model.today?.targets.kcal ?? 0
        let maxV = max(w.days.map(\.kcal).max() ?? 1, target, 1)
        return VStack(alignment: .leading, spacing: 10) {
            Text("Kalorien pro Tag").font(.headline).foregroundStyle(theme.ink)
            HStack(alignment: .bottom, spacing: 8) {
                ForEach(w.days) { d in
                    VStack(spacing: 6) {
                        Text((Double(d.kcal) / 1000).de(1) + "k")
                            .font(.caption2.monospacedDigit()).foregroundStyle(theme.muted)
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .fill(d.index == selected ? theme.accent : theme.accent.opacity(0.35))
                            .frame(height: max(6, CGFloat(d.kcal) / CGFloat(maxV) * 120))
                        Text(d.short).font(.caption2.weight(.semibold)).foregroundStyle(theme.ink2)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .frame(height: 165, alignment: .bottom)
            if target > 0 {
                Text("Ziel: \(target.de) kcal").font(.caption).foregroundStyle(theme.muted)
            }
        }
        .card()
    }
}
