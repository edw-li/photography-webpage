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


class GalleryPhotoCreate(CamelModel):
    url: str
    title: str
    photographer: str
    member_id: int | None = None
    exif: PhotoExifSchema | None = None


class GalleryPhotoUpdate(CamelModel):
    url: str | None = None
    title: str | None = None
    photographer: str | None = None
    member_id: int | None = None
    exif: PhotoExifSchema | None = None
