"""Tests for the email-side image post-processor in email_service.

Run with `pytest backend/tests/test_email_image_postprocess.py` if pytest is
installed, or directly via `python backend/tests/test_email_image_postprocess.py`.
"""

import os
import sys
from pathlib import Path

# Ensure the backend root is on sys.path so `app.*` imports work whether
# this is run from the repo root or backend/.
BACKEND_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_ROOT))

# Provide minimum env so config validation passes when the module is imported.
os.environ.setdefault("FRONTEND_URL", "https://selah.example.com")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")
os.environ.setdefault("JWT_SECRET", "test-secret-not-used")

from app.services.email_service import prepare_email_html  # noqa: E402


def test_relative_uploads_url_is_absolutized():
    html_in = '<p>Hello</p><img src="/uploads/newsletters/foo/abc.jpg" alt="cat">'
    out = prepare_email_html(html_in)
    assert 'src="https://selah.example.com/uploads/newsletters/foo/abc.jpg"' in out
    assert "/uploads/newsletters/foo/abc.jpg" in out  # path preserved
    assert 'alt="cat"' in out


def test_absolute_url_is_left_alone():
    html_in = '<img src="https://cdn.example.com/foo.jpg" alt="x">'
    out = prepare_email_html(html_in)
    assert 'src="https://cdn.example.com/foo.jpg"' in out


def test_inline_responsive_style_is_added():
    html_in = '<img src="/uploads/newsletters/foo/abc.jpg" alt="cat">'
    out = prepare_email_html(html_in)
    assert "max-width:100%" in out
    assert "height:auto" in out
    assert "display:block" in out


def test_existing_width_height_attrs_are_stripped():
    html_in = '<img src="/uploads/x.jpg" alt="x" width="2000" height="1500">'
    out = prepare_email_html(html_in)
    assert "width=" not in out
    assert "height=" not in out
    assert "max-width:100%" in out


def test_existing_style_attr_is_replaced():
    html_in = '<img src="/uploads/x.jpg" alt="x" style="opacity:0.5;border:1px red;">'
    out = prepare_email_html(html_in)
    # Original opacity/border should be gone; canonical style present.
    assert "opacity:0.5" not in out
    assert "max-width:100%" in out


def test_self_closing_tag_works():
    html_in = '<img src="/uploads/x.jpg" alt="x" />'
    out = prepare_email_html(html_in)
    assert "max-width:100%" in out
    assert 'src="https://selah.example.com/uploads/x.jpg"' in out


def test_idempotent_on_already_absolute_already_styled():
    html_in = (
        '<img src="https://cdn.example.com/x.jpg" alt="x" '
        'style="max-width:100%;height:auto;display:block;border-radius:4px;margin:16px 0;" />'
    )
    out1 = prepare_email_html(html_in)
    out2 = prepare_email_html(out1)
    # Running it twice produces the same output (no double-styling, no URL re-prefix).
    assert out1 == out2
    assert out1.count("style=") == 1


def test_html_without_images_is_unchanged():
    html_in = "<h2>Title</h2><p>Body text with <strong>bold</strong>.</p>"
    out = prepare_email_html(html_in)
    assert out == html_in


def test_multiple_images_all_processed():
    html_in = (
        '<p>Intro</p>'
        '<img src="/uploads/a.jpg" alt="a">'
        '<p>Middle</p>'
        '<img src="https://cdn.example.com/b.jpg" alt="b">'
        '<p>Outro</p>'
    )
    out = prepare_email_html(html_in)
    assert out.count("max-width:100%") == 2
    assert 'src="https://selah.example.com/uploads/a.jpg"' in out
    assert 'src="https://cdn.example.com/b.jpg"' in out


def test_img_without_src_is_handled_gracefully():
    html_in = '<img alt="broken">'
    # Should not crash and should still inject style.
    out = prepare_email_html(html_in)
    assert "max-width:100%" in out


if __name__ == "__main__":
    # Allow `python tests/test_email_image_postprocess.py` for environments
    # without pytest installed.
    tests = [v for k, v in list(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for fn in tests:
        try:
            fn()
            print(f"PASS  {fn.__name__}")
        except AssertionError as e:
            failed += 1
            print(f"FAIL  {fn.__name__}: {e}")
        except Exception as e:
            failed += 1
            print(f"ERROR {fn.__name__}: {type(e).__name__}: {e}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    sys.exit(1 if failed else 0)
