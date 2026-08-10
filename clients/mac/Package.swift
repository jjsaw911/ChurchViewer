// swift-tools-version: 6.0
import PackageDescription

/**
 Built with SwiftPM rather than an Xcode project on purpose: the whole thing is
 one target and a build script, so it can be read in a diff, built from a
 terminal, and doesn't carry a project file that only one machine can merge.

 `./build.sh` wraps the binary this produces into a real .app bundle.
 */
let package = Package(
    name: "ChurchViewerDisplay",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "ChurchViewerDisplay",
            path: "Sources/ChurchViewerDisplay"
        )
    ]
)
