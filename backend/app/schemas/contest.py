from .common import CamelModel


class SubmissionExifSchema(CamelModel):
    camera: str | None = None
    focal_length: str | None = None
    aperture: str | None = None
    shutter_speed: str | None = None
    iso: int | None = None


class ContestSubmissionResponse(CamelModel):
    id: int
    url: str
    title: str
    photographer: str
    votes: int | None = None
    exif: SubmissionExifSchema | None = None


class ContestWinnerSchema(CamelModel):
    submission_id: int
    place: int


class HonorableMentionSchema(CamelModel):
    submission_id: int


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
    submissions: list[ContestSubmissionResponse]
    winners: list[ContestWinnerSchema] | None = None
    honorable_mentions: list[HonorableMentionSchema] | None = None


class ContestCreate(CamelModel):
    month: str
    theme: str
    description: str
    status: str = "active"
    deadline: str
    guidelines: list[str]


class ContestUpdate(CamelModel):
    month: str | None = None
    theme: str | None = None
    description: str | None = None
    status: str | None = None
    deadline: str | None = None
    guidelines: list[str] | None = None
    winners: list[ContestWinnerSchema] | None = None
    honorable_mentions: list[HonorableMentionSchema] | None = None


class VoteRequest(CamelModel):
    submission_id: int
