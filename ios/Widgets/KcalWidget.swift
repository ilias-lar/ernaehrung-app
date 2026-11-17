import WidgetKit
import SwiftUI

struct TodayEntry: TimelineEntry {
    let date: Date
    let today: TodayPayload?
    var theme: Theme { Theme.of(today?.person.theme ?? SharedStore.user?.pid) }

    static let placeholder = TodayEntry(date: Date(), today: nil)
}

struct TodayProvider: TimelineProvider {
    func placeholder(in context: Context) -> TodayEntry { .placeholder }

    func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
        completion(TodayEntry(date: Date(), today: SharedStore.cachedToday))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
        Task {
            var today = SharedStore.cachedToday
            if SharedStore.token != nil, let fresh = try? await APIClient().today() {
                today = fresh
                SharedStore.cachedToday = fresh
            }
            // Veralteter Cache vom Vortag zählt nicht
            if let t = today, t.date != DateFormatter.isoDay.string(from: Date()) { today = nil }
            let now = Date()
            var refresh = now.addingTimeInterval(30 * 60)
            if let at = timeToday(today?.next?.time), at > now, at < refresh { refresh = at }
            completion(Timeline(entries: [TodayEntry(date: now, today: today)], policy: .after(refresh)))
        }
    }
}

struct KcalWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: TodayEntry

    var body: some View {
        let theme = entry.theme
        Group {
            if let t = entry.today {
                switch family {
                case .systemSmall: small(t, theme)
                case .systemMedium: medium(t, theme)
                case .accessoryCircular: circular(t)
                case .accessoryRectangular: rectangular(t)
                case .accessoryInline: inline(t)
                default: small(t, theme)
                }
            } else {
                VStack(spacing: 6) {
                    Image(systemName: theme.mascot).font(.title2).foregroundStyle(theme.accent)
                    Text(SharedStore.token == nil ? "In der App anmelden" : "Öffne die App")
                        .font(.caption).foregroundStyle(theme.ink2).multilineTextAlignment(.center)
                }
            }
        }
        .containerBackground(for: .widget) { theme.background }
    }

    // Klein: Ring + Zahl
    private func small(_ t: TodayPayload, _ theme: Theme) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: theme.mascot).font(.caption.weight(.bold)).foregroundStyle(theme.accent)
                Spacer()
                Text("\(Int((t.kcalProgress * 100).rounded())) %").font(.caption.weight(.bold)).foregroundStyle(theme.accent)
            }
            ZStack {
                KcalRing(progress: t.kcalProgress, lineWidth: 10, theme: theme)
                VStack(spacing: 0) {
                    Text(t.eaten.kcal.de).font(.system(size: 22, weight: .bold, design: .rounded)).foregroundStyle(theme.ink)
                        .minimumScaleFactor(0.7)
                    Text("/ \(t.targets.kcal.de)").font(.system(size: 10)).foregroundStyle(theme.muted)
                }
            }
        }
    }

    // Mittel: Ring + Makros + nächste Mahlzeit
    private func medium(_ t: TodayPayload, _ theme: Theme) -> some View {
        HStack(spacing: 16) {
            ZStack {
                KcalRing(progress: t.kcalProgress, lineWidth: 11, theme: theme)
                VStack(spacing: 0) {
                    Text(t.eaten.kcal.de).font(.system(size: 22, weight: .bold, design: .rounded)).foregroundStyle(theme.ink)
                    Text("von \(t.targets.kcal.de)").font(.system(size: 10)).foregroundStyle(theme.muted)
                }
            }
            .frame(width: 104, height: 104)
            VStack(alignment: .leading, spacing: 7) {
                bar("P", t.eaten.protein, t.targets.protein, theme.protein, theme)
                bar("KH", t.eaten.carbs, t.targets.carbs, theme.carbs, theme)
                bar("F", t.eaten.fat, t.targets.fat, theme.fat, theme)
                if let n = t.next {
                    HStack(spacing: 4) {
                        Text(n.time ?? "").font(.caption2.weight(.bold)).foregroundStyle(theme.accent)
                        Text(n.main.map { "\($0.grams ?? 0) g \($0.name)" } ?? n.name)
                            .font(.caption2).foregroundStyle(theme.ink2).lineLimit(1)
                    }
                    .padding(.top, 2)
                } else {
                    Text("Alles gegessen ✓").font(.caption2.weight(.semibold)).foregroundStyle(theme.accent)
                }
            }
        }
    }

    private func bar(_ label: String, _ v: Int, _ target: Int, _ color: Color, _ theme: Theme) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(label).font(.system(size: 10, weight: .bold)).foregroundStyle(theme.ink2)
                Spacer()
                Text("\(v)/\(target) g").font(.system(size: 10).monospacedDigit()).foregroundStyle(theme.muted)
            }
            MacroBar(value: v, target: target, color: color, track: theme.track, height: 5)
        }
    }

    // Sperrbildschirm
    private func circular(_ t: TodayPayload) -> some View {
        Gauge(value: min(t.kcalProgress, 1)) {
            Image(systemName: "flame.fill")
        } currentValueLabel: {
            Text("\(Int((t.kcalProgress * 100).rounded()))")
        }
        .gaugeStyle(.accessoryCircularCapacity)
        .widgetAccentable()
    }

    private func rectangular(_ t: TodayPayload) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(t.eaten.kcal.de) / \(t.targets.kcal.de) kcal").font(.headline).widgetAccentable()
            Gauge(value: min(t.kcalProgress, 1)) { EmptyView() }.gaugeStyle(.accessoryLinearCapacity)
            if let n = t.next {
                Text("\(n.time ?? "") · \(n.main.map { "\($0.grams ?? 0) g \($0.name)" } ?? n.name)").font(.caption).lineLimit(1)
            } else {
                Text("Alles gegessen ✓").font(.caption)
            }
        }
    }

    private func inline(_ t: TodayPayload) -> some View {
        if let n = t.next {
            Text("\(n.time ?? "") \(n.main?.name ?? n.name) · \(t.eaten.kcal.de) kcal")
        } else {
            Text("\(t.eaten.kcal.de) / \(t.targets.kcal.de) kcal ✓")
        }
    }
}

struct KcalWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "KcalWidget", provider: TodayProvider()) { entry in
            KcalWidgetView(entry: entry)
        }
        .configurationDisplayName("Kalorien heute")
        .description("Kalorienring, Makros und deine nächste Mahlzeit.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}
