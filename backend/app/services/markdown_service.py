"""Shared markdown → bleached-HTML rendering for newsletters and announcements."""

import bleach
import markdown


# Permissive set used for newsletters (long-form content with headings, images, tables).
NEWSLETTER_ALLOWED_TAGS = [
    "p", "h1", "h2", "h3", "h4", "h5", "h6",
    "a", "strong", "em", "ul", "ol", "li", "br", "img",
    "blockquote", "code", "pre", "hr",
    "table", "thead", "tbody", "tr", "th", "td",
]
NEWSLETTER_ALLOWED_ATTRS: dict[str, list[str]] = {
    "a": ["href", "title", "target", "rel"],
    "img": ["src", "alt", "title", "width", "height"],
    "th": ["align"],
    "td": ["align"],
}

# Restricted set for announcement banners — short, inline-only content. No images,
# no headings, no tables — the banner UI is a single line that should stay visually
# consistent regardless of admin input.
ANNOUNCEMENT_ALLOWED_TAGS = [
    "p", "a", "strong", "em", "br", "code", "ul", "ol", "li",
]
ANNOUNCEMENT_ALLOWED_ATTRS: dict[str, list[str]] = {
    "a": ["href", "title", "rel"],
}


def render_markdown(
    body_md: str,
    *,
    allowed_tags: list[str] | None = None,
    allowed_attrs: dict[str, list[str]] | None = None,
) -> str:
    """Render a markdown string to bleached HTML.

    Defaults to the permissive newsletter tag/attr set. Pass
    ANNOUNCEMENT_ALLOWED_TAGS / ANNOUNCEMENT_ALLOWED_ATTRS for the
    restricted banner pipeline.
    """
    raw_html = markdown.markdown(body_md, extensions=["extra"])
    return bleach.clean(
        raw_html,
        tags=allowed_tags if allowed_tags is not None else NEWSLETTER_ALLOWED_TAGS,
        attributes=allowed_attrs if allowed_attrs is not None else NEWSLETTER_ALLOWED_ATTRS,
        strip=True,
    )
