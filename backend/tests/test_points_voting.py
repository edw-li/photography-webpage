"""Integration tests for points voting, run in an isolated schema of a LOCAL test DB.

TEST_DATABASE_URL=postgresql+asyncpg://...@127.0.0.1:55432/photography_test
Run: python -m pytest backend/tests/test_points_voting.py -q
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest
import pytest_asyncio
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import delete, func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.database import Base
from app.models import Contest, ContestSubmission, ContestVote, ContestVoteArchive, GalleryPhoto, Notification, User
from app.models.notification import NOTIFICATION_TYPE_CONTEST_REVOTE
from app.schemas.contest import BatchVoteRequest, CategoryVoteRequest, ContestCreate, ContestUpdate, PointsBallotRequest


@pytest_asyncio.fixture
async def sessions():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set TEST_DATABASE_URL to a local PostgreSQL test database")
    parsed = make_url(url)
    assert parsed.host in ("localhost", "127.0.0.1", "::1") and parsed.database.endswith("_test"), "Only local test databases are allowed"
    schema = "points_test_" + uuid.uuid4().hex
    bootstrap = create_async_engine(url)
    async with bootstrap.begin() as conn:
        await conn.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_async_engine(url, connect_args={"server_settings": {"search_path": schema}})
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield factory
    await engine.dispose()
    async with bootstrap.begin() as conn:
        await conn.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
    await bootstrap.dispose()


async def seed(sessions, *, voting_format="points", wildcard="Best Use of Light", status="voting",
               members=5, month="2026-10", users=None):
    """A contest where member i owns photo i. Reuses *users* (ids) when given."""
    async with sessions() as db:
        if users is None:
            people = [User(email=f"m{i}-{uuid.uuid4().hex[:6]}@example.com", first_name="Member", last_name=str(i),
                           hashed_password="unused", role="member", is_active=True) for i in range(members)]
            admin = User(email=f"admin-{uuid.uuid4().hex[:6]}@example.com", first_name="Club", last_name="Admin",
                         hashed_password="unused", role="admin", is_active=True)
            db.add_all([*people, admin])
            await db.flush()
            user_ids, admin_id = [u.id for u in people], admin.id
        else:
            user_ids, admin_id = users.user_ids, users.admin_id
        contest = Contest(month=month, theme=f"Theme {month}", description="Test", status=status,
                          deadline=f"{month}-28", guidelines=[], wildcard_category=wildcard,
                          voting_format=voting_format,
                          submissions_locked_at=datetime.now(timezone.utc) if status != "active" else None)
        db.add(contest)
        await db.flush()
        subs = [ContestSubmission(contest_id=contest.id, url=f"/uploads/contests/{month}/p{i}.jpg",
                                  title=f"Photo {i}", photographer=f"Member {i}", user_id=uid)
                for i, uid in enumerate(user_ids)]
        db.add_all(subs)
        await db.commit()
        return SimpleNamespace(contest_id=contest.id, user_ids=user_ids, admin_id=admin_id,
                               sub_ids=[s.id for s in subs])


async def ballot(sessions, ctx, voter, theme, favorite=None, bonus=None):
    from app.api.contests import cast_vote
    async with sessions() as db:
        user = await db.get(User, ctx.user_ids[voter])
        body = BatchVoteRequest(ballot=PointsBallotRequest(theme=theme, favorite=favorite, bonus=bonus))
        return await cast_vote(ctx.contest_id, body, user, db)


async def classic_ballot(sessions, ctx, voter, **categories):
    from app.api.contests import cast_vote
    async with sessions() as db:
        user = await db.get(User, ctx.user_ids[voter])
        votes = [CategoryVoteRequest(category=c, submission_ids=ids) for c, ids in categories.items()]
        return await cast_vote(ctx.contest_id, BatchVoteRequest(votes=votes), user, db)


async def complete(sessions, ctx):
    from app.api.contests import update_contest
    async with sessions() as db:
        admin = await db.get(User, ctx.admin_id)
        return await update_contest(ctx.contest_id, ContestUpdate(status="completed"), admin, db)


async def expect_error(awaitable, status, fragment):
    with pytest.raises(HTTPException) as error:
        await awaitable
    assert error.value.status_code == status
    assert fragment in error.value.detail


async def cast_tied_leaderboard(sessions, ctx):
    """Photos 1 and 2 tie on every measure (9 pts); photo 3 is next with 6.

    m0: 1, 2, 3 · favorite 1 · bonus 4      m4: 2, 1, 3 · favorite 2
    m1: 2, 3, 0                               m2: 1, 3, 0
    """
    p = ctx.sub_ids
    await ballot(sessions, ctx, 0, [p[1], p[2], p[3]], favorite=p[1], bonus=p[4])
    await ballot(sessions, ctx, 4, [p[2], p[1], p[3]], favorite=p[2])
    await ballot(sessions, ctx, 1, [p[2], p[3], p[0]])
    await ballot(sessions, ctx, 2, [p[1], p[3], p[0]])


@pytest.mark.asyncio
async def test_points_ballot_stores_ranks_and_rejects_bad_ballots(sessions):
    from app.api.contests import cast_vote
    ctx = await seed(sessions)
    p = ctx.sub_ids
    await expect_error(ballot(sessions, ctx, 0, [p[0], p[1], p[2]]), 400, "own")
    await expect_error(ballot(sessions, ctx, 0, [p[1], p[2]]), 400, "top 3")
    await expect_error(ballot(sessions, ctx, 0, [p[1], p[1], p[2]]), 400, "different")
    await expect_error(ballot(sessions, ctx, 0, [p[1], p[2], 999999]), 400, "not found")
    await expect_error(ballot(sessions, ctx, 0, [p[1], p[2], p[3]], favorite=p[0]), 400, "own")
    # A page loaded before the switch still sends the classic category shape.
    async with sessions() as db:
        user = await db.get(User, ctx.user_ids[0])
        stale = BatchVoteRequest(votes=[CategoryVoteRequest(category="theme", submission_ids=[p[1]])])
        await expect_error(cast_vote(ctx.contest_id, stale, user, db), 409, "refresh")

    # The favorite may repeat a ranked photo.
    await ballot(sessions, ctx, 0, [p[3], p[1], p[2]], favorite=p[3], bonus=p[4])
    async with sessions() as db:
        rows = (await db.execute(select(ContestVote.submission_id, ContestVote.category, ContestVote.rank)
                                 .where(ContestVote.user_id == ctx.user_ids[0]))).all()
    assert set(rows) == {(p[3], "theme", 1), (p[1], "theme", 2), (p[2], "theme", 3),
                         (p[3], "favorite", None), (p[4], "wildcard", None)}
    await expect_error(ballot(sessions, ctx, 0, [p[1], p[2], p[3]]), 409, "already voted")


@pytest.mark.asyncio
async def test_bonus_pick_needs_a_bonus_challenge_and_small_contests_rank_fewer(sessions):
    ctx = await seed(sessions, wildcard=None, members=3)
    p = ctx.sub_ids
    await expect_error(ballot(sessions, ctx, 0, [p[1], p[2]], bonus=p[1]), 400, "bonus")
    # Only two photos are eligible for member 0, so the ballot ranks two.
    await expect_error(ballot(sessions, ctx, 0, [p[1]]), 400, "top 2")
    await ballot(sessions, ctx, 0, [p[2], p[1]], favorite=p[2])


@pytest.mark.asyncio
async def test_completion_builds_one_leaderboard_with_shared_places(sessions):
    from app.api.contests import get_contest
    ctx = await seed(sessions)
    p = ctx.sub_ids
    await cast_tied_leaderboard(sessions, ctx)
    response = await complete(sessions, ctx)

    assert response.voting_format == "points"
    assert [(w.submission_id, w.place, w.category) for w in response.winners] == [
        (p[1], 1, "overall"), (p[2], 1, "overall"), (p[3], 3, "overall"),
    ]
    async with sessions() as db:
        totals = dict((await db.execute(select(ContestSubmission.id, ContestSubmission.vote_count)
                                        .where(ContestSubmission.contest_id == ctx.contest_id))).all())
        gallery = {g.contest_submission_id: g for g in
                   (await db.execute(select(GalleryPhoto).where(GalleryPhoto.contest_id == ctx.contest_id))).scalars()}
    assert [totals[i] for i in p] == [2, 9, 9, 6, 1]
    assert (gallery[p[1]].winner_place, gallery[p[1]].winner_category) == (1, "overall")
    assert gallery[p[3]].winner_placements == [{"place": 3, "category": "overall", "month": "2026-10"}]
    assert not gallery[p[0]].is_winner

    async with sessions() as db:
        public = await get_contest(ctx.contest_id, db, None)
    scores = {s.id: s.score for s in public.submissions}
    assert (scores[p[1]].total, scores[p[1]].theme_points, scores[p[1]].theme_first, scores[p[1]].favorite) == (9, 8, 2, 1)
    assert (scores[p[1]].rank, scores[p[2]].rank, scores[p[3]].rank) == (1, 1, 3)
    assert scores[p[1]].tiebreak is None
    assert (scores[p[4]].bonus, scores[p[4]].total) == (1, 1)
    assert all(s.category_votes is None for s in public.submissions)


@pytest.mark.asyncio
async def test_classic_contests_keep_category_rules_through_recalculation(sessions):
    from app.api.contests import get_contest, recalculate_winners
    ctx = await seed(sessions, voting_format="classic", members=4)
    p = ctx.sub_ids
    # A ballot built for the points format is refused on a classic contest.
    await expect_error(ballot(sessions, ctx, 0, [p[1], p[2], p[3]]), 400, "category voting")
    await classic_ballot(sessions, ctx, 0, theme=[p[1], p[2]], favorite=[p[1]], wildcard=[p[3]])
    await classic_ballot(sessions, ctx, 3, theme=[p[1]], favorite=[p[2], p[1]])
    completed = await complete(sessions, ctx)
    before = [(w.submission_id, w.place, w.category) for w in completed.winners]
    assert ("theme" in {c for _, _, c in before}) and "overall" not in {c for _, _, c in before}

    async with sessions() as db:
        await recalculate_winners(await db.get(User, ctx.admin_id), db)
    async with sessions() as db:
        after = await get_contest(ctx.contest_id, db, None)
    assert [(w.submission_id, w.place, w.category) for w in after.winners] == before
    assert after.voting_format == "classic"
    votes = {s.id: s.category_votes for s in after.submissions}
    assert (votes[p[1]].theme, votes[p[1]].favorite) == (2, 2)
    assert all(s.score is None for s in after.submissions)


@pytest.mark.asyncio
async def test_my_results_builds_on_classic_history(sessions):
    from app.api.contests import get_my_results
    points = await seed(sessions)
    await cast_tied_leaderboard(sessions, points)
    await complete(sessions, points)
    # Member 1 also took 1st (theme) and 2nd (favorite) in an earlier classic contest.
    classic = await seed(sessions, voting_format="classic", status="completed", month="2026-09", users=points)
    async with sessions() as db:
        contest = await db.get(Contest, classic.contest_id)
        contest.winners = [
            {"submissionId": classic.sub_ids[1], "place": 1, "category": "theme"},
            {"submissionId": classic.sub_ids[1], "place": 2, "category": "favorite"},
            {"submissionId": classic.sub_ids[2], "place": 1, "category": "favorite"},
        ]
        (await db.get(ContestSubmission, classic.sub_ids[1])).vote_count = 7
        await db.commit()

    async with sessions() as db:
        mine = await get_my_results(await db.get(User, points.user_ids[1]), db)
    s = mine.stats
    assert (s.first_place_finishes, s.second_place_finishes, s.third_place_finishes, s.podium_finishes) == (2, 1, 0, 3)
    assert (s.overall_first_place_finishes, s.overall_second_place_finishes, s.overall_third_place_finishes) == (1, 0, 0)
    assert s.total_votes == 7  # classic contests only, never points
    assert (s.total_points, s.first_choice_votes) == (9, 2)
    assert s.best_category == "theme"
    assert (s.has_classic_results, s.has_points_results) == (True, True)
    assert (s.contests_entered, s.total_completed_contests) == (2, 2)
    assert mine.leaderboard.total_points.rank == 1  # tied with member 2's photo
    assert mine.leaderboard.first_choice_votes.value == 2

    newest, oldest = mine.contests
    assert (newest.voting_format, oldest.voting_format) == ("points", "classic")
    assert newest.theme_result is None and oldest.overall_result is None
    overall = newest.overall_result
    assert (overall.best_place, overall.best_points, overall.total_points) == (1, 9, 9)
    assert overall.submissions[0].score.theme_first == 2
    assert oldest.theme_result.best_place == 1 and oldest.favorite_result.best_place == 2

    async with sessions() as db:
        member3 = await get_my_results(await db.get(User, points.user_ids[3]), db)
    assert member3.contests[0].overall_result.best_place == 3
    assert member3.stats.has_classic_results is True and member3.stats.total_votes == 0


@pytest.mark.asyncio
async def test_switch_contest_to_points_archives_ballots_and_asks_voters_to_revote(sessions):
    from app.api.contests import get_contest
    from app.services.points_voting import switch_contest_to_points
    ctx = await seed(sessions, voting_format="classic", members=4)
    p = ctx.sub_ids
    await classic_ballot(sessions, ctx, 0, theme=[p[1], p[2]], favorite=[p[3]])
    await classic_ballot(sessions, ctx, 1, theme=[p[2]])

    async with sessions() as db:
        preview = await switch_contest_to_points(db, ctx.contest_id, apply=False)
    assert (preview.archived_votes, preview.voters, preview.already_points) == (4, 2, False)
    async with sessions() as db:
        assert (await db.get(Contest, ctx.contest_id)).voting_format == "classic"
        assert await db.scalar(select(func.count()).select_from(ContestVote)) == 4

    async with sessions() as db:
        done = await switch_contest_to_points(db, ctx.contest_id)
    assert (done.archived_votes, done.voters) == (4, 2)
    async with sessions() as db:
        assert (await db.get(Contest, ctx.contest_id)).voting_format == "points"
        assert await db.scalar(select(func.count()).select_from(ContestVote)) == 0
        archived = (await db.execute(select(ContestVoteArchive))).scalars().all()
        notices = (await db.execute(select(Notification).where(Notification.type == NOTIFICATION_TYPE_CONTEST_REVOTE))).scalars().all()
        response = await get_contest(ctx.contest_id, db, await db.get(User, ctx.user_ids[0]))
    assert len(archived) == 4 and {a.reason for a in archived} == {"switched_to_points"}
    assert sorted(n.user_id for n in notices) == sorted(ctx.user_ids[:2])
    assert notices[0].payload["contestId"] == ctx.contest_id
    assert response.voting_format == "points" and response.user_has_voted is False

    await ballot(sessions, ctx, 0, [p[1], p[2], p[3]])
    async with sessions() as db:
        again = await switch_contest_to_points(db, ctx.contest_id)
        assert again.already_points is True
        assert await db.scalar(select(func.count()).select_from(ContestVote)) == 3


@pytest.mark.asyncio
async def test_http_json_contract_matches_the_frontend(sessions):
    import httpx
    from app.api.deps import get_db
    from app.main import app
    from app.services.auth_service import create_access_token
    ctx = await seed(sessions, members=4)
    p = ctx.sub_ids
    base = f"/api/v1/contests/{ctx.contest_id}"

    def auth(member):
        return {"Authorization": "Bearer " + create_access_token(str(ctx.user_ids[member]))}

    async def test_db():
        async with sessions() as db:
            yield db

    app.dependency_overrides[get_db] = test_db
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            stale = await client.post(base + "/vote", headers=auth(0),
                                      json={"votes": [{"category": "theme", "submissionIds": [p[1]]}]})
            assert stale.status_code == 409 and "refresh" in stale.json()["detail"]
            cast = await client.post(base + "/vote", headers=auth(0),
                                     json={"ballot": {"theme": [p[1], p[2], p[3]], "favorite": p[2], "bonus": None}})
            assert cast.status_code == 201, cast.text
            voting = (await client.get(base, headers=auth(0))).json()
            assert voting["votingFormat"] == "points" and voting["userHasVoted"] is True
            assert all(s["score"] is None for s in voting["submissions"])

        await complete(sessions, ctx)

        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            done = (await client.get(base)).json()
            mine = (await client.get("/api/v1/contests/my-results", headers=auth(1))).json()
    finally:
        app.dependency_overrides.clear()

    # Photo 1: 3 theme pts. Photo 2: 2 theme pts + favorite = 3, so theme points decide.
    scores = {s["id"]: s["score"] for s in done["submissions"]}
    assert scores[p[1]] == {"total": 3, "themePoints": 3, "themeFirst": 1, "themeSecond": 0, "themeThird": 0,
                            "favorite": 0, "bonus": 0, "rank": 1, "tiebreak": "theme_points"}
    assert (scores[p[2]]["rank"], scores[p[2]]["tiebreak"]) == (2, "theme_points")
    assert done["winners"] == [
        {"submissionId": p[1], "place": 1, "category": "overall"},
        {"submissionId": p[2], "place": 2, "category": "overall"},
        {"submissionId": p[3], "place": 3, "category": "overall"},
    ]
    entry = mine["contests"][0]
    assert entry["votingFormat"] == "points" and entry["themeResult"] is None
    assert entry["overallResult"]["bestPlace"] == 1 and entry["overallResult"]["bestPoints"] == 3
    assert entry["overallResult"]["submissions"][0]["score"]["themeFirst"] == 1
    stats = mine["stats"]
    assert (stats["hasPointsResults"], stats["hasClassicResults"]) == (True, False)
    assert (stats["totalPoints"], stats["firstChoiceVotes"], stats["overallFirstPlaceFinishes"]) == (3, 1, 1)
    assert mine["leaderboard"]["totalPoints"]["rank"] == 1


@pytest.mark.asyncio
async def test_switch_refuses_completed_contests(sessions):
    from app.services.points_voting import switch_contest_to_points
    ctx = await seed(sessions, voting_format="classic", status="completed")
    async with sessions() as db:
        with pytest.raises(ValueError):
            await switch_contest_to_points(db, ctx.contest_id)


@pytest.mark.asyncio
async def test_finished_points_contest_is_frozen_against_later_ballot_changes(sessions):
    from app.api.contests import get_contest, get_my_results, recalculate_winners
    ctx = await seed(sessions)
    p = ctx.sub_ids
    await cast_tied_leaderboard(sessions, ctx)
    await complete(sessions, ctx)
    # Deleting member 0 cascades their ballot away (it gave photo 1 its
    # 1st-place vote and favorite); the finished contest must not change.
    async with sessions() as db:
        await db.execute(delete(User).where(User.id == ctx.user_ids[0]))
        await db.commit()
        assert await db.scalar(select(func.count()).select_from(ContestVote)) == 10  # of 15

    async with sessions() as db:
        await recalculate_winners(await db.get(User, ctx.admin_id), db)
    async with sessions() as db:
        public = await get_contest(ctx.contest_id, db, None)
        mine = await get_my_results(await db.get(User, ctx.user_ids[1]), db)
    scores = {s.id: s.score for s in public.submissions}
    assert [(scores[i].total, scores[i].rank) for i in p] == [(2, 4), (9, 1), (9, 1), (6, 3), (1, 5)]
    assert [(w.submission_id, w.place) for w in public.winners] == [(p[1], 1), (p[2], 1), (p[3], 3)]
    assert mine.stats.total_points == 9 and mine.contests[0].overall_result.best_place == 1


@pytest.mark.asyncio
async def test_reopening_a_points_contest_clears_and_recomputes_its_results(sessions):
    from app.api.contests import update_contest
    ctx = await seed(sessions)
    p = ctx.sub_ids
    await ballot(sessions, ctx, 0, [p[1], p[2], p[3]])
    await complete(sessions, ctx)
    async with sessions() as db:
        await update_contest(ctx.contest_id, ContestUpdate(status="voting"), await db.get(User, ctx.admin_id), db)
    async with sessions() as db:
        subs = (await db.execute(select(ContestSubmission).where(ContestSubmission.contest_id == ctx.contest_id))).scalars().all()
    assert all(s.points_score is None and s.vote_count == 0 for s in subs)

    await ballot(sessions, ctx, 1, [p[3], p[2], p[0]])
    reopened = await complete(sessions, ctx)
    # Photos 3 and 2 both have 4 pts, all theme; photo 3 has the only #1 vote.
    assert [(w.submission_id, w.place) for w in reopened.winners] == [(p[3], 1), (p[2], 2), (p[1], 3)]
    async with sessions() as db:
        assert (await db.get(ContestSubmission, p[3])).points_score["tiebreak"] == "first_choice"


@pytest.mark.asyncio
async def test_new_contests_use_points_and_imports_stay_classic(sessions):
    from app.api.contests import create_contest
    ctx = await seed(sessions, members=1)
    async with sessions() as db:
        admin = await db.get(User, ctx.admin_id)
        fresh = await create_contest(ContestCreate(month="2026-12", theme="Winter", description="d",
                                                   deadline="2026-12-31", guidelines=[]), admin, db)
    async with sessions() as db:
        imported = await create_contest(ContestCreate(month="2025-06", theme="Old", description="d", status="completed",
                                                      deadline="2025-06-30", guidelines=[]), admin, db)
    assert (fresh.voting_format, imported.voting_format) == ("points", "classic")


@pytest.mark.asyncio
async def test_simultaneous_ballots_from_one_member_store_one(sessions):
    ctx = await seed(sessions)
    p = ctx.sub_ids
    results = await asyncio.gather(
        ballot(sessions, ctx, 0, [p[1], p[2], p[3]]),
        ballot(sessions, ctx, 0, [p[2], p[3], p[4]]),
        return_exceptions=True,
    )
    assert sum(isinstance(r, HTTPException) and r.status_code == 409 for r in results) == 1
    async with sessions() as db:
        assert await db.scalar(select(func.count()).select_from(ContestVote)) == 3


@pytest.mark.asyncio
async def test_switch_outside_voting_archives_without_notifying(sessions):
    from app.services.points_voting import switch_contest_to_points
    ctx = await seed(sessions, voting_format="classic", status="active", members=3)
    async with sessions() as db:
        db.add(ContestVote(contest_id=ctx.contest_id, submission_id=ctx.sub_ids[1],
                           user_id=ctx.user_ids[0], category="theme"))
        await db.commit()
    async with sessions() as db:
        result = await switch_contest_to_points(db, ctx.contest_id)
    assert (result.archived_votes, result.voters) == (1, 1)
    async with sessions() as db:
        assert await db.scalar(select(func.count()).select_from(Notification)) == 0
        assert await db.scalar(select(func.count()).select_from(ContestVoteArchive)) == 1


def test_vote_request_needs_exactly_one_ballot_shape():
    with pytest.raises(ValidationError):
        BatchVoteRequest()
    with pytest.raises(ValidationError):
        BatchVoteRequest(votes=[], ballot=PointsBallotRequest(theme=[1]))
    assert BatchVoteRequest(votes=[]).ballot is None


@pytest.mark.asyncio
async def test_database_rejects_impossible_ranks_and_formats(sessions):
    ctx = await seed(sessions, members=2)
    async with sessions() as db:
        db.add(ContestVote(contest_id=ctx.contest_id, submission_id=ctx.sub_ids[1],
                           user_id=ctx.user_ids[0], category="theme", rank=4))
        with pytest.raises(IntegrityError):
            await db.commit()
    async with sessions() as db:
        contest = await db.get(Contest, ctx.contest_id)
        contest.voting_format = "approval"
        with pytest.raises(IntegrityError):
            await db.commit()


@pytest.mark.asyncio
async def test_admins_alone_can_watch_live_tallies_during_voting(sessions):
    import httpx
    from app.api.deps import get_db
    from app.main import app
    from app.services.auth_service import create_access_token
    ctx = await seed(sessions)
    p = ctx.sub_ids
    await ballot(sessions, ctx, 0, [p[1], p[2], p[3]], favorite=p[1])
    await ballot(sessions, ctx, 4, [p[2], p[1], p[3]])
    classic = await seed(sessions, voting_format="classic", month="2026-09", users=ctx)
    await classic_ballot(sessions, classic, 0, theme=[classic.sub_ids[2], classic.sub_ids[1]], favorite=[classic.sub_ids[2]])

    def auth(user_id):
        return {"Authorization": "Bearer " + create_access_token(str(user_id))}

    async def test_db():
        async with sessions() as db:
            yield db

    app.dependency_overrides[get_db] = test_db
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            url = f"/api/v1/contests/{ctx.contest_id}/live-tallies"
            assert (await client.get(url)).status_code == 401
            assert (await client.get(url, headers=auth(ctx.user_ids[1]))).status_code == 403
            live = (await client.get(url, headers=auth(ctx.admin_id))).json()
            classic_live = (await client.get(f"/api/v1/contests/{classic.contest_id}/live-tallies",
                                             headers=auth(ctx.admin_id))).json()
            public = (await client.get(f"/api/v1/contests/{ctx.contest_id}", headers=auth(ctx.user_ids[1]))).json()
    finally:
        app.dependency_overrides.clear()

    # Photo 1: 3 + 2 + favorite = 6; photo 2: 2 + 3 = 5; photo 3: 1 + 1 = 2.
    assert (live["votingFormat"], live["status"], live["ballots"]) == ("points", "voting", 2)
    assert [(t["submissionId"], t["score"]["total"], t["score"]["rank"]) for t in live["submissions"][:3]] == [
        (p[1], 6, 1), (p[2], 5, 2), (p[3], 2, 3),
    ]
    assert all(t["categoryVotes"] is None for t in live["submissions"])
    assert (classic_live["votingFormat"], classic_live["ballots"]) == ("classic", 1)
    top = classic_live["submissions"][0]
    assert top["submissionId"] == classic.sub_ids[2] and top["categoryVotes"] == {"theme": 1, "favorite": 1, "wildcard": 0}
    # Members still see no results while voting is open.
    assert all(s["score"] is None and s["categoryVotes"] is None for s in public["submissions"])
