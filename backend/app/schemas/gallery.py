from .common import CamelModel


class PhotoExifSchema(CamelModel):
    camera: str | None = None
    focal_length: str | None = None
    iso: int | None = None
    aperture: str | None = None
    shutter_speed: str | None = None


class GalleryPhotoResponse(CamelModel):
    """Matches the frontend GalleryPhoto interface."""

    id: int
    url: str
    title: str
    photographer: str
    exif: PhotoExifSchema | None = None
    visible: bool = True
    contest_id: int | None = None
    contest_submission_id: int | None = None
    is_winner: bool = False
    winner_place: int | None = None
    winner_category: str | None = None
    winner_placements: list[dict] | None = None
    like_count: int = 0
    comment_count: int = 0
    viewer_has_liked: bool | None = None  # null when unauthenticated


class GalleryPhotoUpdate(CamelModel):
    url: str | None = None
    title: str | None = None
    photographer: str | None = None
    member_id: int | None = None
    exif: PhotoExifSchema | None = None
    visible: bool | None = None
