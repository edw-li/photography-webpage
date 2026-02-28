from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class GalleryPhoto(Base):
    __tablename__ = "gallery_photos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    photographer: Mapped[str] = mapped_column(String(200), nullable=False)
    member_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("members.id", ondelete="SET NULL"), nullable=True
    )
    exif_camera: Mapped[str | None] = mapped_column(String(100), nullable=True)
    exif_focal_length: Mapped[str | None] = mapped_column(String(50), nullable=True)
    exif_iso: Mapped[int | None] = mapped_column(Integer, nullable=True)
    exif_aperture: Mapped[str | None] = mapped_column(String(50), nullable=True)
    exif_shutter_speed: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
