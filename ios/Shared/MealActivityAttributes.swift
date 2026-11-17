import Foundation
#if canImport(ActivityKit)
import ActivityKit

/// Live-Aktivität für Sperrbildschirm & Dynamic Island: nächste Mahlzeit + Kalorienstand.
struct MealActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var mealLabel: String      // „Abend“
        var mealName: String       // „Rinderfilet mit Bohnen & Kartoffeln“
        var mainName: String?      // „Rinderfilet“
        var mainGrams: Int?        // 220
        var mealTime: Date?        // 19:00 heute
        var kcalEaten: Int
        var kcalTarget: Int
        var proteinEaten: Int
        var proteinTarget: Int
        var allDone: Bool

        var progress: Double { kcalTarget > 0 ? Double(kcalEaten) / Double(kcalTarget) : 0 }
    }

    var personName: String
    var theme: String
}

extension MealActivityAttributes.ContentState {
    init(today t: TodayPayload) {
        let next = t.next
        self.init(mealLabel: next?.label ?? "Fertig",
                  mealName: next?.name ?? "Alle Mahlzeiten für heute erledigt",
                  mainName: next?.main?.name,
                  mainGrams: next?.main?.grams,
                  mealTime: timeToday(next?.time),
                  kcalEaten: t.eaten.kcal, kcalTarget: t.targets.kcal,
                  proteinEaten: t.eaten.protein, proteinTarget: t.targets.protein,
                  allDone: next == nil)
    }
}
#endif
