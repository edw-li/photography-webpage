export interface MentionToken {
  type: 'mention';
  memberId: number;
  displayName: string;
  raw: string;
}

export interface TextSegment {
  type: 'text';
  value: string;
}

export type CommentSegment = TextSegment | MentionToken;

const MENTION_RE = /@\[(\d+):([^\]]+)\]/g;

export function tokenizeComment(body: string): CommentSegment[] {
  const segments: CommentSegment[] = [];
  let lastIndex = 0;

  // Recreate the regex per call so the global flag's lastIndex starts at 0.
  const re = new RegExp(MENTION_RE.source, MENTION_RE.flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: body.slice(lastIndex, match.index) });
    }
    segments.push({
      type: 'mention',
      memberId: Number(match[1]),
      displayName: match[2],
      raw: match[0],
    });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < body.length) {
    segments.push({ type: 'text', value: body.slice(lastIndex) });
  }
  return segments;
}

/**
 * Sanitize a member's display name for inclusion in a mention token.
 * Strips `]` (which would terminate the token early) and collapses runs of
 * whitespace so the token stays on a single line.
 */
export function sanitizeMentionName(name: string): string {
  return name.replace(/\]/g, '').replace(/\s+/g, ' ').trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Convert any plain `@<Name>` substrings in `body` to `@[<id>:<Name>]` tokens
 * for storage, using the (name → memberId) mapping captured by the autocomplete.
 *
 * Replacement rules:
 *  - The `@` must be at start-of-string or follow whitespace.
 *  - The `Name` immediately follows `@`, with no leading space.
 *  - The character after `Name` must NOT be a word character (so `@Edward` in
 *    "@EdwardLi" doesn't accidentally match a known "@Edward").
 *  - Longer names are tried first so that "@Edward Li" wins over "@Edward".
 *  - Names already wrapped in `@[id:Name]` tokens are left alone.
 */
export function buildBodyForSubmit(
  body: string,
  mentions: ReadonlyMap<string, number>,
): string {
  if (mentions.size === 0) return body;
  const names = [...mentions.keys()].sort((a, b) => b.length - a.length);
  let result = body;
  for (const name of names) {
    const memberId = mentions.get(name)!;
    const re = new RegExp(`(^|\\s)@${escapeRegex(name)}(?!\\w)`, 'g');
    result = result.replace(re, `$1@[${memberId}:${name}]`);
  }
  return result;
}
