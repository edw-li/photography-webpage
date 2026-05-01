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
