#!/usr/bin/env python3
"""Native video checkpoints and append-only process conversations. No third-party Python packages."""
import argparse
import contextlib
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import shutil
import subprocess
import sys
import tempfile

TOOL = Path(__file__).resolve().parent
ROOT = TOOL.parent.parent
WORKING = "<!-- ghost-working-conversation -->"
CURSOR = re.compile(r"<!-- ghost-process-cursors: (\{[^\n]*\}) -->")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def inside(path):
    legacy = {"assets/": "<3/assets/", "ghost-tools/": "tools/", "expression/videos/": "<3/videos/"}
    if not (ROOT / path).exists():
        for previous, current in legacy.items():
            if str(path).startswith(previous):
                path = current + str(path)[len(previous):]
                break
    result = (ROOT / path).resolve()
    if not result.is_relative_to(ROOT):
        raise ValueError("Path must be inside Ghost")
    return result


def relative(path):
    return str(path.resolve().relative_to(ROOT))


def resolve_source(source):
    """Resolve an old location without changing its immutable recipe or fingerprint."""
    original = inside(source["source"])
    if original.exists():
        path = original
    else:
        registry = TOOL / "asset-relocations.json"
        redirects = json.loads(registry.read_text()) if registry.exists() else {}
        redirect = redirects.get(source["source"])
        if not redirect or redirect["sha256"] != source["sha256"]:
            raise ValueError("Missing source: " + source["source"])
        path = inside(redirect["path"])
        if not path.is_relative_to(ROOT / "<3/assets"):
            raise ValueError("Relocated media must be in <3/assets/")
    if digest(path.read_bytes()) != source["sha256"]:
        raise ValueError("Source changed: " + source["source"])
    return path


def move_asset(source):
    """Move one explicitly selected local media file, recording its original identity."""
    source = inside(source)
    assets = ROOT / "<3/assets"
    assets.mkdir(exist_ok=True)
    if source.is_relative_to(assets):
        return source
    if source.suffix.lower() not in {".mov", ".mp4", ".m4v", ".webm", ".wav", ".mp3", ".m4a", ".aac", ".aif", ".aiff", ".flac", ".ogg", ".png", ".jpg", ".jpeg", ".heic", ".webp", ".gif"}:
        raise ValueError("Select a media file to move")
    old_path = relative(source)
    fingerprint = digest(source.read_bytes())
    destination = assets / source.name
    if destination.exists() and digest(destination.read_bytes()) != fingerprint:
        destination = assets / (source.stem + "-" + fingerprint[:12] + source.suffix)
    if destination.exists() and digest(destination.read_bytes()) != fingerprint:
        raise ValueError("Asset destination collision")
    registry = TOOL / "asset-relocations.json"
    with doc_lock(registry):
        redirects = json.loads(registry.read_text()) if registry.exists() else {}
        redirect = dict(path=relative(destination), sha256=fingerprint)
        if old_path in redirects and redirects[old_path] != redirect:
            raise ValueError("Historical source path already identifies different media")
        if destination.exists():
            source.unlink()  # Identical bytes already exist at the destination.
        else:
            source.rename(destination)
        redirects[old_path] = redirect
        registry.write_text(json.dumps(redirects, indent=2, sort_keys=True) + "\n")
    return destination


def video_doc(doc):
    if not doc.resolve().is_relative_to(ROOT / "<3/videos"):
        raise ValueError("Move the video document and its artifact folder into <3/videos/ first")


def atomic_update(path, before, after):
    if path.read_text() != before:
        raise ValueError("Document changed while recording. Retry; no changes were overwritten.")
    with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False) as f:
        f.write(after)
        temporary = Path(f.name)
    temporary.chmod(path.stat().st_mode & 0o777)
    try:
        if path.read_text() != before:
            raise ValueError("Document changed while recording. Retry.")
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


@contextlib.contextmanager
def doc_lock(doc):
    directory = ROOT / ".ghost/video-process/locks"
    directory.mkdir(parents=True, exist_ok=True)
    with (directory / digest(str(doc).encode())).open("w") as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        yield


def initialize(doc):
    video_doc(doc)
    before = doc.read_text()
    if CURSOR.search(before):
        return
    if WORKING in before or "<!-- ghost-artifact:" in before:
        raise ValueError("Process metadata was removed; refusing to reconstruct/redact over the document.")
    atomic_update(doc, before, before.rstrip() + "\n\n---\n\n## Process\n\n"
                  "> π: This is the selected video discussion and artifact history. Edit or redact it here. "
                  "Historical proposals are preserved as discussion, not as approved decisions.\n\n"
                  "<!-- ghost-process-cursors: {} -->\n\n" + WORKING + "\n")


def session_messages(session):
    model = None
    thread = None
    last_line = 0
    messages = []
    for line_number, raw in enumerate(session.read_text().splitlines(), 1):
        try:
            row = json.loads(raw)
        except json.JSONDecodeError:
            break  # The recorder may be in the middle of writing its last line.
        last_line = line_number
        payload = row.get("payload", {})
        if row.get("type") == "session_meta":
            thread = payload["id"]
        if row.get("type") == "turn_context":
            model = payload.get("model")
        if row.get("type") != "response_item" or payload.get("type") != "message":
            continue
        role = payload.get("role")
        if role not in ("user", "assistant") or payload.get("channel") in ("analysis", "summary"):
            continue
        body = "\n".join(part.get("text", "") for part in payload.get("content", [])
                         if part.get("type") in ("input_text", "output_text"))
        if not body.strip():
            continue
        # Local session records also contain injected instructions as user messages.
        if body.startswith(("# AGENTS.md instructions for ", "<environment_context>", "<external_codex_apps_open_page>")):
            continue
        if body.startswith("<send_user_message_question_reply>"):
            replies = json.loads(body.split("\n", 1)[1].rsplit("</", 1)[0].strip())
            body = "\n\n".join(f"In response to: {reply['question']}\n\n{reply['answer']}" for reply in replies)
        messages.append(dict(line=line_number, role=role, text=body, timestamp=row.get("timestamp", "unavailable"), model=model))
    if not thread:
        raise ValueError("No session ID in source record")
    return thread, last_line, messages


def sync(doc, session):
    """Legacy plugin compatibility: never indiscriminately copy a conversation."""
    return 0


def record(doc, session, selection):
    """Append only explicitly reviewed messages/excerpts; remember all reviewed lines."""
    video_doc(doc)
    thread, last_line, messages = session_messages(session)
    through = selection["through"]
    if not isinstance(through, int) or not 0 <= through <= last_line:
        raise ValueError("Invalid reviewed-through source line")
    by_line = {m["line"]: m for m in messages}
    chosen = []
    seen = set()
    for item in selection["messages"]:
        line = item["line"]
        if line not in by_line or line > through or line in seen:
            raise ValueError("Selection must contain unique visible message lines within the reviewed range")
        seen.add(line)
        message = dict(by_line[line])
        if "excerpt" in item:
            excerpt = item["excerpt"]
            if not isinstance(excerpt, str) or not excerpt.strip() or excerpt not in message["text"]:
                raise ValueError("Excerpt must be an exact nonempty substring of the original message")
            message["text"] = excerpt
            message["excerpt"] = True
        chosen.append(message)
    with doc_lock(doc):
        before = doc.read_text()
        match = CURSOR.search(before)
        if not match or WORKING not in before:
            raise ValueError("Process markers missing; refusing to restore deleted content. Initialize explicitly if this is a new document.")
        cursors = json.loads(match.group(1))
        cursor = cursors.get(thread, 0)
        if last_line < cursor:
            raise ValueError("Source history is shorter than the saved cursor; refusing to replay it.")
        if through < cursor:
            return 0
        added = sorted((m for m in chosen if m["line"] > cursor), key=lambda m: m["line"])
        blocks = []
        for m in added:
            meta = f"*{m['timestamp']} · source `{thread}:{m['line']}`*"
            if m.get("excerpt"):
                meta += "\n\n*Video-relevant excerpt; full message retained in the source chat.*"
            if m["role"] == "assistant":
                meta += f"\n\nModel: `{m['model']}` (turn configuration; generating backend version unconfirmed)." if m["model"] else "\n\nModel: unknown (not exposed by source)."
                meta += " Provider: OpenAI."
            blocks.append(f"\n\n### {m['role'].capitalize()}\n\n{meta}\n\n{m['text']}")
        cursors[thread] = through
        after = before[:match.start()] + "<!-- ghost-process-cursors: " + json.dumps(cursors, sort_keys=True) + " -->" + before[match.end():]
        after = after.rstrip() + "".join(blocks) + "\n"
        if after != before:
            atomic_update(doc, before, after)
    return len(added)


def pending(doc, session):
    thread, last_line, messages = session_messages(session)
    match = CURSOR.search(doc.read_text())
    if not match:
        raise ValueError("Process markers missing")
    cursor = json.loads(match.group(1)).get(thread, 0)
    if last_line < cursor:
        raise ValueError("Source history is shorter than the saved cursor")
    return dict(through=last_line, messages=[m for m in messages if m["line"] > cursor])


def freeze(spec_path, parent):
    spec = json.loads(spec_path.read_text())
    if spec.get("schema") != "ghost.video.v1":
        raise ValueError("Unsupported recipe schema")
    if parent:
        parent_path = inside(parent)
        verify(parent_path)
        spec["parent"] = json.loads(parent_path.read_text())["id"]
    else:
        spec["parent"] = None
    for source in spec["clips"] + ([spec["audio"]] if spec.get("audio") else []):
        path = resolve_source(source) if source.get("sha256") else inside(source["source"])
        if not path.is_relative_to(ROOT / "<3/assets"):
            raise ValueError("Move all referenced source media into <3/assets/ before checkpointing")
        source["source"] = relative(path)
        source["sha256"] = digest(path.read_bytes())
    renderer = (TOOL / "Renderer.swift").read_bytes()
    renderer_hash = digest(renderer)
    archive = TOOL / "engines" / (renderer_hash + ".swift")
    archive.parent.mkdir(exist_ok=True)
    if archive.exists() and archive.read_bytes() != renderer:
        raise ValueError("Renderer archive hash collision")
    if not archive.exists():
        archive.write_bytes(renderer)
    spec["renderer"] = {"source": relative(archive), "sha256": renderer_hash}
    # System libraries/fonts remain OS dependencies, recorded rather than falsely promised bit-identical.
    spec["environment"] = {"macOS": subprocess.check_output(["sw_vers", "-productVersion"], text=True).strip(),
                           "architecture": os.uname().machine}
    spec.pop("id", None)
    spec["id"] = digest(json.dumps(spec, sort_keys=True, separators=(",", ":")).encode())[:20]
    return spec


def verify(recipe_path):
    r = json.loads(recipe_path.read_text())
    content = dict(r)
    artifact_id = content.pop("id")
    if artifact_id != digest(json.dumps(content, sort_keys=True, separators=(",", ":")).encode())[:20]:
        raise ValueError("Artifact recipe was modified; create a new checkpoint instead")
    source = inside(r["renderer"]["source"])
    if digest(source.read_bytes()) != r["renderer"]["sha256"]:
        raise ValueError("Archived renderer was modified")
    for clip in r["clips"] + ([r["audio"]] if r.get("audio") else []):
        resolve_source(clip)
    return r


def runtime_recipe(recipe_path):
    r = verify(recipe_path)
    for source in r["clips"] + ([r["audio"]] if r.get("audio") else []):
        source["source"] = relative(resolve_source(source))
    data = json.dumps(r, ensure_ascii=False, indent=2) + "\n"
    folder = ROOT / ".ghost/video-process/runtime" / r["id"]
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / (digest(data.encode()) + ".json")
    if not path.exists():
        path.write_text(data)
    return path


def checkpoint(doc, spec_path, summary, parent):
    video_doc(doc)
    if "\n" in summary:
        raise ValueError("Checkpoint summary must be one line")
    r = freeze(spec_path, parent)
    folder = doc.parent / (doc.stem + ".artifacts")
    folder.mkdir(exist_ok=True)
    path = folder / (r["id"] + ".json")
    serialized = json.dumps(r, ensure_ascii=False, indent=2) + "\n"
    if path.exists() and path.read_text() != serialized:
        raise ValueError("Artifact ID collision")
    if not path.exists():
        path.write_text(serialized)
    with doc_lock(doc):
        before = doc.read_text()
        if f"<!-- ghost-artifact: {r['id']} -->" in before:
            return path
        if before.count(WORKING) != 1:
            raise ValueError("Expected one working conversation marker")
        prefix, conversation = before.split(WORKING)
        folded = f"> [!note]- π: {summary}\n" + "\n".join("> " + line if line else ">" for line in conversation.strip().splitlines())
        block = f"\n\n<!-- ghost-artifact: {r['id']} -->\n\n```ghost-video\n{relative(path)}\n```\n"
        notes = "".join("\n> π: " + note.replace("\n", "\n> ") + "\n" for note in r.get("notes", []))
        atomic_update(doc, before, prefix + folded + block + notes + "\n" + WORKING + "\n")
    return path


def binary(recipe_path):
    r = verify(recipe_path)
    folder = ROOT / ".ghost/video-process/bin" / r["renderer"]["sha256"]
    folder.mkdir(parents=True, exist_ok=True)
    bundle = folder / "Ghost Video.app"
    executable = bundle / "Contents/MacOS/GhostVideo"
    with (folder / ".build.lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if not executable.exists():
            executable.parent.mkdir(parents=True, exist_ok=True)
            result = subprocess.run(["swiftc", "-swift-version", "5", "-parse-as-library", "-O", "-module-cache-path", str(ROOT / ".ghost/video-process/module-cache"),
                                     str(inside(r["renderer"]["source"])), "-o", str(executable)], capture_output=True, text=True)
            (folder / "build.log").write_text(result.stdout + result.stderr)
            if result.returncode:
                raise ValueError("Native renderer build failed: " + result.stderr[-4000:])
            (bundle / "Contents/Info.plist").write_bytes(plistlib.dumps({
                "CFBundleName": "Ghost Video", "CFBundleDisplayName": "Ghost Video",
                "CFBundleIdentifier": "local.ghost.video", "CFBundleExecutable": "GhostVideo",
                "CFBundlePackageType": "APPL", "CFBundleShortVersionString": "0.1.0",
                "NSHighResolutionCapable": True, "NSPrincipalClass": "NSApplication",
                "LSMinimumSystemVersion": "14.0"
            }))
            subprocess.run(["codesign", "--force", "--sign", "-", str(bundle)], check=True, capture_output=True)
    return executable


def register(doc, session):
    """Install/update our local plugin and register one explicit session; never scan unrelated chats."""
    session = session.resolve()
    session_messages(session)
    initialize(doc)
    destination = ROOT / ".obsidian/plugins/ghost-video-process"
    destination.mkdir(parents=True, exist_ok=True)
    for name in ("main.js", "manifest.json", "styles.css"):
        shutil.copy2(TOOL / "obsidian" / name, destination / name)
    settings_path = destination / "data.json"
    settings = json.loads(settings_path.read_text()) if settings_path.exists() else {}
    settings["recordings"] = []  # Disable legacy blanket capture, including already-loaded plugins.
    recordings = settings.setdefault("processes", [])
    entry = {"doc": relative(doc), "session": str(session)}
    if entry not in recordings:
        recordings.append(entry)
    settings_path.write_text(json.dumps(settings, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("init"); p.add_argument("doc")
    p = sub.add_parser("sync"); p.add_argument("doc"); p.add_argument("session", type=Path)
    p = sub.add_parser("record"); p.add_argument("doc"); p.add_argument("session", type=Path); p.add_argument("--selection", required=True, type=Path)
    p = sub.add_parser("pending"); p.add_argument("doc"); p.add_argument("session", type=Path)
    p = sub.add_parser("move-asset"); p.add_argument("source")
    p = sub.add_parser("register"); p.add_argument("doc"); p.add_argument("session", type=Path)
    p = sub.add_parser("checkpoint"); p.add_argument("doc"); p.add_argument("spec"); p.add_argument("--summary", required=True); p.add_argument("--parent")
    for mode in ("verify", "build", "preview", "probe"):
        p = sub.add_parser(mode); p.add_argument("recipe")
        if mode == "probe": p.add_argument("output")
    args = parser.parse_args()
    try:
        if args.command == "init": initialize(inside(args.doc))
        elif args.command == "register": register(inside(args.doc), args.session)
        elif args.command == "sync":
            count = sync(inside(args.doc), args.session)
            if count: print(f"Appended {count} messages")
        elif args.command == "record": print(f"Recorded {record(inside(args.doc), args.session, json.loads(args.selection.read_text()))} selected messages")
        elif args.command == "pending": print(json.dumps(pending(inside(args.doc), args.session), ensure_ascii=False, indent=2))
        elif args.command == "move-asset": print(relative(move_asset(args.source)))
        elif args.command == "checkpoint": print(relative(checkpoint(inside(args.doc), inside(args.spec), args.summary, args.parent)))
        elif args.command == "verify": print(verify(inside(args.recipe))["id"])
        else:
            recipe = inside(args.recipe)
            exe = binary(recipe)
            if args.command == "build": print(exe)
            else:
                command = [str(exe), args.command, str(runtime_recipe(recipe)), str(ROOT)]
                if args.command == "probe": command.append(str(inside(args.output)))
                os.execv(exe, command)
    except (ValueError, OSError, KeyError, json.JSONDecodeError) as error:
        print(str(error), file=sys.stderr); sys.exit(1)


if __name__ == "__main__":
    main()
