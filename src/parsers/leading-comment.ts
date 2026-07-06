/** Scan '#' comment lines before the first content line for a schema reference. */
export function leadingCommentRef(text: string, pattern: RegExp): string | null {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    if (!trimmed.startsWith("#")) break;
    const match = pattern.exec(trimmed);
    if (match) return match[1] ?? null;
  }
  return null;
}
