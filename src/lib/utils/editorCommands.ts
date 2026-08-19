export function applyInlineCommand(content: string, start: number, end: number, prefix: string, suffix = prefix) {
  const selected = content.slice(start, end);
  const replacement = selected ? `${prefix}${selected}${suffix}` : `${prefix}${suffix}`;
  const next = content.slice(0, start) + replacement + content.slice(end);
  const cursor = selected ? start + replacement.length : start + prefix.length;
  return { content: next, cursor };
}

export function applyLinePrefixCommand(content: string, cursor: number, prefix: string) {
  const lineStart = content.lastIndexOf("\n", cursor - 1) + 1;
  return {
    content: content.slice(0, lineStart) + prefix + content.slice(lineStart),
    cursor: cursor + prefix.length,
  };
}

export function insertSlashCommand(content: string, cursor: number, prefix: string) {
  const lineStart = content.lastIndexOf("\n", cursor - 1) + 1;
  const line = content.slice(lineStart, cursor);
  const slashIndex = line.lastIndexOf("/");
  if (slashIndex < 0) return null;
  const replaceStart = lineStart + slashIndex;
  return {
    content: content.slice(0, replaceStart) + prefix + content.slice(cursor),
    cursor: replaceStart + prefix.length,
  };
}
