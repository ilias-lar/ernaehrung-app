import Foundation

// Antworten des eigenen Servers (siehe server/lib/model.js)

struct AppUser: Codable, Equatable {
    let id: String
    let name: String
    let email: String
    let role: String
    let pid: String
    var isAdmin: Bool { role == "admin" }
}

struct AuthResponse: Codable {
    let token: String
    let user: AppUser
}

struct MeResponse: Codable { let user: AppUser }

struct PersonInfo: Codable, Equatable {
    let id: String
    let name: String
    let theme: String
    let goal: String?
}

struct Macros: Codable, Equatable {
    var kcal: Int
    var protein: Int
    var carbs: Int
    var fat: Int
    var fiber: Int?

    static let zero = Macros(kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0)
}

struct MainIngredient: Codable, Equatable, Hashable {
    let name: String
    let grams: Int?
}

struct Ingredient: Codable, Equatable, Hashable, Identifiable {
    let foodId: String
    let name: String
    let grams: Int?
    let note: String?
    var id: String { foodId }
}

struct Meal: Codable, Equatable, Identifiable {
    let slot: String
    let label: String
    let time: String?
    let name: String
    let recipeId: String?
    var done: Bool?
    let doneAt: String?
    let main: MainIngredient?
    let ingredients: [Ingredient]
    let steps: [String]?
    let kcal: Int
    let protein: Int
    let carbs: Int
    let fat: Int
    let fiber: Int?

    var id: String { slot }
    var isDone: Bool { done ?? false }
}

struct NextMeal: Codable, Equatable {
    let slot: String
    let label: String
    let time: String?
    let name: String
    let kcal: Int
    let protein: Int
    let main: MainIngredient?
}

struct Micro: Codable, Equatable, Identifiable, Hashable {
    let key: String
    let label: String
    let unit: String
    let amount: Double?
    let reference: Double?
    let pct: Int?
    let status: String
    let isMax: Bool?
    var id: String { key }
}

struct WeightEntry: Codable, Equatable, Identifiable, Hashable {
    let date: String
    let kg: Double
    var id: String { date }

    var day: Date { DateFormatter.isoDay.date(from: date) ?? Date() }
}

struct WeightInfo: Codable, Equatable {
    let latest: WeightEntry?
    let kgPerWeek: Double?
    let entries: [WeightEntry]
}

struct TodayPayload: Codable, Equatable {
    let person: PersonInfo
    let date: String
    let weekday: String
    let targets: Macros
    var eaten: Macros
    let planned: Macros
    var meals: [Meal]
    let next: NextMeal?
    let micros: [Micro]
    let lowest: [Micro]
    let water: Int
    let weight: WeightInfo

    var kcalProgress: Double { targets.kcal > 0 ? Double(eaten.kcal) / Double(targets.kcal) : 0 }
}

struct WeekMeal: Codable, Equatable, Identifiable {
    let slot: String
    let label: String
    let name: String
    let main: MainIngredient?
    let ingredients: [Ingredient]
    let kcal: Int
    let protein: Int
    let carbs: Int
    let fat: Int
    var id: String { slot }
}

struct WeekDay: Codable, Equatable, Identifiable {
    let index: Int
    let label: String
    let short: String
    let meals: [WeekMeal]
    let kcal: Int
    let protein: Int
    let carbs: Int
    let fat: Int
    var id: Int { index }
}

struct WeekPayload: Codable, Equatable {
    let days: [WeekDay]
    let today: String
    let todayIndex: Int
}

struct ShopItem: Codable, Equatable, Identifiable {
    let foodId: String
    let name: String
    let amount: String
    let costCzk: Int?
    var checked: Bool
    var id: String { foodId }
}

struct ShopGroup: Codable, Equatable, Identifiable {
    let id: String
    let label: String
    var items: [ShopItem]
}

struct ShoppingPayload: Codable, Equatable {
    let scenario: String
    let weekCzk: Int?
    let monthCzk: Int?
    var groups: [ShopGroup]
}

struct ServerError: Codable { let error: String }

extension DateFormatter {
    /// JJJJ-MM-TT in lokaler Zeit
    static let isoDay: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()
    static let hhmm: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "HH:mm"
        return f
    }()
}

extension Int {
    /// 2900 → „2.900“
    var de: String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.locale = Locale(identifier: "de_DE")
        return f.string(from: NSNumber(value: self)) ?? "\(self)"
    }
}

extension Double {
    func de(_ digits: Int = 1) -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.locale = Locale(identifier: "de_DE")
        f.minimumFractionDigits = digits
        f.maximumFractionDigits = digits
        return f.string(from: NSNumber(value: self)) ?? "\(self)"
    }
}

/// „19:00“ heute als Datum
func timeToday(_ hhmm: String?, on day: Date = Date()) -> Date? {
    guard let hhmm, hhmm.count == 5 else { return nil }
    let parts = hhmm.split(separator: ":").compactMap { Int($0) }
    guard parts.count == 2 else { return nil }
    return Calendar.current.date(bySettingHour: parts[0], minute: parts[1], second: 0, of: day)
}
