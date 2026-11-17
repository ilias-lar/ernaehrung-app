import WidgetKit
import SwiftUI

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

struct KcalWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    let entry: TodayEntry
    var body: some View { KcalWidgetView(family: family, entry: entry) }
}

struct KcalWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "KcalWidget", provider: TodayProvider()) { entry in
            KcalWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Kalorien heute")
        .description("Kalorienring, Makros und deine nächste Mahlzeit.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}
