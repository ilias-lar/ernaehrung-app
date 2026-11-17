import SwiftUI
import WidgetKit

@MainActor
final class AppModel: ObservableObject {
    @Published var user: AppUser? = SharedStore.user
    @Published var today: TodayPayload? = SharedStore.cachedToday
    @Published var week: WeekPayload?
    @Published var shopping: ShoppingPayload?
    @Published var error: String?
    @Published var loading = false

    var theme: Theme { Theme.of(today?.person.theme ?? user?.pid) }
    private var api: APIClient { APIClient() }

    /// Vorschau-Modus mit Beispieldaten (Start-Argument „-demo ilias|freundin“), ohne Server.
    let demo: String? = UserDefaults.standard.string(forKey: "demo")

    init() {
        guard let demo, let url = Bundle.main.url(forResource: "demo", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let d = try? JSONDecoder().decode(DemoBundle.self, from: data) else { return }
        let isF = demo == "freundin"
        today = isF ? d.freundin : d.ilias
        week = isF ? d.weekFreundin : d.weekIlias
        shopping = d.shopping
        user = AppUser(id: "demo", name: isF ? "Freundin" : "Ilias", email: "demo@beispiel.de", role: isF ? "user" : "admin", pid: isF ? "freundin" : "ilias")
    }

    // MARK: Anmeldung
    func signedIn(_ r: AuthResponse) {
        SharedStore.token = r.token
        SharedStore.user = r.user
        user = r.user
        Task { await refreshAll() }
    }

    func signOut() {
        Task { await api.logout() }
        LiveActivityManager.shared.end()
        SharedStore.signOut()
        user = nil; today = nil; week = nil; shopping = nil
        WidgetCenter.shared.reloadAllTimelines()
    }

    private func handle(_ e: Error) {
        if case APIError.unauthorized = e { signOut(); return }
        error = e.localizedDescription
    }

    // MARK: Laden
    func refreshAll() async {
        guard user != nil, demo == nil else { return }
        loading = true
        defer { loading = false }
        await refreshToday()
        async let w: Void = refreshWeek()
        async let s: Void = refreshShopping()
        _ = await (w, s)
    }

    func refreshToday() async {
        guard demo == nil else { return }
        do {
            let t = try await api.today()
            today = t
            SharedStore.cachedToday = t
            error = nil
            WidgetCenter.shared.reloadAllTimelines()
            LiveActivityManager.shared.sync(with: t)
        } catch { handle(error) }
    }

    func refreshWeek() async {
        guard demo == nil else { return }
        do { week = try await api.week() } catch { handle(error) }
    }

    func refreshShopping() async {
        guard demo == nil else { return }
        do { shopping = try await api.shopping() } catch { handle(error) }
    }

    // MARK: Aktionen
    func toggle(_ meal: Meal) async {
        let newValue = !meal.isDone
        // sofort anzeigen, dann mit dem Server abgleichen
        if var t = today, let i = t.meals.firstIndex(where: { $0.slot == meal.slot }) {
            t.meals[i].done = newValue
            let sign = newValue ? 1 : -1
            t.eaten.kcal += sign * meal.kcal
            t.eaten.protein += sign * meal.protein
            t.eaten.carbs += sign * meal.carbs
            t.eaten.fat += sign * meal.fat
            today = t
        }
        guard demo == nil else { return }
        do {
            try await api.setMeal(slot: meal.slot, done: newValue)
        } catch { handle(error) }
        await refreshToday()
    }

    func addWater(_ ml: Int) async {
        do { try await api.addWater(ml) } catch { handle(error) }
        await refreshToday()
    }

    func addWeight(_ kg: Double, date: Date) async {
        do { try await api.addWeight(kg, date: date) } catch { handle(error) }
        await refreshToday()
    }

    func deleteWeight(_ entry: WeightEntry) async {
        do { try await api.deleteWeight(date: entry.date) } catch { handle(error) }
        await refreshToday()
    }

    func toggle(_ item: ShopItem) async {
        if var s = shopping {
            for g in s.groups.indices {
                if let i = s.groups[g].items.firstIndex(where: { $0.foodId == item.foodId }) { s.groups[g].items[i].checked.toggle() }
            }
            shopping = s
        }
        do { try await api.setChecked(foodId: item.foodId, checked: !item.checked) } catch { handle(error) }
    }
}

struct DemoBundle: Decodable {
    let ilias: TodayPayload
    let freundin: TodayPayload
    let weekIlias: WeekPayload
    let weekFreundin: WeekPayload
    let shopping: ShoppingPayload
}
