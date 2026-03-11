import math
import random
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..rate_limit import limiter, PUBLIC_POST

from ..models.contact import ContactSubmission
from ..models.user import User
from ..schemas.common import PaginatedResponse
from ..schemas.contact import ContactReplyRequest, ContactSubmissionCreate, ContactSubmissionResponse
from ..services.email_service import send_contact_reply_email
from .activity import log_activity
from .deps import get_db, require_admin, verify_turnstile_token

router = APIRouter()


def _submission_to_response(s: ContactSubmission) -> ContactSubmissionResponse:
    return ContactSubmissionResponse(
        id=s.id,
        name=s.name,
        email=s.email,
        message=s.message,
        created_at=s.created_at,
        replied=s.replied,
        replied_at=s.replied_at,
        replied_by=s.replied_by,
        reply_message=s.reply_message,
    )


@router.post("", response_model=ContactSubmissionResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit(PUBLIC_POST)
async def create_contact(request: Request, body: ContactSubmissionCreate, db: AsyncSession = Depends(get_db)):
    # Honeypot: if filled, return fake success
    if body.website:
        return ContactSubmissionResponse(
            id=random.randint(100, 99999), name=body.name, email=body.email, message=body.message,
            created_at=datetime.now(timezone.utc), replied=False,
        )
    await verify_turnstile_token(body.turnstile_token)
    submission = ContactSubmission(name=body.name, email=body.email, message=body.message)
    db.add(submission)
    await db.commit()
    await db.refresh(submission)
    return _submission_to_response(submission)


@router.get("", response_model=PaginatedResponse[ContactSubmissionResponse])
async def list_contacts(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    count_result = await db.execute(select(func.count()).select_from(ContactSubmission))
    total = count_result.scalar_one()

    result = await db.execute(
        select(ContactSubmission)
        .order_by(ContactSubmission.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    submissions = result.scalars().all()

    return PaginatedResponse(
        items=[_submission_to_response(s) for s in submissions],
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total > 0 else 0,
    )


@router.post("/{submission_id}/reply", response_model=ContactSubmissionResponse)
async def reply_to_contact(
    submission_id: int,
    body: ContactReplyRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if not body.reply_body or not body.reply_body.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Reply body cannot be empty",
        )

    result = await db.execute(
        select(ContactSubmission).where(ContactSubmission.id == submission_id)
    )
    submission = result.scalar_one_or_none()
    if submission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

    # Send email first — if SMTP fails, DB stays unchanged
    await send_contact_reply_email(
        to=submission.email,
        visitor_name=submission.name,
        reply_text=body.reply_body.strip(),
        original_message=submission.message,
    )

    submission.replied = True
    submission.replied_at = datetime.now(timezone.utc)
    submission.replied_by = admin.email
    submission.reply_message = body.reply_body.strip()

    await log_activity(
        db,
        admin,
        action="send",
        entity_type="contact",
        entity_id=str(submission.id),
        description=f"Replied to contact from {submission.name}",
    )
    await db.commit()
    await db.refresh(submission)
    return _submission_to_response(submission)


@router.delete("/{submission_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contact(
    submission_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ContactSubmission).where(ContactSubmission.id == submission_id)
    )
    submission = result.scalar_one_or_none()
    if submission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")
    await db.delete(submission)
    await db.commit()
