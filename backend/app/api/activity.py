import math

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.activity import ActivityLog
from ..models.user import User
from ..schemas.common import CamelModel, PaginatedResponse
from .deps import get_db, require_admin

router = APIRouter()


class ActivityResponse(CamelModel):
    id: int
    action: str
    entity_type: str
    entity_id: str
    description: str
    admin_email: str
    created_at: str


async def log_activity(
    db: AsyncSession,
    user: User,
    action: str,
    entity_type: str,
    entity_id: str,
    description: str,
) -> None:
    entry = ActivityLog(
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id),
        description=description,
        admin_email=user.email,
    )
    db.add(entry)
    await db.flush()


@router.get("", response_model=PaginatedResponse[ActivityResponse])
async def list_activity(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    count_result = await db.execute(select(func.count()).select_from(ActivityLog))
    total = count_result.scalar_one()

    result = await db.execute(
        select(ActivityLog)
        .order_by(ActivityLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    logs = result.scalars().all()

    return PaginatedResponse(
        items=[
            ActivityResponse(
                id=log.id,
                action=log.action,
                entity_type=log.entity_type,
                entity_id=log.entity_id,
                description=log.description,
                admin_email=log.admin_email,
                created_at=log.created_at.isoformat(),
            )
            for log in logs
        ],
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total > 0 else 0,
    )
