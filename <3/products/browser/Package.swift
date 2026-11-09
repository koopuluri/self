// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "GhostBrowser", platforms: [.macOS(.v14)],
    products: [.executable(name: "GhostBrowser", targets: ["GhostBrowser"])],
    targets: [
        .executableTarget(name: "GhostBrowser", resources: [.copy("Resources")], swiftSettings: [.swiftLanguageMode(.v5)]),
        .testTarget(name: "GhostBrowserTests", dependencies: ["GhostBrowser"], swiftSettings: [.swiftLanguageMode(.v5)])
    ]
)
