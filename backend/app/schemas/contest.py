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
    votes: int | None = None
    exif: SubmissionExifSchema | None = None
    category_votes: CategoryVotesSchema | None = None


class ContestWinnerSchema(CamelModel):
    submission_id: int
    place: int
    category: str = "theme"


class HonorableMentionSchema(CamelModel):
    submission_id: int
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
    honorable_mentions: list[HonorableMentionSchema] | None = None
    user_submission_count: int | None = None
    user_has_voted: bool | None = None


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
