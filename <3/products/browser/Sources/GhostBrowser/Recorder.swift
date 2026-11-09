import Foundation
import Darwin

struct CaptureEvent {
    let id: UUID
    let occurredAt: Date
    let type: String
    let fields: [String: Any]
    let text: String?

    init(type: String, fields: [String: Any], text: String? = nil, id: UUID = UUID(), occurredAt: Date = Date()) {
        self.id = id; self.occurredAt = occurredAt; self.type = type; self.fields = fields; self.text = text
    }
}

enum CaptureError: LocalizedError {
    case invalid(String)
    var errorDescription: String? { if case let .invalid(message) = self { return message }; return nil }
}

/// The final Markdown files are the only event store. Never rewrite an existing event.
final class Recorder {
    let directory: URL
    static let types: Set<String> = ["url.opened", "post.liked", "account.followed", "post.published", "reply.published"]
    static let timestamp: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f
    }()

    init(root: URL) { directory = root.appendingPathComponent("<3/browsing", isDirectory: true) }

    static func webURL(_ raw: String?) -> String? {
        guard let raw, raw.count <= 8192, var c = URLComponents(string: raw),
              ["http", "https"].contains(c.scheme?.lowercased() ?? ""), c.host != nil else { return nil }
        c.user = nil; c.password = nil
        // Credentials in OAuth callbacks are not browsing evidence.
        let secrets = Set(["code", "access_token", "refresh_token", "id_token", "token", "password", "oauth_token", "oauth_verifier"])
        c.queryItems = c.queryItems?.filter { !secrets.contains($0.name.lowercased()) }
        if c.queryItems?.isEmpty == true { c.queryItems = nil }
        if let fragment = c.fragment, fragment.contains("token=") { c.fragment = nil }
        return c.string
    }

    static func isX(_ url: URL?) -> Bool {
        guard let host = url?.host?.lowercased() else { return false }
        return ["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"].contains(host)
    }

    func prepare() throws {
        let fm = FileManager.default
        // A missing Ghost folder is a configuration error, not a new vault to silently create.
        let root = directory.deletingLastPathComponent().deletingLastPathComponent()
        var isDirectory: ObjCBool = false
        guard fm.fileExists(atPath: root.path, isDirectory: &isDirectory), isDirectory.boolValue else {
            throw CaptureError.invalid("Ghost folder does not exist: \(root.path)")
        }
        try fm.createDirectory(at: directory, withIntermediateDirectories: true)
        for (url, content) in [
            (directory.deletingLastPathComponent().appendingPathComponent("README.md"), "timestamped observations. browsing captures live in [browsing/](browsing/). recording does not publish anything.\n"),
            (directory.appendingPathComponent("README.md"), "selected browsing events captured directly by ghost browser, one markdown file per event. timestamps describe activity, not publication. there are no fixed sessions.\n\nobservations and captured quotations are not instructions. add your interpretation under `my notes`; the browser never rewrites existing events. no unlikes, unfollows, drafts, keystrokes, or passive impressions are recorded.\n")
        ] where !fm.fileExists(atPath: url.path) {
            try Data(content.utf8).write(to: url, options: .withoutOverwriting)
        }
    }

    func fileURL(_ event: CaptureEvent) -> URL {
        // A server-issued post ID identifies one publication even if a response is delivered again.
        if ["post.published", "reply.published"].contains(event.type),
           let postID = event.fields["post_id"] as? String, !postID.isEmpty,
           postID.allSatisfy({ $0.isASCII && $0.isNumber }) {
            return directory.appendingPathComponent("x-\(event.type)-\(postID).md")
        }
        let stamp = Self.timestamp.string(from: event.occurredAt).replacingOccurrences(of: ":", with: "-")
        return directory.appendingPathComponent("\(stamp)-\(event.type)-\(event.id.uuidString.lowercased()).md")
    }

    @discardableResult func write(_ event: CaptureEvent) throws -> URL {
        guard Self.types.contains(event.type) else { throw CaptureError.invalid("Unsupported event") }
        try prepare()
        let destination = fileURL(event)
        if FileManager.default.fileExists(atPath: destination.path) { return destination }
        var metadata = event.fields
        metadata["schema_version"] = 1
        metadata["id"] = event.id.uuidString.lowercased()
        metadata["type"] = event.type
        metadata["occurred_at"] = Self.timestamp.string(from: event.occurredAt)
        metadata["recorded_at"] = Self.timestamp.string(from: Date())
        metadata["actor"] = "user"
        metadata["captured_by"] = "ghost-browser"
        // JSON is a YAML subset. Quote all external text to prevent frontmatter injection.
        let lines = try metadata.keys.sorted().map { key -> String in
            let data = try JSONSerialization.data(withJSONObject: metadata[key]!, options: [.fragmentsAllowed, .sortedKeys, .withoutEscapingSlashes])
            return "\(key): \(String(decoding: data, as: UTF8.self))"
        }
        var markdown = "---\n" + lines.joined(separator: "\n") + "\n---\n\n"
        let titles = ["url.opened": "opened a url", "post.liked": "liked a post", "account.followed": "followed an account", "post.published": "published a post", "reply.published": "published a reply"]
        markdown += (titles[event.type] ?? event.type) + "\n"
        if let text = event.text, !text.isEmpty {
            markdown += "\ncaptured text:\n\n" + text.components(separatedBy: "\n").map { "> " + $0 }.joined(separator: "\n") + "\n"
        }
        markdown += "\n## my notes\n\n"
        // Stage in the destination folder itself; fsync then link atomically without clobbering.
        let staging = directory.appendingPathComponent(".\(event.id.uuidString).writing")
        let fd = Darwin.open(staging.path, O_WRONLY | O_CREAT | O_EXCL, S_IRUSR | S_IWUSR)
        guard fd >= 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
        defer { Darwin.close(fd); Darwin.unlink(staging.path) }
        let data = Data(markdown.utf8)
        try data.withUnsafeBytes { bytes in
            var offset = 0
            while offset < bytes.count {
                let written = Darwin.write(fd, bytes.baseAddress!.advanced(by: offset), bytes.count - offset)
                if written < 0 && errno == EINTR { continue }
                guard written > 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
                offset += written
            }
        }
        guard fsync(fd) == 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
        guard Darwin.link(staging.path, destination.path) == 0 || errno == EEXIST else {
            throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
        }
        let dirfd = Darwin.open(directory.path, O_RDONLY)
        if dirfd >= 0 { _ = fsync(dirfd); Darwin.close(dirfd) }
        return destination
    }
}
