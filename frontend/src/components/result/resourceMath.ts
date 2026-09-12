export interface ExcerptPart { text: string; math: boolean }

/** Formula source counts toward the 200-character budget; never split a formula. */
export function resourceMathExcerpt(raw: string): ExcerptPart[] {
  const text = raw.replace(/\r\n?/g, '\n').trim();
  const budget = Array.from(text).length > 200 ? 199 : 200;
  const parts: ExcerptPart[] = [];
  let used = 0;
  let cursor = 0;
  let truncated = false;
  const opening = /\\begin\{([a-zA-Z*]+)\}|\\\[|\\\(|\$\$|(?<!\\)\$/g;
  function append(value: string, math: boolean): boolean {
    const chars = Array.from(value);
    const remaining = budget - used;
    if (chars.length > remaining) {
      if (!math && remaining > 0) parts.push({ text: chars.slice(0, remaining).join(''), math: false });
      truncated = true;
      return false;
    }
    parts.push({ text: value, math });
    used += chars.length;
    return true;
  }
  while (cursor < text.length) {
    opening.lastIndex = cursor;
    const match = opening.exec(text);
    if (!match) { append(text.slice(cursor), false); break; }
    if (!append(text.slice(cursor, match.index), false)) break;
    const left = match[0];
    const right = match[1] ? `\\end{${match[1]}}` : left === '\\[' ? '\\]' : left === '\\(' ? '\\)' : left;
    let end = text.indexOf(right, opening.lastIndex);
    while (end >= 0 && right.startsWith('$') && text[end - 1] === '\\') end = text.indexOf(right, end + right.length);
    if (end < 0) {
      // A lone currency sign is prose; an unfinished TeX environment is not renderable.
      if (left === '$') { append(text.slice(match.index), false); }
      else { truncated = true; }
      break;
    }
    const source = text.slice(match.index, end + right.length);
    if (!append(source, true)) break;
    const last = parts[parts.length - 1];
    if (!match[1]) last.text = text.slice(opening.lastIndex, end);
    cursor = end + right.length;
  }
  if (truncated) parts.push({ text: '…', math: false });
  return parts;
}
