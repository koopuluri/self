// The closest viewport that contains the frame. If the frame is taller than
// the screen, expose as much as fits without scrolling past text already shown.
export function revealDelta(top: number, bottom: number, screenTop: number, screenBottom: number, writingRoom = 0) {
  if (writingRoom > 0) {
    bottom += writingRoom;
    // If both ends cannot fit, keep the end of the reply and the caret.
    if (bottom - top > screenBottom - screenTop) return bottom - screenBottom;
  }
  const a = top - screenTop, b = bottom - screenBottom;
  return a > 0 && b > 0 ? Math.min(a, b) : a < 0 && b < 0 ? Math.max(a, b) : 0;
}

// Preserve CodeMirror's measured blocks outside the edit (including when a
// receipt is inserted in the middle of the stream, not just at its tail).
export function snapshotEdit(before: string, after: string) {
  let from = 0, to = before.length, end = after.length;
  while (from < to && from < end && before.charCodeAt(from) === after.charCodeAt(from)) from++;
  while (to > from && end > from && before.charCodeAt(to - 1) === after.charCodeAt(end - 1)) { to--; end--; }
  return { from, to, insert: after.slice(from, end) };
}
