import Foundation

/// Gemeinsamer Speicher für App und Widgets (App Group).
enum SharedStore {
    static let appGroup = "group.app.ernaehrung.plan"
    static let defaultServer = "https://server-production-d305e4a1.up.railway.app"

    static var defaults: UserDefaults { UserDefaults(suiteName: appGroup) ?? .standard }

    static var token: String? {
        get { defaults.string(forKey: "token") }
        set { defaults.set(newValue, forKey: "token") }
    }
    static var server: String {
        get { defaults.string(forKey: "server") ?? defaultServer }
        set { defaults.set(newValue.trimmingCharacters(in: .whitespacesAndNewlines), forKey: "server") }
    }
    static var user: AppUser? {
        get { defaults.data(forKey: "user").flatMap { try? JSONDecoder().decode(AppUser.self, from: $0) } }
        set { defaults.set(newValue.flatMap { try? JSONEncoder().encode($0) }, forKey: "user") }
    }
    /// Letzter „Heute“-Stand – Widgets zeigen ihn, wenn kein Netz da ist.
    static var cachedToday: TodayPayload? {
        get { defaults.data(forKey: "today").flatMap { try? JSONDecoder().decode(TodayPayload.self, from: $0) } }
        set { defaults.set(newValue.flatMap { try? JSONEncoder().encode($0) }, forKey: "today") }
    }
    static var liveActivityEnabled: Bool {
        get { defaults.object(forKey: "liveActivity") as? Bool ?? true }
        set { defaults.set(newValue, forKey: "liveActivity") }
    }
    static func signOut() {
        token = nil; user = nil; cachedToday = nil
    }
}

enum APIError: LocalizedError {
    case unauthorized
    case server(String)
    case network

    var errorDescription: String? {
        switch self {
        case .unauthorized: return "Bitte neu anmelden."
        case .server(let m): return m
        case .network: return "Keine Verbindung zum Server."
        }
    }
}

struct APIClient {
    var server: String = SharedStore.server
    var token: String? = SharedStore.token

    private func request(_ method: String, _ path: String, query: [String: String] = [:], body: [String: Any]? = nil) async throws -> Data {
        guard var comps = URLComponents(string: server + path) else { throw APIError.network }
        if !query.isEmpty { comps.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) } }
        guard let url = comps.url else { throw APIError.network }
        var req = URLRequest(url: url, timeoutInterval: 20)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token { req.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
        if let body { req.httpBody = try JSONSerialization.data(withJSONObject: body) }
        let data: Data, resp: URLResponse
        do { (data, resp) = try await URLSession.shared.data(for: req) } catch { throw APIError.network }
        let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
        if status == 401 && !path.contains("login") && !path.contains("register") { throw APIError.unauthorized }
        guard (200..<300).contains(status) else {
            let msg = (try? JSONDecoder().decode(ServerError.self, from: data))?.error ?? "Fehler \(status)"
            throw APIError.server(msg)
        }
        return data
    }

    private func get<T: Decodable>(_ path: String, query: [String: String] = [:]) async throws -> T {
        try JSONDecoder().decode(T.self, from: try await request("GET", path, query: query))
    }

    // MARK: Konto
    func login(email: String, password: String) async throws -> AuthResponse {
        try JSONDecoder().decode(AuthResponse.self, from: try await request("POST", "/api/login", body: ["email": email, "password": password]))
    }
    func register(code: String, name: String, email: String, password: String) async throws -> AuthResponse {
        try JSONDecoder().decode(AuthResponse.self, from: try await request("POST", "/api/register", body: ["code": code, "name": name, "email": email, "password": password]))
    }
    func logout() async { _ = try? await request("POST", "/api/logout") }
    func me() async throws -> AppUser { (try await get("/api/me") as MeResponse).user }

    // MARK: Daten
    func today(date: Date = Date()) async throws -> TodayPayload {
        try await get("/api/today", query: ["date": DateFormatter.isoDay.string(from: date), "now": DateFormatter.hhmm.string(from: date)])
    }
    func week() async throws -> WeekPayload { try await get("/api/week") }
    func shopping() async throws -> ShoppingPayload { try await get("/api/shopping") }

    func setMeal(slot: String, done: Bool, date: Date = Date()) async throws {
        _ = try await request("POST", "/api/meal", body: ["date": DateFormatter.isoDay.string(from: date), "slot": slot, "done": done, "time": DateFormatter.hhmm.string(from: Date())])
    }
    func addWater(_ ml: Int, date: Date = Date()) async throws {
        _ = try await request("POST", "/api/water", body: ["date": DateFormatter.isoDay.string(from: date), "deltaMl": ml])
    }
    func addWeight(_ kg: Double, date: Date = Date()) async throws {
        _ = try await request("POST", "/api/weight", body: ["date": DateFormatter.isoDay.string(from: date), "kg": kg])
    }
    func deleteWeight(date: String) async throws {
        _ = try await request("DELETE", "/api/weight", query: ["date": date])
    }
    func setChecked(foodId: String, checked: Bool) async throws {
        _ = try await request("POST", "/api/shopping/check", body: ["foodId": foodId, "checked": checked])
    }
}
