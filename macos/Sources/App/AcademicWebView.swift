import AppKit
import Combine
import SwiftUI
import UniformTypeIdentifiers
import WebKit

struct AcademicWebView: NSViewRepresentable {
    @ObservedObject var router: AppRouter

    func makeCoordinator() -> Coordinator {
        Coordinator(router: router)
    }

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.preferences.isElementFullscreenEnabled = true

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsMagnification = true
        webView.setValue(false, forKey: "drawsBackground")

        context.coordinator.attach(to: webView)
        webView.load(router.request)
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) { }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
        private let router: AppRouter
        private weak var webView: WKWebView?
        private var cancellable: AnyCancellable?

        init(router: AppRouter) {
            self.router = router
        }

        func attach(to webView: WKWebView) {
            self.webView = webView
            cancellable = router.$request.dropFirst().sink { [weak webView] request in
                webView?.load(request)
            }
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            preferences: WKWebpagePreferences,
            decisionHandler: @escaping (WKNavigationActionPolicy, WKWebpagePreferences) -> Void
        ) {
            if navigationAction.shouldPerformDownload {
                decisionHandler(.download, preferences)
                return
            }

            guard let url = navigationAction.request.url else {
                decisionHandler(.cancel, preferences)
                return
            }

            let isWebURL = url.scheme == "https" || url.scheme == "http"
            let isOwnSite = url.host == AppRouter.baseURL.host
            if isWebURL && !isOwnSite {
                NSWorkspace.shared.open(url)
                decisionHandler(.cancel, preferences)
                return
            }

            decisionHandler(.allow, preferences)
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationResponse: WKNavigationResponse,
            decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
        ) {
            let headers = (navigationResponse.response as? HTTPURLResponse)?.allHeaderFields
            let disposition = headers?["Content-Disposition"] as? String
            if navigationResponse.canShowMIMEType == false || disposition?.localizedCaseInsensitiveContains("attachment") == true {
                decisionHandler(.download)
            } else {
                decisionHandler(.allow)
            }
        }

        func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
            download.delegate = self
        }

        func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
            download.delegate = self
        }

        func download(
            _ download: WKDownload,
            decideDestinationUsing response: URLResponse,
            suggestedFilename: String,
            completionHandler: @escaping (URL?) -> Void
        ) {
            let panel = NSSavePanel()
            panel.nameFieldStringValue = suggestedFilename
            panel.canCreateDirectories = true
            completionHandler(panel.runModal() == .OK ? panel.url : nil)
        }

        func webView(
            _ webView: WKWebView,
            runOpenPanelWith parameters: WKOpenPanelParameters,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping ([URL]?) -> Void
        ) {
            let panel = NSOpenPanel()
            panel.allowsMultipleSelection = parameters.allowsMultipleSelection
            panel.canChooseDirectories = parameters.allowsDirectories
            panel.canChooseFiles = true
            completionHandler(panel.runModal() == .OK ? panel.urls : nil)
        }

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if let url = navigationAction.request.url {
                if url.host == AppRouter.baseURL.host {
                    webView.load(navigationAction.request)
                } else {
                    NSWorkspace.shared.open(url)
                }
            }
            return nil
        }
    }
}
