import SwiftUI

@main
struct AcademicCenterApp: App {
    @StateObject private var router = AppRouter()

    var body: some Scene {
        WindowGroup("学业中心") {
            AcademicWebView(router: router)
                .frame(minWidth: 860, minHeight: 620)
                .onOpenURL { router.open($0) }
        }
        .defaultSize(width: 1180, height: 780)
        .commands {
            CommandGroup(replacing: .newItem) { }
            CommandMenu("导航") {
                Button("今天") { router.open(path: "/dashboard") }
                    .keyboardShortcut("1", modifiers: .command)
                Button("课表") { router.open(path: "/schedule") }
                    .keyboardShortcut("2", modifiers: .command)
                Button("待办") { router.open(path: "/todos") }
                    .keyboardShortcut("3", modifiers: .command)
                Divider()
                Button("重新载入") { router.reload() }
                    .keyboardShortcut("r", modifiers: .command)
            }
        }
    }
}
