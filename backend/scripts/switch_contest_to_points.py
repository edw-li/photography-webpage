#!/usr/bin/env python3
"""Switch a contest that is mid-vote from classic category voting to points voting.

Classic ballots (up to three unranked picks per category) can't be converted,
so the contest's ballots are copied to contest_vote_archive and cleared, and
everyone who had voted gets an in-app notification asking them to vote again.
Completed contests are never touched. Run this AFTER deploying the points
voting release, and back up the database first (scripts/backup_db.sh).

Usage (from backend/, or inside the backend container):
    python -m scripts.switch_contest_to_points                      # list contests in voting
    python -m scripts.switch_contest_to_points --contest-id 12      # preview, changes nothing
    python -m scripts.switch_contest_to_points --contest-id 12 --apply
"""

import argparse
import asyncio
import sys
from pathlib import Path

# Add parent directory to path so we can import app modules
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import HTTPException  # noqa: E402
from sqlalchemy import func, select  # noqa: E402

from app.database import async_session, engine  # noqa: E402
from app.models import Contest, ContestVote  # noqa: E402
from app.services.points_voting import switch_contest_to_points  # noqa: E402


async def list_voting_contests() -> None:
    async with async_session() as db:
        rows = (await db.execute(
            select(Contest.id, Contest.month, Contest.theme, Contest.voting_format, func.count(ContestVote.id))
            .outerjoin(ContestVote, ContestVote.contest_id == Contest.id)
            .where(Contest.status == "voting")
            .group_by(Contest.id)
            .order_by(Contest.month)
        )).all()
    if not rows:
        print("No contest is in voting.")
        return
    print("Contests in voting:")
    for contest_id, month, theme, voting_format, ballot_rows in rows:
        print(f'  id={contest_id}  {month}  "{theme}"  format={voting_format}  ballot rows={ballot_rows}')
    print("\nPreview a switch with --contest-id ID, then re-run with --apply.")


async def switch(contest_id: int, apply: bool) -> int:
    async with async_session() as db:
        try:
            result = await switch_contest_to_points(db, contest_id, apply=apply)
        except (ValueError, HTTPException) as exc:
            print(f"Refused: {getattr(exc, 'detail', exc)}")
            return 1
    if result.already_points:
        print(f'Contest {contest_id} ("{result.theme}") already uses points voting. Nothing to do.')
        return 0
    notified = result.voters if result.status == "voting" else 0
    if apply:
        print(f'Switched contest {contest_id} ("{result.theme}") to points voting.')
        print(f"  Ballot rows archived and cleared: {result.archived_votes}")
        print(f"  Members notified to vote again:   {notified}")
    else:
        print(f'Preview: contest {contest_id} ("{result.theme}", status {result.status}) would switch to points voting.')
        print(f"  Ballot rows to archive and clear: {result.archived_votes}")
        print(f"  Members to notify to vote again:  {notified}")
        print("\nNothing changed. Back up the database, then re-run with --apply.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--contest-id", type=int, help="the contest to switch")
    parser.add_argument("--apply", action="store_true", help="make the change (default: preview only)")
    args = parser.parse_args()
    if args.apply and args.contest_id is None:
        parser.error("--apply needs --contest-id")

    async def run() -> int:
        try:
            if args.contest_id is None:
                await list_voting_contests()
                return 0
            return await switch(args.contest_id, args.apply)
        finally:
            await engine.dispose()

    return asyncio.run(run())


if __name__ == "__main__":
    sys.exit(main())
