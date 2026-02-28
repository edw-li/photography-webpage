import math

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.event import Event
from ..models.user import User
from ..schemas.common import PaginatedResponse
from ..schemas.event import EventCreate, EventResponse, EventUpdate, RecurrenceRuleSchema
from .deps import get_db, require_admin

router = APIRouter()


def _event_to_response(event: Event) -> EventResponse:
    recurrence = None
    if event.recurrence is not None:
        recurrence = RecurrenceRuleSchema.model_validate(event.recurrence)
    return EventResponse(
        id=event.id,
        title=event.title,
        description=event.description,
        location=event.location,
        time=event.time,
        end_time=event.end_time,
        date=event.date,
        recurrence=recurrence,
    )


@router.get("/all", response_model=list[EventResponse])
async def list_all_events(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Event).order_by(Event.date))
    events = result.scalars().all()
    return [_event_to_response(e) for e in events]


@router.get("", response_model=PaginatedResponse[EventResponse])
async def list_events(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    count_result = await db.execute(select(func.count()).select_from(Event))
    total = count_result.scalar_one()

    result = await db.execute(
        select(Event).order_by(Event.date).offset((page - 1) * page_size).limit(page_size)
    )
    events = result.scalars().all()

    return PaginatedResponse(
        items=[_event_to_response(e) for e in events],
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total > 0 else 0,
    )


@router.get("/{event_id}", response_model=EventResponse)
async def get_event(event_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return _event_to_response(event)


@router.post("", response_model=EventResponse, status_code=status.HTTP_201_CREATED)
async def create_event(
    body: EventCreate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    recurrence_dict = None
    if body.recurrence is not None:
        recurrence_dict = body.recurrence.model_dump(by_alias=True, exclude_none=True)
    event = Event(
        id=body.id,
        title=body.title,
        description=body.description,
        location=body.location,
        time=body.time,
        end_time=body.end_time,
        date=body.date,
        recurrence=recurrence_dict,
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return _event_to_response(event)


@router.put("/{event_id}", response_model=EventResponse)
async def update_event(
    event_id: str,
    body: EventUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    if body.title is not None:
        event.title = body.title
    if body.description is not None:
        event.description = body.description
    if body.location is not None:
        event.location = body.location
    if body.time is not None:
        event.time = body.time
    if body.end_time is not None:
        event.end_time = body.end_time
    if body.date is not None:
        event.date = body.date
    if body.recurrence is not None:
        event.recurrence = body.recurrence.model_dump(by_alias=True, exclude_none=True)
    await db.commit()
    await db.refresh(event)
    return _event_to_response(event)


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(
    event_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    await db.delete(event)
    await db.commit()
