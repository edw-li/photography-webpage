"""Parse @mention tokens out of comment bodies.

Tokens are stored inline using the format `@[<member_id>:<display name>]`.
The frontend `MentionAutocomplete` is responsible for inserting tokens; this
module both extracts member IDs (for notification fan-out) and converts
tokens to display form (for notification previews and other surfaces that
shouldn't show raw token markup).
"""

import re

# member_id is a positive integer (matches members.id PK).
# Display name is any sequence of characters except `]` (which terminates).
# The frontend escapes `]` from member names before insertion.
_MENTION_RE_PARSE = re.compile(r"@\[(\d+):[^\]]+\]")
_MENTION_RE_DISPLAY = re.compile(r"@\[\d+:([^\]]+)\]")


def parse_mentions(body: str) -> list[int]:
    """Return de-duplicated, in-order member IDs mentioned in `body`.

    Returns:
        List of positive integer member IDs in the order they first appear in
        `body`. Duplicates and non-positive IDs are excluded.
    """
    seen: set[int] = set()
    ordered: list[int] = []
    for match in _MENTION_RE_PARSE.finditer(body):
        try:
            member_id = int(match.group(1))
        except ValueError:
            # _MENTION_RE_PARSE only matches \d+ so this branch is theoretical
            # but cheap to guard against future regex tweaks.
            continue
        if member_id <= 0 or member_id in seen:
            continue
        seen.add(member_id)
        ordered.append(member_id)
    return ordered


def format_body_preview(body: str, max_len: int = 140) -> str:
    """Strip mention tokens to display form (`@<name>`) and truncate.

    Used when building the `bodyPreview` field on notifications so recipients
    see "@Jane Doe" rather than the raw "@[42:Jane Doe]" token.
    """
    cleaned = _MENTION_RE_DISPLAY.sub(lambda m: f"@{m.group(1)}", body)
    return cleaned[:max_len]
