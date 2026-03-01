import math

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.contact import ContactSubmission
from ..models.user import User
from ..schemas.common import PaginatedResponse
from ..schemas.contact import ContactSubmissionCreate, ContactSubmissionResponse
from .deps import get_db, require_admin

router = APIRouter()


@router.post("", response_model=ContactSubmissionResponse, status_code=status.HTTP_201_CREATED)
async def create_contact(body: ContactSubmissionCreate, db: AsyncSession = Depends(get_db)):
    submission = ContactSubmission(name=body.name, email=body.email, message=body.message)
    db.add(submission)
    await db.commit()
    await db.refresh(submission)
    return ContactSubmissionResponse(
        id=submission.id,
        name=submission.name,
        email=submission.email,
        message=submission.message,
        created_at=submission.created_at,
    )


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
        items=[
            ContactSubmissionResponse(
                id=s.id, name=s.name, email=s.email, message=s.message, created_at=s.created_at
            )
            for s in submissions
        ],
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total > 0 else 0,
    )


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
