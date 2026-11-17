import Foundation
import ActivityKit

/// Startet/aktualisiert die Live-Aktivität (Dynamic Island + Sperrbildschirm).
@MainActor
final class LiveActivityManager {
    static let shared = LiveActivityManager()
    private init() {}

    private var current: Activity<MealActivityAttributes>? {
        Activity<MealActivityAttributes>.activities.first
    }

    var isAvailable: Bool { ActivityAuthorizationInfo().areActivitiesEnabled }

    func sync(with today: TodayPayload) {
        guard SharedStore.liveActivityEnabled, isAvailable else { end(); return }
        let state = MealActivityAttributes.ContentState(today: today)
        // Ende des Tages: alles gegessen → kurz stehen lassen, dann weg
        let stale = Calendar.current.date(byAdding: .hour, value: 3, to: Date())
        let content = ActivityContent(state: state, staleDate: stale)
        if let activity = current {
            Task { await activity.update(content) }
            if state.allDone {
                Task { await activity.end(content, dismissalPolicy: .after(Date().addingTimeInterval(60 * 60))) }
            }
        } else if !state.allDone {
            let attrs = MealActivityAttributes(personName: today.person.name, theme: today.person.theme)
            _ = try? Activity.request(attributes: attrs, content: content, pushType: nil)
        }
    }

    func end() {
        for activity in Activity<MealActivityAttributes>.activities {
            Task { await activity.end(nil, dismissalPolicy: .immediate) }
        }
    }
}
