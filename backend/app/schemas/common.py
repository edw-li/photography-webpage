from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


def _to_camel(name: str) -> str:
    parts = name.split("_")
    return parts[0] + "".join(w.capitalize() for w in parts[1:])


class CamelModel(BaseModel):
    """Base model that converts snake_case fields to camelCase in JSON output."""

    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=_to_camel,
    )

    # Override to default by_alias=True so FastAPI responses use camelCase
    def model_dump(self, *, by_alias: bool = True, **kwargs: Any) -> dict[str, Any]:
        return super().model_dump(by_alias=by_alias, **kwargs)


class PaginatedResponse(CamelModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int
