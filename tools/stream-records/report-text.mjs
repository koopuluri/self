export function reportText(report, seen) {
  const closed = report.closed.filter(t => !seen[t.closureId]);
  const singleLine = value => value.replace(/\s+/g, ' ').trim();
  const lines = report.open.map((t,i) => `${i + 1}. ${singleLine(t.title)} (${singleLine(t.action)})`);
  if (closed.length) lines.push((lines.length ? '\n' : '') + 'completed and closed', ...closed.map(t => `- ${singleLine(t.title)}`));
  return { text: lines.join('\n') || 'nothing open or newly closed.', closed };
}
