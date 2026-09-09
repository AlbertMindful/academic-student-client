import SwiftUI
import WidgetKit

struct AcademicEntry: TimelineEntry {
    let date: Date
    let snapshot: TodaySnapshot?
}

struct AcademicProvider: TimelineProvider {
    func placeholder(in context: Context) -> AcademicEntry {
        AcademicEntry(date: Date(), snapshot: previewSnapshot)
    }

    func getSnapshot(in context: Context, completion: @escaping (AcademicEntry) -> Void) {
        completion(AcademicEntry(date: Date(), snapshot: TodaySnapshotStore.load() ?? previewSnapshot))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<AcademicEntry>) -> Void) {
        let now = Date()
        let nextMidnight = Calendar.current.startOfDay(for: now).addingTimeInterval(86_400)
        let entry = AcademicEntry(date: now, snapshot: TodaySnapshotStore.load())
        completion(Timeline(entries: [entry], policy: .after(nextMidnight)))
    }

    private var previewSnapshot: TodaySnapshot {
        TodaySnapshot(
            date: "2026-09-09",
            updatedAt: "2026-09-09T08:00:00.000Z",
            teachingWeek: 2,
            items: [
                TodaySnapshotItem(id: "1", title: "数据结构", detail: "08:30 · A教学楼 302", kind: "课程", destination: "schedule"),
                TodaySnapshotItem(id: "2", title: "高等数学", detail: "10:20 · B教学楼 205", kind: "课程", destination: "schedule"),
            ]
        )
    }
}

struct AcademicWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: AcademicEntry

    var body: some View {
        Group {
            if family == .systemSmall {
                smallView
            } else {
                mediumView
            }
        }
        .containerBackground(for: .widget) {
            Color(red: 0.965, green: 0.975, blue: 0.995)
        }
    }

    private var mark: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Color(red: 0.192, green: 0.373, blue: 0.859))
            Image(systemName: "book.fill")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(.white)
        }
        .frame(width: 38, height: 38)
    }

    private var dateText: String {
        entry.date.formatted(.dateTime.month(.wide).day().weekday(.wide))
    }

    private var items: [TodaySnapshotItem] {
        entry.snapshot?.items ?? []
    }

    private var smallView: some View {
        VStack(alignment: .leading, spacing: 0) {
            mark
            Spacer()
            if let first = items.first {
                Text(first.title)
                    .font(.headline)
                    .foregroundStyle(.primary)
                    .lineLimit(2)
                Text(first.detail.isEmpty ? first.kind : first.detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            } else {
                Text(entry.snapshot == nil ? "打开应用同步" : "今天暂无安排")
                    .font(.headline)
                    .foregroundStyle(.primary)
                    .lineLimit(2)
                Text(dateText)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .widgetURL(URL(string: "academiccenter://dashboard"))
    }

    private var mediumView: some View {
        HStack(spacing: 18) {
            VStack(alignment: .leading, spacing: 8) {
                mark
                Text(entry.snapshot == nil ? "打开应用同步" : "今天 \(items.count) 项")
                    .font(.headline)
                Text(dateText)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 4)

            if items.isEmpty {
                VStack(spacing: 8) {
                    shortcut("今天", icon: "sun.max", destination: "dashboard")
                    shortcut("课表", icon: "calendar", destination: "schedule")
                    shortcut("待办", icon: "checkmark.circle", destination: "todos")
                }
                .frame(width: 126)
            } else {
                VStack(spacing: 7) {
                    ForEach(items.prefix(3)) { item in
                        itemRow(item)
                    }
                }
                .frame(width: 174)
            }
        }
        .privacySensitive()
    }

    private func shortcut(_ title: String, icon: String, destination: String) -> some View {
        Link(destination: URL(string: "academiccenter://\(destination)")!) {
            HStack(spacing: 7) {
                Image(systemName: icon)
                    .frame(width: 16)
                Text(title)
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.tertiary)
            }
            .font(.caption.weight(.medium))
            .foregroundStyle(.primary)
            .padding(.horizontal, 10)
            .frame(height: 30)
            .background(.white.opacity(0.68), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
        }
    }

    private func itemRow(_ item: TodaySnapshotItem) -> some View {
        Link(destination: URL(string: "academiccenter://\(item.destination)")!) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(item.kind)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(Color(red: 0.192, green: 0.373, blue: 0.859))
                    Text(item.title)
                        .font(.caption.weight(.semibold))
                        .lineLimit(1)
                }
                Text(item.detail)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 9)
            .frame(height: 38)
            .background(.white.opacity(0.68), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
        }
    }
}

struct AcademicCenterWidget: Widget {
    let kind = "AcademicCenterWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: AcademicProvider()) { entry in
            AcademicWidgetView(entry: entry)
        }
        .configurationDisplayName("学业中心")
        .description("快速打开今天、课表和待办。")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct AcademicCenterWidgetBundle: WidgetBundle {
    var body: some Widget {
        AcademicCenterWidget()
    }
}
