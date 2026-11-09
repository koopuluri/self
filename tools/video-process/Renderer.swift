import AppKit
import AVKit
import AVFoundation
import CoreImage
import CryptoKit
import Metal

// This file is snapshotted with each artifact. Playback never consults a mutable recipe.
struct Clip: Codable { let source: String; let sha256: String; let startFrame: Int; let frames: Int }
struct Canvas: Codable { let width: Int; let height: Int; let fps: Int; let colorSpace: String; let fit: String? }
struct Grain: Codable { let model: String; let amount: Double; let fps: Double; let referenceHeight: Double }
struct TitleCard: Codable {
    let text: String; let frames: Int; let fadeInFrames: Int; let fadeOutFrames: Int
    let font: String; let fontSize: Double
}
struct Soundtrack: Codable {
    let source: String; let sha256: String; let start: Double; let duration: Double
    let fadeIn: Double; let fadeOut: Double; let gainDB: Double?
}
struct Recipe: Codable {
    let schema: String; let id: String; let title: String; let parent: String?
    let canvas: Canvas; let clips: [Clip]; let fadeInFrames: Int; let fadeOutFrames: Int
    let titleCard: TitleCard?; let audio: Soundtrack?; let notes: [String]
    let grain: Grain?; let fadeInCurve: String?
    var footageFrames: Int { clips.reduce(0) { $0 + $1.frames } }
    var frames: Int { footageFrames + (titleCard?.frames ?? 0) }
    func time(_ frame: Int) -> CMTime { CMTime(value: Int64(frame), timescale: Int32(canvas.fps)) }
}
func fail(_ message: String) -> NSError { NSError(domain: "GhostVideo", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
func sha(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }
func sourceURL(_ path: String, root: URL, hash: String) throws -> URL {
    let url = root.appendingPathComponent(path).resolvingSymlinksInPath()
    guard url.path.hasPrefix(root.resolvingSymlinksInPath().path + "/") else { throw fail("Source must be inside Ghost: \(path)") }
    guard sha(try Data(contentsOf: url, options: .mappedIfSafe)) == hash else { throw fail("Source changed since this artifact was saved: \(path)") }
    return url
}

final class Instruction: NSObject, AVVideoCompositionInstructionProtocol, @unchecked Sendable {
    let timeRange: CMTimeRange
    let enablePostProcessing = false
    let containsTweening = true
    let passthroughTrackID: CMPersistentTrackID = kCMPersistentTrackID_Invalid
    let requiredSourceTrackIDs: [NSValue]?
    let trackID: CMPersistentTrackID
    let transform: CGAffineTransform
    let recipe: Recipe
    let black: Bool
    let titleImage: CIImage?
    init(range: CMTimeRange, trackID: CMPersistentTrackID, transform: CGAffineTransform,
         recipe: Recipe, black: Bool, titleImage: CIImage?) {
        self.timeRange = range; self.trackID = trackID; self.transform = transform
        self.recipe = recipe; self.black = black; self.titleImage = titleImage
        self.requiredSourceTrackIDs = black ? [] : [NSNumber(value: trackID)]
    }
}

final class HDRCompositor: NSObject, AVVideoCompositing {
    let sourcePixelBufferAttributes: [String: Any]? = [
        kCVPixelBufferPixelFormatTypeKey as String: [kCVPixelFormatType_420YpCbCr10BiPlanarVideoRange],
        kCVPixelBufferMetalCompatibilityKey as String: true
    ]
    let requiredPixelBufferAttributesForRenderContext: [String: Any] = [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr10BiPlanarVideoRange,
        kCVPixelBufferMetalCompatibilityKey as String: true
    ]
    let supportsWideColorSourceFrames = true
    let supportsHDRSourceFrames = true
    let working = CGColorSpace(name: CGColorSpace.extendedLinearITUR_2020)!
    let output = CGColorSpace(name: CGColorSpace.itur_2100_HLG)!
    lazy var context: CIContext = {
        let options: [CIContextOption: Any] = [.workingColorSpace: working, .workingFormat: CIFormat.RGBAh, .cacheIntermediates: false]
        if let device = MTLCreateSystemDefaultDevice() { return CIContext(mtlDevice: device, options: options) }
        return CIContext(options: options)
    }()
    private let queue = DispatchQueue(label: "ghost.video.compositor")
    // Direct port of the grain section in lotus-study/look.js (selected amount: .91).
    // Use the same 1080-reference cells, 24 Hz time seed, exposure weighting, and chroma variation.
    // Work in a display-encoded domain for the grain response, then return to linear HDR.
    // Unlike the old SDR shader, do not clamp highlights to 1: keep the source's HDR headroom.
    lazy var grainKernel: CIColorKernel? = CIColorKernel(source: """
        float ghostHash(vec3 p) {
            p = fract(p * .1031);
            p += dot(p, p.yzx + 33.33);
            return fract((p.x + p.y) * p.z);
        }
        float ghostEncode(float x) {
            return x <= .0031308 ? 12.92 * x : 1.055 * pow(x, 1.0 / 2.4) - .055;
        }
        float ghostDecode(float x) {
            return x <= .04045 ? x / 12.92 : pow((x + .055) / 1.055, 2.4);
        }
        kernel vec4 lotusGrain(__sample source, float amount, float frame, float pixelScale) {
            vec3 color = vec3(ghostEncode(max(source.r, 0.0)), ghostEncode(max(source.g, 0.0)), ghostEncode(max(source.b, 0.0)));
            float light = dot(color, vec3(.2126, .7152, .0722));
            float flower = smoothstep(.018, .17, light);
            vec2 xy = destCoord() * pixelScale;
            vec2 cell = floor(xy / 1.35);
            float fine = ghostHash(vec3(cell, frame)) - ghostHash(vec3(cell + 71.3, frame + 19.0));
            float coarse = ghostHash(vec3(floor(xy / 2.7), frame + 39.0)) - .5;
            float texture = fine * .82 + coarse * .34;
            float exposure = .18 + .82 * pow(clamp(light, 0.0, 1.0), .35);
            color += texture * amount * .19 * exposure;
            color += vec3(fine, -coarse, coarse) * amount * .009 * flower;
            color = max(color, vec3(0.0));
            return vec4(ghostDecode(color.r), ghostDecode(color.g), ghostDecode(color.b), source.a);
        }
        """)
    func renderContextChanged(_ newRenderContext: AVVideoCompositionRenderContext) {}
    func startRequest(_ request: AVAsynchronousVideoCompositionRequest) {
        queue.async { autoreleasepool {
            guard let instruction = request.videoCompositionInstruction as? Instruction,
                  let buffer = request.renderContext.newPixelBuffer() else {
                request.finish(with: fail("Cannot allocate native composition frame")); return
            }
            let r = instruction.recipe
            let bounds = CGRect(x: 0, y: 0, width: r.canvas.width, height: r.canvas.height)
            var image = CIImage(color: .black).cropped(to: bounds)
            let frame = request.compositionTime.seconds * Double(r.canvas.fps)
            if !instruction.black {
                guard let source = request.sourceFrame(byTrackID: instruction.trackID) else {
                    request.finish(with: fail("Missing source frame at \(request.compositionTime.seconds)s")); return
                }
                var picture = CIImage(cvPixelBuffer: source).transformed(by: instruction.transform)
                let rect = picture.extent
                picture = picture.transformed(by: CGAffineTransform(translationX: -rect.minX, y: -rect.minY))
                let scale = r.canvas.fit == "contain" ? min(bounds.width / rect.width, bounds.height / rect.height)
                                                     : max(bounds.width / rect.width, bounds.height / rect.height)
                picture = picture.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
                picture = picture.transformed(by: CGAffineTransform(translationX: (bounds.width - picture.extent.width) / 2,
                                                                   y: (bounds.height - picture.extent.height) / 2))
                let progress = r.fadeInFrames > 0 ? min(1, frame / Double(r.fadeInFrames)) : 1
                let up = r.fadeInCurve == "smoothstep" ? progress * progress * (3 - 2 * progress) : progress
                let down = r.fadeOutFrames > 0 ? min(1, Double(r.footageFrames - 1) / Double(r.fadeOutFrames) - frame / Double(r.fadeOutFrames)) : 1
                image = Self.opacity(picture, max(0, min(up, down))).composited(over: image)
            } else if let title = r.titleCard, let text = instruction.titleImage {
                let local = frame - Double(r.footageFrames)
                let up = title.fadeInFrames > 0 ? min(1, local / Double(title.fadeInFrames)) : 1
                let down = title.fadeOutFrames > 0 ? min(1, (Double(title.frames - 1) - local) / Double(title.fadeOutFrames)) : 1
                image = Self.opacity(text, max(0, min(up, down))).composited(over: image)
            }
            image = image.cropped(to: bounds)
            if let grain = r.grain {
                guard let grained = self.grainKernel?.apply(extent: bounds, arguments: [image, grain.amount,
                    floor(request.compositionTime.seconds * grain.fps), grain.referenceHeight / Double(r.canvas.height)]) else {
                    request.finish(with: fail("Cannot initialize the lotus film grain kernel")); return
                }
                image = grained
            }
            // Explicit HLG output and a half-float linear working space avoid an SDR canvas roundtrip.
            CVBufferSetAttachment(buffer, kCVImageBufferColorPrimariesKey, kCVImageBufferColorPrimaries_ITU_R_2020, .shouldPropagate)
            CVBufferSetAttachment(buffer, kCVImageBufferTransferFunctionKey, kCVImageBufferTransferFunction_ITU_R_2100_HLG, .shouldPropagate)
            CVBufferSetAttachment(buffer, kCVImageBufferYCbCrMatrixKey, kCVImageBufferYCbCrMatrix_ITU_R_2020, .shouldPropagate)
            self.context.render(image, to: buffer, bounds: bounds, colorSpace: self.output)
            request.finish(withComposedVideoFrame: buffer)
        } }
    }
    static func opacity(_ image: CIImage, _ value: Double) -> CIImage {
        image.applyingFilter("CIColorMatrix", parameters: [
            "inputAVector": CIVector(x: 0, y: 0, z: 0, w: value)
        ])
    }
}

struct BuiltVideo {
    let recipe: Recipe; let asset: AVMutableComposition; let video: AVMutableVideoComposition; let mix: AVMutableAudioMix
    func item() -> AVPlayerItem {
        let item = AVPlayerItem(asset: asset); item.videoComposition = video; item.audioMix = mix; return item
    }
}

@MainActor func build(_ recipeURL: URL, root: URL) async throws -> BuiltVideo {
    let r = try JSONDecoder().decode(Recipe.self, from: Data(contentsOf: recipeURL))
    guard r.schema == "ghost.video.v1", r.canvas.colorSpace == "hlg2020", r.canvas.fps > 0,
          r.canvas.width > 0, r.canvas.height > 0, r.canvas.width % 2 == 0, r.canvas.height % 2 == 0,
          !r.clips.isEmpty, r.fadeInFrames >= 0, r.fadeOutFrames >= 0,
          r.clips.allSatisfy({ $0.frames > 0 && $0.startFrame >= 0 }) else { throw fail("Invalid or unsupported video recipe") }
    guard r.canvas.fit == nil || ["cover", "contain"].contains(r.canvas.fit!),
          r.fadeInCurve == nil || ["linear", "smoothstep"].contains(r.fadeInCurve!) else { throw fail("Unsupported fit or fade curve") }
    if let grain = r.grain {
        guard grain.model == "lotus-film-v1", grain.amount >= 0, grain.amount <= 1,
              grain.fps > 0, grain.referenceHeight > 0 else { throw fail("Invalid grain recipe") }
    }
    let composition = AVMutableComposition()
    guard let track = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else { throw fail("Cannot create video track") }
    var instructions: [AVVideoCompositionInstructionProtocol] = []
    var offset = 0
    for clip in r.clips {
        let asset = AVURLAsset(url: try sourceURL(clip.source, root: root, hash: clip.sha256))
        guard let source = try await asset.loadTracks(withMediaType: .video).first else { throw fail("No video in \(clip.source)") }
        let range = CMTimeRange(start: r.time(clip.startFrame), duration: r.time(clip.frames))
        let sourceRange = try await source.load(.timeRange)
        guard CMTimeCompare(range.end, sourceRange.end) <= 0 else { throw fail("Clip trim exceeds source: \(clip.source)") }
        try track.insertTimeRange(range, of: source, at: r.time(offset))
        instructions.append(Instruction(range: CMTimeRange(start: r.time(offset), duration: range.duration),
                                        trackID: track.trackID, transform: try await source.load(.preferredTransform), recipe: r, black: false, titleImage: nil))
        offset += clip.frames
    }
    if let card = r.titleCard {
        guard card.frames > 0, card.fadeInFrames >= 0, card.fadeOutFrames >= 0,
              let font = NSFont(name: card.font, size: card.fontSize) else { throw fail("Invalid title card or unavailable font") }
        let range = CMTimeRange(start: r.time(offset), duration: r.time(card.frames))
        composition.insertEmptyTimeRange(range)
        let text = NSAttributedString(string: card.text, attributes: [.font: font, .foregroundColor: NSColor.white])
        let size = text.size()
        let w = Int(ceil(size.width)) + 16, h = Int(ceil(size.height)) + 16
        let space = CGColorSpace(name: CGColorSpace.sRGB)!
        guard let cg = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: space,
                                 bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { throw fail("Cannot create title") }
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(cgContext: cg, flipped: false)
        text.draw(at: NSPoint(x: 8, y: 8))
        NSGraphicsContext.restoreGraphicsState()
        guard let cgImage = cg.makeImage() else { throw fail("Cannot render title") }
        let title = CIImage(cgImage: cgImage).transformed(by: CGAffineTransform(translationX: (Double(r.canvas.width) - Double(w)) / 2,
                                                                              y: (Double(r.canvas.height) - Double(h)) / 2))
        instructions.append(Instruction(range: range, trackID: track.trackID, transform: .identity, recipe: r, black: true, titleImage: title))
    }
    let video = AVMutableVideoComposition()
    video.customVideoCompositorClass = HDRCompositor.self
    video.renderSize = CGSize(width: r.canvas.width, height: r.canvas.height)
    video.frameDuration = r.time(1)
    video.instructions = instructions
    video.colorPrimaries = AVVideoColorPrimaries_ITU_R_2020
    video.colorTransferFunction = AVVideoTransferFunction_ITU_R_2100_HLG
    video.colorYCbCrMatrix = AVVideoYCbCrMatrix_ITU_R_2020
    let mix = AVMutableAudioMix()
    if let audio = r.audio {
        guard audio.start >= 0, audio.duration > 0, audio.fadeIn >= 0, audio.fadeOut >= 0 else { throw fail("Invalid soundtrack timing") }
        let asset = AVURLAsset(url: try sourceURL(audio.source, root: root, hash: audio.sha256))
        guard let source = try await asset.loadTracks(withMediaType: .audio).first,
              let target = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) else { throw fail("No soundtrack audio") }
        let duration = min(audio.duration, r.time(r.frames).seconds)
        try target.insertTimeRange(CMTimeRange(start: CMTime(seconds: audio.start, preferredTimescale: 48000),
                                             duration: CMTime(seconds: duration, preferredTimescale: 48000)), of: source, at: .zero)
        let params = AVMutableAudioMixInputParameters(track: target)
        // AVAudioMix volume is 0...1: support measured attenuation, preserving the source dynamics.
        let gainDB = audio.gainDB ?? 0
        guard gainDB.isFinite, gainDB <= 0 else { throw fail("Audio gain must be a finite attenuation in dB") }
        let volume = Float(pow(10, gainDB / 20))
        params.setVolume(volume, at: .zero)
        if audio.fadeIn > 0 { params.setVolumeRamp(fromStartVolume: 0, toEndVolume: volume, timeRange: CMTimeRange(start: .zero, duration: CMTime(seconds: min(duration, audio.fadeIn), preferredTimescale: 48000))) }
        if audio.fadeOut > 0 { params.setVolumeRamp(fromStartVolume: volume, toEndVolume: 0, timeRange: CMTimeRange(start: CMTime(seconds: max(0, duration - audio.fadeOut), preferredTimescale: 48000), duration: CMTime(seconds: min(duration, audio.fadeOut), preferredTimescale: 48000))) }
        mix.inputParameters = [params]
    }
    return BuiltVideo(recipe: r, asset: composition, video: video, mix: mix)
}

@MainActor final class Preview: NSObject, NSApplicationDelegate, NSWindowDelegate {
    var window: NSWindow?
    var player: AVPlayer?
    var observation: NSKeyValueObservation?
    let recipeURL: URL; let root: URL
    init(recipeURL: URL, root: URL) { self.recipeURL = recipeURL; self.root = root }
    func applicationDidFinishLaunching(_ notification: Notification) {
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 960, height: 580),
                              styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        self.window = window; window.delegate = self; window.title = "Ghost · loading preview"
        window.center(); window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        Task {
            do {
                let built = try await build(recipeURL, root: root)
                window.title = "\(built.recipe.title) · \(built.recipe.id)"
                let size = NSSize(width: 960, height: 960 * Double(built.recipe.canvas.height) / Double(built.recipe.canvas.width))
                window.setContentSize(size)
                window.contentAspectRatio = NSSize(width: built.recipe.canvas.width, height: built.recipe.canvas.height)
                let playerView = AVPlayerView()
                playerView.controlsStyle = .floating
                playerView.videoGravity = .resizeAspect
                playerView.allowsPictureInPicturePlayback = false
                let item = built.item()
                let player = AVPlayer(playerItem: item); self.player = player; playerView.player = player
                window.contentView = playerView
                observation = item.observe(\.status, options: [.new]) { item, _ in
                    if item.status == .failed { DispatchQueue.main.async { self.showError(item.error ?? fail("Playback failed")) } }
                }
                player.play()
            } catch { showError(error) }
        }
    }
    func showError(_ error: Error) {
        fputs("\(error.localizedDescription)\n", stderr)
        let alert = NSAlert(error: error); alert.runModal()
        NSApp.terminate(nil)
    }
    func windowWillClose(_ notification: Notification) { player?.pause(); NSApp.terminate(nil) }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}

@MainActor func probe(_ built: BuiltVideo, directory: URL) async throws {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let r = built.recipe
    var sampleFrames = [0, min(60, r.footageFrames - 1), r.clips[0].frames, r.footageFrames - 1]
    if let title = r.titleCard { sampleFrames += [r.footageFrames, r.footageFrames + title.frames / 2, r.frames - 1] }
    var samples: [[String: Any]] = []
    // Exercise the same native compositor as the player, including frames after all source clips end.
    for frame in Set(sampleFrames).sorted() {
        let reader = try AVAssetReader(asset: built.asset)
        let output = AVAssetReaderVideoCompositionOutput(videoTracks: built.asset.tracks(withMediaType: .video), videoSettings: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr10BiPlanarVideoRange
        ])
        output.videoComposition = built.video
        reader.add(output)
        reader.timeRange = CMTimeRange(start: r.time(frame), duration: r.time(1))
        guard reader.startReading(), let sample = output.copyNextSampleBuffer(), let buffer = CMSampleBufferGetImageBuffer(sample) else { throw reader.error ?? fail("No frame at \(frame)") }
        CVPixelBufferLockBaseAddress(buffer, .readOnly)
        let ptr = CVPixelBufferGetBaseAddressOfPlane(buffer, 0)!.assumingMemoryBound(to: UInt16.self)
        let stride = CVPixelBufferGetBytesPerRowOfPlane(buffer, 0) / 2
        var maxCode = 0; var sum: Int64 = 0
        for y in 0..<CVPixelBufferGetHeightOfPlane(buffer, 0) {
            for x in 0..<CVPixelBufferGetWidthOfPlane(buffer, 0) {
                let code = Int(ptr[y * stride + x] >> 6); maxCode = max(maxCode, code); sum += Int64(code)
            }
        }
        CVPixelBufferUnlockBaseAddress(buffer, .readOnly)
        let image = CIImage(cvPixelBuffer: buffer)
        let context = CIContext()
        let path = directory.appendingPathComponent("frame-\(frame).png")
        try context.writePNGRepresentation(of: image.transformed(by: CGAffineTransform(scaleX: 0.25, y: 0.25)), to: path, format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!)
        samples.append(["frame": frame, "max10BitLuma": maxCode, "mean10BitLuma": Double(sum) / Double(r.canvas.width * r.canvas.height), "preview": path.path])
        reader.cancelReading()
    }
    let report: [String: Any] = ["id": r.id, "frames": r.frames, "seconds": r.time(r.frames).seconds,
                               "pixelFormat": "10-bit bi-planar YUV", "colorSpace": "BT.2020 HLG", "audioTracks": built.asset.tracks(withMediaType: .audio).count,
                               "samples": samples]
    let data = try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys])
    try data.write(to: directory.appendingPathComponent("probe.json"))
    print(String(decoding: data, as: UTF8.self))
}

@main struct Main {
    @MainActor static func main() async {
        let args = CommandLine.arguments
        guard args.count >= 4 else { fputs("Usage: GhostVideo preview|probe RECIPE ROOT [OUTPUT]\n", stderr); exit(2) }
        let recipe = URL(fileURLWithPath: args[2]); let root = URL(fileURLWithPath: args[3])
        if args[1] == "preview" {
            let app = NSApplication.shared; app.setActivationPolicy(.regular)
            let delegate = Preview(recipeURL: recipe, root: root); app.delegate = delegate
            withExtendedLifetime(delegate) { app.run() }
        } else {
            do {
                guard args[1] == "probe", args.count == 5 else { throw fail("Unknown command") }
                try await probe(build(recipe, root: root), directory: URL(fileURLWithPath: args[4]))
            } catch { fputs("\(error.localizedDescription)\n", stderr); exit(1) }
        }
    }
}
