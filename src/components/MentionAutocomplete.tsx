import { useEffect, useMemo, useRef, useState } from 'react';
import { getMembers } from '../api/members';
import type { Member } from '../types/members';
import { sanitizeMentionName } from '../utils/parseMentions';
import './MentionAutocomplete.css';

interface MentionAutocompleteProps {
  value: string;
  cursor: number;
  onInsert: (newValue: string, newCursor: number) => void;
  anchorRef: React.RefObject<HTMLTextAreaElement | null>;
}

interface ActiveTrigger {
  start: number; // index of '@' in `value`
  query: string; // text after '@' up to cursor
}

const MAX_QUERY_LEN = 30;

/**
 * Walk back from `cursor` looking for a `@` that:
 *  - sits at start-of-string OR is preceded by whitespace, AND
 *  - is followed only by query-safe chars up to the cursor (no whitespace,
 *    brackets, or token-bounding punctuation).
 *
 * Returning null means "no autocomplete should be open right now."
 */
function detectTrigger(value: string, cursor: number): ActiveTrigger | null {
  let i = cursor - 1;
  while (i >= 0) {
    const ch = value[i];
    if (ch === '@') {
      if (i === 0 || /\s/.test(value[i - 1])) {
        const query = value.slice(i + 1, cursor);
        // Defense in depth: explicit stop chars below should already prevent
        // these, but reject anyway in case detection runs over an existing
        // token region (e.g. cursor moved inside `@[42:Jane Doe]`).
        if (/[\s\n[\]]/.test(query)) return null;
        if (query.length > MAX_QUERY_LEN) return null;
        return { start: i, query };
      }
      return null;
    }
    // Stop chars: whitespace, or characters that would mean we're walking
    // through an existing token (e.g. `[` or `]` inside `@[42:Name]`).
    if (/[\s[\]]/.test(ch)) return null;
    i -= 1;
  }
  return null;
}

export default function MentionAutocomplete({
  value,
  cursor,
  onInsert,
  anchorRef,
}: MentionAutocompleteProps) {
  const trigger = useMemo(() => detectTrigger(value, cursor), [value, cursor]);
  const [results, setResults] = useState<Member[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const reqIdRef = useRef(0);

  // Fetch members when the trigger is active and its query changes.
  useEffect(() => {
    if (!trigger) {
      setResults([]);
      return;
    }
    const reqId = ++reqIdRef.current;
    const timer = setTimeout(() => {
      getMembers({ search: trigger.query, pageSize: 8 })
        .then((res) => {
          // Guard against out-of-order responses overwriting fresh ones.
          if (reqId !== reqIdRef.current) return;
          setResults(res.items);
          setActiveIdx(0);
        })
        .catch(() => {
          if (reqId !== reqIdRef.current) return;
          setResults([]);
        });
    }, 120);
    return () => clearTimeout(timer);
    // We only re-fetch when the query string itself changes; cursor movement
    // alone should not refire the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger?.query]);

  // Close the dropdown when the textarea loses focus (clicked outside, Tabbed
  // out). Item clicks are protected by onMouseDown.preventDefault so they
  // don't blur the textarea, so a real blur means "user is no longer in the
  // composer."
  useEffect(() => {
    if (!trigger) return;
    const el = anchorRef.current;
    if (!el) return;
    const onBlur = () => {
      setResults([]);
    };
    el.addEventListener('blur', onBlur);
    return () => el.removeEventListener('blur', onBlur);
  }, [trigger, anchorRef]);

  // Keyboard navigation while the dropdown is open.
  useEffect(() => {
    if (!trigger || results.length === 0) return;
    const el = anchorRef.current;
    if (!el) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => (i + 1) % results.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => (i - 1 + results.length) % results.length);
      } else if (e.key === 'Tab' || (e.key === 'Enter' && !e.metaKey && !e.ctrlKey)) {
        // Tab and plain Enter pick the highlighted member. Cmd/Ctrl+Enter
        // is left to bubble up so the user can still submit even when the
        // dropdown is open.
        e.preventDefault();
        e.stopPropagation();
        insertMember(results[activeIdx]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setResults([]);
      }
    };
    el.addEventListener('keydown', handler);
    return () => el.removeEventListener('keydown', handler);
    // insertMember closes over `trigger`, `value`, `cursor`, `onInsert`; the
    // effect re-binds whenever any of those (or the result set) change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger, results, activeIdx, anchorRef]);

  const insertMember = (member: Member) => {
    if (!trigger || member.id == null) return;
    const safeName = sanitizeMentionName(member.name) || `Member ${member.id}`;
    const token = `@[${member.id}:${safeName}] `;
    const before = value.slice(0, trigger.start);
    const after = value.slice(cursor);
    const newValue = before + token + after;
    const newCursor = (before + token).length;
    onInsert(newValue, newCursor);
  };

  if (!trigger || results.length === 0) return null;

  return (
    <ul
      className="mention-autocomplete"
      role="listbox"
      aria-label="Mention suggestions"
      onMouseDown={(e) => {
        // Catch clicks in the gap between items (padding) so they don't
        // blur the textarea and dismiss the dropdown before the user picks.
        e.preventDefault();
      }}
    >
      {results.map((m, i) => (
        <li
          key={m.id ?? `${m.name}-${i}`}
          role="option"
          aria-selected={i === activeIdx}
          className={`mention-autocomplete__item${
            i === activeIdx ? ' mention-autocomplete__item--active' : ''
          }`}
          onMouseDown={(e) => {
            // Prevent textarea blur so focus + cursor stay put for caret restoration.
            e.preventDefault();
            insertMember(m);
          }}
        >
          <span className="mention-autocomplete__name">{m.name}</span>
          {m.specialty && (
            <span className="mention-autocomplete__specialty">{m.specialty}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
