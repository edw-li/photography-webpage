from datetime import datetime
from uuid import UUID
from pydantic import Field, field_validator

from .common import CamelModel


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
    # Submission time — used to order tied placements (earlier first).
    # Withheld (None) during anonymous voting.
    created_at: datetime | None = None
    revision: int = 1
    updated_at: datetime | None = None
    image_submitted_at: datetime | None = None


class ContestWinnerSchema(CamelModel):
    submission_id: int
    place: int
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
    submissions: list[ContestSubmissionResponse]
    winners: list[ContestWinnerSchema] | None = None
    user_submission_count: int | None = None
    user_has_voted: bool | None = None
    can_manage_submissions: bool = False
    submission_lock_reason: str | None = None


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


class BatchVoteRequest(CamelModel):
    votes: list[CategoryVoteRequest]


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


class MyResultsContestSchema(CamelModel):
    contest_id: int
    month: str
    theme: str
    wildcard_category: str | None = None
    has_wildcard: bool
    theme_result: CategoryResultSchema
    favorite_result: CategoryResultSchema
    wildcard_result: CategoryResultSchema


class LeaderboardRankingSchema(CamelModel):
    value: int
    rank: int
    total_members: int


class MyResultsStatsSchema(CamelModel):
    total_submissions: int
    total_votes: int
    first_place_finishes: int
    second_place_finishes: int
    third_place_finishes: int
    podium_finishes: int
    contests_entered: int
    total_completed_contests: int
    participation_rate: float
    best_category: str | None = None


class MyResultsLeaderboardSchema(CamelModel):
    first_place: LeaderboardRankingSchema
    second_place: LeaderboardRankingSchema
    third_place: LeaderboardRankingSchema
    total_podium: LeaderboardRankingSchema
    total_votes: LeaderboardRankingSchema


class MyResultsResponseSchema(CamelModel):
    stats: MyResultsStatsSchema
    leaderboard: MyResultsLeaderboardSchema
    contests: list[MyResultsContestSchema]
