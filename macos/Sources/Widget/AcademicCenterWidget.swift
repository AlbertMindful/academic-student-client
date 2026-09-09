import SwiftUI
import WidgetKit

struct AcademicEntry: TimelineEntry {
    let date: Date
}

struct AcademicProvider: TimelineProvider {
    func placeholder(in context: Context) -> AcademicEntry {
        AcademicEntry(date: Date())
    }

    func getSnapshot(in context: Context, completion: @escaping (AcademicEntry) -> Void) {
        completion(AcademicEntry(date: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<AcademicEntry>) -> Void) {
        let now = Date()
        let nextMidnight = Calendar.current.startOfDay(for: now).addingTimeInterval(86_400)
        completion(Timeline(entries: [AcademicEntry(date: now)], policy: .after(nextMidnight)))
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

    private var smallView: some View {
        VStack(alignment: .leading, spacing: 0) {
            mark
            Spacer()
            Text("今天")
                .font(.title2.weight(.semibold))
                .foregroundStyle(.primary)
            Text(dateText)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .widgetURL(URL(string: "academiccenter://dashboard"))
    }

    private var mediumView: some View {
        HStack(spacing: 18) {
            VStack(alignment: .leading, spacing: 8) {
                mark
                Text("学业中心")
                    .font(.headline)
                Text(dateText)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 4)

            VStack(spacing: 8) {
                shortcut("今天", icon: "sun.max", destination: "dashboard")
                shortcut("课表", icon: "calendar", destination: "schedule")
                shortcut("待办", icon: "checkmark.circle", destination: "todos")
            }
            .frame(width: 126)
        }
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
