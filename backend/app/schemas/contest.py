from datetime import datetime
from typing import Literal
from uuid import UUID
from pydantic import Field, field_validator, model_validator

from .common import CamelModel

VotingFormat = Literal["classic", "points"]
PointsTiebreak = Literal["theme_points", "first_choice", "second_choice"]


class SubmissionExifSchema(CamelModel):
    camera: str | None = None
    focal_length: str | None = None
    aperture: str | None = None
    shutter_speed: str | None = None
    iso: int | None = None


class CategoryVotesSchema(CamelModel):
    theme: int = 0
    favorite: int = 0
    wildcard: int = 0


class PointsScoreSchema(CamelModel):
    """A photo's result in a completed points contest."""

    total: int
    theme_points: int
    theme_first: int
    theme_second: int
    theme_third: int
    favorite: int
    bonus: int
    # Leaderboard rank; fully tied photos share it (1, 1, 3).
    rank: int
    # Tiebreaker that ordered the photo's group against a neighbouring group
    # with the same total (see PointsScore.tiebreak); None when no other photo
    # has the same total.
    tiebreak: PointsTiebreak | None = None


class ContestSubmissionResponse(CamelModel):
    id: int
    url: str
    title: str
    photographer: str
    is_assigned: bool = False
    is_own: bool = False
    votes: int | None = None
    exif: SubmissionExifSchema | None = None
    category_votes: CategoryVotesSchema | None = None
    # Completed points contests only.
    score: PointsScoreSchema | None = None
    # Submission time — used to order tied placements (earlier first).
    # Withheld (None) during anonymous voting.
    created_at: datetime | None = None
    revision: int = 1
    updated_at: datetime | None = None
    image_submitted_at: datetime | None = None


class ContestWinnerSchema(CamelModel):
    submission_id: int
    place: int
    # theme / favorite / wildcard for classic contests, "overall" for points.
    category: str = "theme"


class ContestResponse(CamelModel):
    id: int
    month: str
    theme: str
    description: str
    status: str
    deadline: str
    submission_count: int
    participant_count: int
    guidelines: list[str]
    wildcard_category: str | None = None
    is_imported: bool = False
    voting_format: VotingFormat
    submissions: list[ContestSubmissionResponse]
    winners: list[ContestWinnerSchema] | None = None
    user_submission_count: int | None = None
    user_has_voted: bool | None = None
    can_manage_submissions: bool = False
    submission_lock_reason: str | None = None


class LiveTallySchema(CamelModel):
    submission_id: int
    # Points contests.
    score: PointsScoreSchema | None = None
    # Classic contests.
    category_votes: CategoryVotesSchema | None = None


class LiveTalliesResponse(CamelModel):
    """Admin-only debugging view: tallies from the ballots cast so far.

    Submissions are ordered best-first; aggregates only, never who voted for what.
    """

    contest_id: int
    voting_format: VotingFormat
    status: str
    # Members who have cast a ballot.
    ballots: int
    submissions: list[LiveTallySchema]


class ContestCreate(CamelModel):
    month: str
    theme: str
    description: str
    status: str = "active"
    deadline: str
    guidelines: list[str]
    wildcard_category: str | None = None


class ContestUpdate(CamelModel):
    month: str | None = None
    theme: str | None = None
    description: str | None = None
    status: str | None = None
    deadline: str | None = None
    guidelines: list[str] | None = None
    wildcard_category: str | None = None


class SubmissionMutation(CamelModel):
    operation_id: UUID
    expected_revision: int | None = Field(default=None, ge=1)
    upload_id: UUID | None = None
    title: str | None = Field(default=None, max_length=300)

    @field_validator("title")
    @classmethod
    def clean_title(cls, value):
        if value is not None:
            value = value.strip()
            if not value:
                raise ValueError("Give your photo a title")
        return value


class CategoryVoteRequest(CamelModel):
    category: str
    submission_ids: list[int]


class PointsBallotRequest(CamelModel):
    """A points ballot: theme picks in rank order (1st choice first)."""

    theme: list[int] = Field(default_factory=list)
    favorite: int | None = None
    # The contest's bonus challenge ("wildcard" category).
    bonus: int | None = None


class BatchVoteRequest(CamelModel):
    # Classic contests send ``votes``; points contests send ``ballot``.
    votes: list[CategoryVoteRequest] | None = None
    ballot: PointsBallotRequest | None = None

    @model_validator(mode="after")
    def one_ballot_shape(self):
        if (self.votes is None) == (self.ballot is None):
            raise ValueError("Send either category votes or a points ballot")
        return self


# --- Admin import schemas ---


class SubmissionVoteTally(CamelModel):
    submission_id: int
    theme: int = 0
    favorite: int = 0
    wildcard: int = 0


class FinalizeContestRequest(CamelModel):
    vote_tallies: list[SubmissionVoteTally]


class SubmissionAssignRequest(CamelModel):
    member_id: int | None = None
    photographer: str


# --- My Results schemas ---


class SubmissionResultSchema(CamelModel):
    """A single submission's result within a category."""

    submission_id: int
    url: str
    title: str
    photographer: str
    place: int | None = None
    exif: SubmissionExifSchema | None = None


class CategoryResultSchema(CamelModel):
    """All of the user's submissions for one (contest, category) cell."""

    has_submission: bool
    best_place: int | None = None
    submissions: list[SubmissionResultSchema] = []


class PointsSubmissionResultSchema(CamelModel):
    """One of the member's photos in a points contest."""

    submission_id: int
    url: str
    title: str
    photographer: str
    place: int | None = None
    score: PointsScoreSchema
    exif: SubmissionExifSchema | None = None


class OverallResultSchema(CamelModel):
    """The member's result in one points contest (photos best-first)."""

    best_place: int | None = None
    best_points: int = 0
    total_points: int = 0
    submissions: list[PointsSubmissionResultSchema] = []


class MyResultsContestSchema(CamelModel):
    contest_id: int
    month: str
    theme: str
    voting_format: VotingFormat
    wildcard_category: str | None = None
    has_wildcard: bool
    # Classic contests only.
    theme_result: CategoryResultSchema | None = None
    favorite_result: CategoryResultSchema | None = None
    wildcard_result: CategoryResultSchema | None = None
    # Points contests only.
    overall_result: OverallResultSchema | None = None


class LeaderboardRankingSchema(CamelModel):
    value: int
    rank: int
    total_members: int


class MyResultsStatsSchema(CamelModel):
    total_submissions: int
    # Votes received in classic contests (points contests award points instead).
    total_votes: int
    # All-time: classic category placements plus overall points placements.
    first_place_finishes: int
    second_place_finishes: int
    third_place_finishes: int
    podium_finishes: int
    contests_entered: int
    total_completed_contests: int
    participation_rate: float
    # Classic contests only: the category with the most placements.
    best_category: str | None = None
    # Points contests only.
    overall_first_place_finishes: int = 0
    overall_second_place_finishes: int = 0
    overall_third_place_finishes: int = 0
    total_points: int = 0
    first_choice_votes: int = 0
    has_classic_results: bool = False
    has_points_results: bool = False


class MyResultsLeaderboardSchema(CamelModel):
    first_place: LeaderboardRankingSchema
    second_place: LeaderboardRankingSchema
    third_place: LeaderboardRankingSchema
    total_podium: LeaderboardRankingSchema
    total_votes: LeaderboardRankingSchema
    total_points: LeaderboardRankingSchema
    first_choice_votes: LeaderboardRankingSchema


class MyResultsResponseSchema(CamelModel):
    stats: MyResultsStatsSchema
    leaderboard: MyResultsLeaderboardSchema
    contests: list[MyResultsContestSchema]
