import Foundation

struct TodaySnapshot: Codable {
    let date: String
    let updatedAt: String
    let teachingWeek: Int?
    let items: [TodaySnapshotItem]
}

struct TodaySnapshotItem: Codable, Identifiable {
    let id: String
    let title: String
    let detail: String
    let kind: String
    let destination: String
}

enum TodaySnapshotStore {
    static let suiteName = "group.com.albertmindful.academiccenter"
    private static let snapshotKey = "today-snapshot"

    static var defaults: UserDefaults? {
        UserDefaults(suiteName: suiteName)
    }

    static func save(_ snapshot: TodaySnapshot) {
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        defaults?.set(data, forKey: snapshotKey)
    }

    static func load() -> TodaySnapshot? {
        guard
            let data = defaults?.data(forKey: snapshotKey),
            let snapshot = try? JSONDecoder().decode(TodaySnapshot.self, from: data)
        else { return nil }
        return snapshot
    }

    static func clear() {
        defaults?.removeObject(forKey: snapshotKey)
    }
}
