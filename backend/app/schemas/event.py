from .common import CamelModel


class RecurrenceRuleSchema(CamelModel):
    frequency: str
    interval: int | None = None
    day_of_week: list[int] | None = None
    week_of_month: list[int] | None = None
    end_date: str | None = None


class EventResponse(CamelModel):
    """Matches the frontend CalendarEvent interface."""

    id: str
    title: str
    description: str
    location: str
    time: str
    end_time: str | None = None
    date: str
    recurrence: RecurrenceRuleSchema | None = None


class EventCreate(CamelModel):
    id: str
    title: str
    description: str
    location: str
    time: str
    end_time: str | None = None
    date: str
    recurrence: RecurrenceRuleSchema | None = None


class EventUpdate(CamelModel):
    title: str | None = None
    description: str | None = None
    location: str | None = None
    time: str | None = None
    end_time: str | None = None
    date: str | None = None
    recurrence: RecurrenceRuleSchema | None = None
