"""Seed the database from existing JSON data files.

Usage:
    cd backend
    python -m app.seed
"""

import asyncio
import json
from pathlib import Path

import markdown as md_lib
from sqlalchemy import select

from .config import settings
from .database import async_session, engine, Base
from .models.user import User
from .models.member import Member, SocialLink, SamplePhoto
from .models.gallery import GalleryPhoto
from .models.event import Event
from .models.newsletter import Newsletter
from .models.contest import Contest, ContestSubmission
from .services.auth_service import hash_password

# Paths to frontend data files (relative to backend/)
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = REPO_ROOT / "src" / "data"
NEWSLETTERS_DIR = REPO_ROOT / "src" / "newsletters"


def _parse_frontmatter(raw: str) -> tuple[dict[str, str], str]:
    """Parse YAML-like frontmatter delimited by --- lines."""
    trimmed = raw.lstrip()
    if not trimmed.startswith("---"):
        return {}, raw
    end = trimmed.index("---", 3) if "---" in trimmed[3:] else -1
    if end == -1:
        return {}, raw
    # Find the actual end index (searching from position 3)
    end = trimmed.index("---", 3)
    frontmatter_block = trimmed[3:end]
    body = trimmed[end + 3:].strip()
    meta: dict[str, str] = {}
    for line in frontmatter_block.split("\n"):
        colon_idx = line.find(":")
        if colon_idx == -1:
            continue
        key = line[:colon_idx].strip()
        value = line[colon_idx + 1:].strip()
        # Strip surrounding quotes
        if len(value) >= 2 and (
            (value.startswith('"') and value.endswith('"'))
            or (value.startswith("'") and value.endswith("'"))
        ):
            value = value[1:-1]
        if key:
            meta[key] = value
    return meta, body


async def seed() -> None:
    # Create tables if they don't exist (for convenience; production uses Alembic)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as db:
        # --- Seed admin user ---
        existing_admin = await db.execute(select(User).where(User.email == settings.admin_email))
        if existing_admin.scalar_one_or_none() is None:
            admin = User(
                email=settings.admin_email,
                hashed_password=hash_password(settings.admin_password),
                role="admin",
            )
            db.add(admin)
            await db.flush()
            print(f"Created admin user: {settings.admin_email}")
        else:
            print(f"Admin user already exists: {settings.admin_email}")

        # --- Seed members ---
        # existing_members = await db.execute(select(Member))
        # if existing_members.scalars().first() is not None:
        #     print("Members already seeded, skipping.")
        # else:
        #     members_file = DATA_DIR / "members.json"
        #     with open(members_file, encoding="utf-8") as f:
        #         members_data = json.load(f)["members"]

        #     member_map: dict[str, Member] = {}
        #     for m in members_data:
        #         member = Member(
        #             name=m["name"],
        #             specialty=m["specialty"],
        #             avatar_url=m["avatar"],
        #             photography_type=m.get("photographyType"),
        #             leadership_role=m.get("leadershipRole"),
        #             website=m.get("website"),
        #             bio=m.get("bio"),
        #         )
        #         # Social links
        #         for platform, url in (m.get("socialLinks") or {}).items():
        #             member.social_links.append(SocialLink(platform=platform, url=url))
        #         # Sample photos
        #         for i, photo in enumerate(m.get("samplePhotos") or []):
        #             member.sample_photos.append(
        #                 SamplePhoto(src_url=photo["src"], caption=photo.get("caption"), sort_order=i)
        #             )
        #         db.add(member)
        #         member_map[m["name"]] = member

        #     await db.flush()
        #     print(f"Seeded {len(members_data)} members")

        #     # --- Seed gallery photos ---
        #     existing_gallery = await db.execute(select(GalleryPhoto))
        #     if existing_gallery.scalars().first() is not None:
        #         print("Gallery already seeded, skipping.")
        #     else:
        #         gallery_file = DATA_DIR / "gallery.json"
        #         with open(gallery_file, encoding="utf-8") as f:
        #             gallery_data = json.load(f)["gallery"]

        #         for p in gallery_data:
        #             # Try to link to a member by photographer name
        #             linked_member = member_map.get(p["photographer"])
        #             exif = p.get("exif") or {}
        #             photo = GalleryPhoto(
        #                 id=p["id"],
        #                 url=p["url"],
        #                 title=p["title"],
        #                 photographer=p["photographer"],
        #                 member_id=linked_member.id if linked_member else None,
        #                 exif_camera=exif.get("camera"),
        #                 exif_focal_length=exif.get("focalLength"),
        #                 exif_iso=exif.get("iso"),
        #                 exif_aperture=exif.get("aperture"),
        #                 exif_shutter_speed=exif.get("shutterSpeed"),
        #             )
        #             db.add(photo)

        #         print(f"Seeded {len(gallery_data)} gallery photos")

        # --- Seed events ---
        # existing_events = await db.execute(select(Event))
        # if existing_events.scalars().first() is not None:
        #     print("Events already seeded, skipping.")
        # else:
        #     events_file = DATA_DIR / "events.json"
        #     with open(events_file, encoding="utf-8") as f:
        #         events_data = json.load(f)["events"]

        #     for e in events_data:
        #         event = Event(
        #             id=e["id"],
        #             title=e["title"],
        #             description=e["description"],
        #             location=e["location"],
        #             time=e["time"],
        #             end_time=e.get("endTime"),
        #             date=e["date"],
        #             recurrence=e.get("recurrence"),  # stored as-is (camelCase JSONB)
        #         )
        #         db.add(event)

        #     print(f"Seeded {len(events_data)} events")

        # --- Seed newsletters ---
        # existing_newsletters = await db.execute(select(Newsletter))
        # if existing_newsletters.scalars().first() is not None:
        #     print("Newsletters already seeded, skipping.")
        # else:
        #     md_files = sorted(NEWSLETTERS_DIR.glob("*.md"))
        #     count = 0
        #     for md_file in md_files:
        #         raw = md_file.read_text(encoding="utf-8")
        #         meta, body = _parse_frontmatter(raw)
        #         nl_id = md_file.stem  # e.g. "2026-02-20-spring-photography-tips"
        #         html = md_lib.markdown(body, extensions=["extra"])
        #         newsletter = Newsletter(
        #             id=nl_id,
        #             title=meta.get("title", nl_id),
        #             date=meta.get("date", ""),
        #             category=meta.get("category", "Uncategorized"),
        #             author=meta.get("author", ""),
        #             preview=meta.get("preview", ""),
        #             featured=meta.get("featured", "").lower() == "true",
        #             body_md=body,
        #             html=html,
        #         )
        #         db.add(newsletter)
        #         count += 1

        #     print(f"Seeded {count} newsletters")

        # --- Seed contests ---
        # existing_contests = await db.execute(select(Contest))
        # if existing_contests.scalars().first() is not None:
        #     print("Contests already seeded, skipping.")
        # else:
        #     contests_file = DATA_DIR / "contests.json"
        #     with open(contests_file, encoding="utf-8") as f:
        #         contests_data = json.load(f)

        #     for c in contests_data:
        #         contest = Contest(
        #             id=c["id"],
        #             month=c["month"],
        #             theme=c["theme"],
        #             description=c["description"],
        #             status=c["status"],
        #             deadline=c["deadline"],
        #             guidelines=c["guidelines"],
        #             winners=c.get("winners"),
        #             honorable_mentions=c.get("honorableMentions"),
        #         )
        #         db.add(contest)
        #         await db.flush()

        #         for s in c.get("submissions", []):
        #             exif = s.get("exif") or {}
        #             submission = ContestSubmission(
        #                 id=s["id"],
        #                 contest_id=c["id"],
        #                 url=s["url"],
        #                 title=s["title"],
        #                 photographer=s["photographer"],
        #                 vote_count=s.get("votes", 0),
        #                 exif_camera=exif.get("camera"),
        #                 exif_focal_length=exif.get("focalLength"),
        #                 exif_aperture=exif.get("aperture"),
        #                 exif_shutter_speed=exif.get("shutterSpeed"),
        #                 exif_iso=exif.get("iso"),
        #             )
        #             db.add(submission)

        #     await db.flush()
        #     total_subs = sum(len(c.get("submissions", [])) for c in contests_data)
        #     print(f"Seeded {len(contests_data)} contests with {total_subs} submissions")

        await db.commit()
        print("Seed complete.")


if __name__ == "__main__":
    asyncio.run(seed())
