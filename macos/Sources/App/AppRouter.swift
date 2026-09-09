import Combine
import Foundation

@MainActor
final class AppRouter: ObservableObject {
    static let baseURL = URL(string: "https://academic-student-client.43-132-136-104.sslip.io")!

    @Published private(set) var request = URLRequest(url: baseURL.appendingPathComponent("dashboard"))

    func open(path: String) {
        let cleanPath = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        request = URLRequest(url: Self.baseURL.appendingPathComponent(cleanPath))
    }

    func open(_ deepLink: URL) {
        guard deepLink.scheme == "academiccenter" else { return }
        let destination = deepLink.host ?? deepLink.path
        let allowed = ["dashboard", "schedule", "todos", "exams", "drive"]
        open(path: allowed.contains(destination) ? destination : "dashboard")
    }

    func reload() {
        var refreshed = request
        refreshed.cachePolicy = .reloadIgnoringLocalCacheData
        request = refreshed
    }
}
