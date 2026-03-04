#!/usr/bin/env python3
"""Migrate local /uploads/ images to OCI Object Storage.

Reads all rows from gallery_photos, members, sample_photos, and
contest_submissions that have local /uploads/... URLs. For each:
  1. Reads the original file from the local uploads directory
  2. Uploads original + thumbnails to OCI
  3. Updates the DB record with the new absolute OCI URL

Usage (inside the backend container):
    python -m scripts.migrate_uploads_to_oci

Or dry-run (prints what would be migrated without changing anything):
    python -m scripts.migrate_uploads_to_oci --dry-run
"""

import asyncio
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text

from app.config import settings
from app.database import async_session
from app.services.storage import _upload_with_thumbnails_oci

UPLOAD_DIR = Path(settings.upload_dir)

# Tables and columns containing image URLs that may reference /uploads/
TABLES_TO_MIGRATE = [
    ("gallery_photos", "url", "id"),
    ("members", "avatar_url", "id"),
    ("sample_photos", "src_url", "id"),
    ("contest_submissions", "url", "id"),
]

THUMBNAIL_SUFFIX_PATTERN = re.compile(r"_(?:thumb|medium|full)\.\w+$")


async def migrate(dry_run: bool = False) -> None:
    if not settings.oci_configured:
        print("ERROR: OCI is not configured. Set OCI_ACCESS_KEY, OCI_SECRET_KEY, "
              "OCI_BUCKET_NAME, OCI_NAMESPACE, and OCI_REGION environment variables.")
        sys.exit(1)

    async with async_session() as session:
        total_migrated = 0
        total_skipped = 0
        total_errors = 0

        for table, column, pk in TABLES_TO_MIGRATE:
            print(f"\n--- {table}.{column} ---")

            result = await session.execute(
                text(f"SELECT {pk}, {column} FROM {table} WHERE {column} LIKE '/uploads/%'")
            )
            rows = result.fetchall()
            print(f"  Found {len(rows)} row(s) with local URLs")

            for row_id, url in rows:
                # url looks like /uploads/gallery/abc123.jpg
                # Strip leading slash to get filesystem-relative path
                rel_path = url.lstrip("/")
                local_file = UPLOAD_DIR.parent / rel_path if not UPLOAD_DIR.is_absolute() else Path("/app") / rel_path

                # Try multiple possible paths
                candidates = [
                    UPLOAD_DIR / rel_path.removeprefix("uploads/"),
                    Path(rel_path),
                    Path("/app") / rel_path,
                ]

                file_path = None
                for candidate in candidates:
                    if candidate.exists():
                        file_path = candidate
                        break

                if file_path is None:
                    print(f"  SKIP {pk}={row_id}: file not found for {url}")
                    print(f"    Tried: {[str(c) for c in candidates]}")
                    total_skipped += 1
                    continue

                # Parse category and filename from URL
                # /uploads/gallery/abc123.jpg -> category=gallery, name=abc123.jpg
                parts = url.strip("/").split("/")  # ['uploads', 'gallery', 'abc123.jpg']
                if len(parts) < 3:
                    print(f"  SKIP {pk}={row_id}: unexpected URL format: {url}")
                    total_skipped += 1
                    continue

                category = "/".join(parts[1:-1])  # e.g., 'gallery' or 'submissions/1'
                filename = parts[-1]
                ext = Path(filename).suffix

                if dry_run:
                    print(f"  DRY-RUN {pk}={row_id}: would migrate {url}")
                    total_migrated += 1
                    continue

                try:
                    content = file_path.read_bytes()
                    oci_url = _upload_with_thumbnails_oci(content, category, filename, ext)
                    await session.execute(
                        text(f"UPDATE {table} SET {column} = :url WHERE {pk} = :id"),
                        {"url": oci_url, "id": row_id},
                    )
                    print(f"  OK {pk}={row_id}: {url} -> {oci_url}")
                    total_migrated += 1
                except Exception as e:
                    print(f"  ERROR {pk}={row_id}: {e}")
                    total_errors += 1

        if not dry_run:
            await session.commit()

        print(f"\n=== Migration complete ===")
        print(f"  Migrated: {total_migrated}")
        print(f"  Skipped:  {total_skipped}")
        print(f"  Errors:   {total_errors}")


def main() -> None:
    dry_run = "--dry-run" in sys.argv
    if dry_run:
        print("*** DRY RUN MODE — no changes will be made ***\n")
    asyncio.run(migrate(dry_run=dry_run))


if __name__ == "__main__":
    main()
