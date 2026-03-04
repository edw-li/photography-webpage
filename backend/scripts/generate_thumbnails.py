#!/usr/bin/env python3
"""Backfill thumbnails for existing uploaded images.

Walks the uploads/ directory recursively and generates missing thumbnail
variants (thumb, medium, full) for each original image.

Usage:
    python -m scripts.generate_thumbnails
    # or from backend/:
    python scripts/generate_thumbnails.py
"""

import re
import sys
from pathlib import Path

# Add parent directory to path so we can import app modules
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.storage import THUMBNAIL_SIZES, _generate_thumbnails

SUFFIX_PATTERN = re.compile(r"_(?:thumb|medium|full)\.\w+$")
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}


def main() -> None:
    uploads_dir = Path("uploads")
    if not uploads_dir.exists():
        print("No uploads/ directory found. Nothing to do.")
        return

    originals = []
    for path in uploads_dir.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix.lower() not in IMAGE_EXTENSIONS:
            continue
        # Skip files that are already thumbnails
        if SUFFIX_PATTERN.search(path.name):
            continue
        originals.append(path)

    print(f"Found {len(originals)} original image(s).")
    generated = 0

    for original in originals:
        missing = []
        for suffix in THUMBNAIL_SIZES:
            variant_name = f"{original.stem}_{suffix}{original.suffix}"
            variant_path = original.parent / variant_name
            if not variant_path.exists():
                missing.append(suffix)

        if missing:
            print(f"  Generating {', '.join(missing)} for {original}")
            try:
                _generate_thumbnails(original)
                generated += 1
            except Exception as e:
                print(f"  ERROR: {e}")

    print(f"Done. Generated thumbnails for {generated} image(s).")


if __name__ == "__main__":
    main()
