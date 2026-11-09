import XCTest
@testable import GhostBrowser

final class RecorderTests: XCTestCase {
    func temporaryRoot() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        return url
    }
    func testRetryPreservesAnnotationsAndDoesNotDuplicate() throws {
        let recorder = Recorder(root: try temporaryRoot())
        let event = CaptureEvent(type: "post.liked", fields: ["url": "https://x.com/sam/status/123"], text: "hello\n---\nmalicious: content")
        let file = try recorder.write(event)
        let original = try String(contentsOf: file, encoding: .utf8)
        try (original + "my own annotation\n").write(to: file, atomically: true, encoding: .utf8)
        XCTAssertEqual(try recorder.write(event), file)
        XCTAssertTrue(try String(contentsOf: file, encoding: .utf8).hasSuffix("my own annotation\n"))
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: recorder.directory.path).filter { $0.contains(event.id.uuidString.lowercased()) }.count, 1)
        XCTAssertTrue(original.contains("> ---\n> malicious: content"))
    }
    func testInvalidTypesAndUnavailableRootFail() throws {
        let recorder = Recorder(root: try temporaryRoot())
        XCTAssertThrowsError(try recorder.write(CaptureEvent(type: "post.unliked", fields: [:])))
        let missing = Recorder(root: recorder.directory.appendingPathComponent("does-not-exist"))
        XCTAssertThrowsError(try missing.prepare())
    }
    func testPublicationResponseReplayKeepsOneFile() throws {
        let recorder = Recorder(root: try temporaryRoot())
        let original = CaptureEvent(type: "post.published", fields: ["post_id": "123"], text: "first")
        let replay = CaptureEvent(type: "post.published", fields: ["post_id": "123"], text: "replayed")
        XCTAssertEqual(try recorder.write(original), try recorder.write(replay))
        XCTAssertTrue(try String(contentsOf: recorder.fileURL(original), encoding: .utf8).contains("> first"))
    }
    func testBlockedDestinationFailsWithoutPretendingToSave() throws {
        let root = try temporaryRoot()
        try Data("blocking file".utf8).write(to: root.appendingPathComponent("<3"))
        XCTAssertThrowsError(try Recorder(root: root).write(CaptureEvent(type: "url.opened", fields: [:])))
    }
    func testURLValidationAndCredentialRemoval() {
        XCTAssertNil(Recorder.webURL("javascript:alert(1)"))
        XCTAssertNil(Recorder.webURL("file:///etc/passwd"))
        XCTAssertEqual(Recorder.webURL("https://user:secret@x.com/callback?code=secret&state=ok"), "https://x.com/callback?state=ok")
        XCTAssertFalse(Recorder.isX(URL(string: "https://x.com.attacker.test")))
        XCTAssertTrue(Recorder.isX(URL(string: "https://x.com/home")))
    }
    func testClockAndProvenanceAndUnicode() throws {
        let recorder = Recorder(root: try temporaryRoot())
        let event = CaptureEvent(type: "reply.published", fields: ["reply_to_post_id": "123", "author": ["handle": "me"]], text: "hello 👻\nこんにちは", occurredAt: Date(timeIntervalSince1970: 1000))
        let content = try String(contentsOf: recorder.write(event), encoding: .utf8)
        XCTAssertTrue(content.contains("1970-01-01T00:16:40.000Z"))
        XCTAssertTrue(content.contains("recorded_at:"))
        XCTAssertTrue(content.contains("actor: \"user\""))
        XCTAssertTrue(content.contains("hello 👻"))
        XCTAssertFalse(try FileManager.default.contentsOfDirectory(atPath: recorder.directory.path).contains { $0.hasSuffix(".writing") })
    }
}
