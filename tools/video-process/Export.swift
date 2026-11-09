// Compiled alongside the artifact's archived compositor, replacing only its CLI entry point.
@main struct ExportMain {
    @MainActor static func main() async {
        do {
            let args = CommandLine.arguments
            guard args.count == 4 else { throw fail("Usage: GhostExport RECIPE ROOT OUTPUT.mp4") }
            let destination = URL(fileURLWithPath: args[3])
            guard !FileManager.default.fileExists(atPath: destination.path) else { throw fail("Export destination already exists") }
            let built = try await build(URL(fileURLWithPath: args[1]), root: URL(fileURLWithPath: args[2]))
            guard let session = AVAssetExportSession(asset: built.asset, presetName: AVAssetExportPresetHEVCHighestQuality) else {
                throw fail("HEVC export is unavailable")
            }
            session.videoComposition = built.video
            session.audioMix = built.mix
            session.timeRange = CMTimeRange(start: .zero, duration: built.recipe.time(built.recipe.frames))
            session.shouldOptimizeForNetworkUse = true
            try await session.export(to: destination, as: .mp4)
            print(destination.path)
        } catch { fputs("\(error.localizedDescription)\n", stderr); exit(1) }
    }
}
