import asyncio
import logging
import math
import random
from datetime import datetime, timezone

import bleach
import markdown
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..rate_limit import limiter, PUBLIC_POST

from ..models.newsletter import Newsletter
from ..models.subscriber import NewsletterSubscriber
from ..models.user import User
from ..schemas.common import PaginatedResponse
from ..schemas.newsletter import (
    NewsletterCreate,
    NewsletterResponse,
    NewsletterSendResponse,
    NewsletterUpdate,
    SubscribeRequest,
    SubscriberResponse,
)
from ..services.email_service import send_newsletter_email
from .activity import log_activity
from .deps import get_db, require_admin, verify_turnstile_token

logger = logging.getLogger(__name__)

router = APIRouter()


_BLEACH_ALLOWED_TAGS = [
    "p", "h1", "h2", "h3", "h4", "h5", "h6",
    "a", "strong", "em", "ul", "ol", "li", "br", "img",
    "blockquote", "code", "pre", "hr",
    "table", "thead", "tbody", "tr", "th", "td",
]
_BLEACH_ALLOWED_ATTRS = {
    "a": ["href", "title", "target", "rel"],
    "img": ["src", "alt", "title", "width", "height"],
    "th": ["align"],
    "td": ["align"],
}


def _render_md(body_md: str) -> str:
    raw_html = markdown.markdown(body_md, extensions=["extra"])
    return bleach.clean(
        raw_html,
        tags=_BLEACH_ALLOWED_TAGS,
        attributes=_BLEACH_ALLOWED_ATTRS,
        strip=True,
    )


async def _send_newsletter_emails(
    nl: Newsletter, db: AsyncSession, admin: User
) -> tuple[int, int]:
    """Send newsletter to all active subscribers. Returns (sent_count, failed_count)."""
    result = await db.execute(
        select(NewsletterSubscriber).where(NewsletterSubscriber.is_active == True)  # noqa: E712
    )
    subscribers = result.scalars().all()

    sem = asyncio.Semaphore(5)

    async def _send_one(sub: NewsletterSubscriber) -> tuple[str, bool]:
        async with sem:
            try:
                await send_newsletter_email(sub.email, sub.name, nl.title, nl.html)
                return (sub.email, True)
            except Exception:
                logger.error("Failed to send newsletter %s to %s", nl.id, sub.email, exc_info=True)
                return (sub.email, False)

    results = await asyncio.gather(*[_send_one(s) for s in subscribers])
    sent = sum(1 for _, ok in results if ok)
    failed = sum(1 for _, ok in results if not ok)
    return sent, failed


def _newsletter_to_response(nl: Newsletter) -> NewsletterResponse:
    return NewsletterResponse(
        id=nl.id,
        title=nl.title,
        date=nl.date,
        category=nl.category,
        author=nl.author,
        preview=nl.preview,
        featured=nl.featured,
        html=nl.html,
        body_md=nl.body_md,
        emailed_at=nl.emailed_at,
    )


@router.get("/categories", response_model=list[str])
async def list_categories(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Newsletter.category).distinct().order_by(Newsletter.category)
    )
    return list(result.scalars().all())


@router.post("/subscribe", response_model=SubscriberResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit(PUBLIC_POST)
async def subscribe(request: Request, body: SubscribeRequest, db: AsyncSession = Depends(get_db)):
    # Honeypot: if filled, return fake success
    if body.phone:
        return SubscriberResponse(
            id=random.randint(100, 99999), email=body.email, name=body.name,
            is_active=True, subscribed_at=datetime.now(timezone.utc),
        )
    await verify_turnstile_token(body.turnstile_token)
    result = await db.execute(
        select(NewsletterSubscriber).where(NewsletterSubscriber.email == body.email)
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        if existing.is_active:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Email already subscribed"
            )
        # Re-activate inactive subscriber
        existing.is_active = True
        existing.name = body.name
        await db.commit()
        await db.refresh(existing)
        return SubscriberResponse(
            id=existing.id,
            email=existing.email,
            name=existing.name,
            is_active=existing.is_active,
            subscribed_at=existing.subscribed_at,
        )
    subscriber = NewsletterSubscriber(email=body.email, name=body.name)
    db.add(subscriber)
    await db.commit()
    await db.refresh(subscriber)
    return SubscriberResponse(
        id=subscriber.id,
        email=subscriber.email,
        name=subscriber.name,
        is_active=subscriber.is_active,
        subscribed_at=subscriber.subscribed_at,
    )


@router.get("/subscribers", response_model=PaginatedResponse[SubscriberResponse])
async def list_subscribers(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    count_result = await db.execute(select(func.count()).select_from(NewsletterSubscriber))
    total = count_result.scalar_one()

    result = await db.execute(
        select(NewsletterSubscriber)
        .order_by(NewsletterSubscriber.subscribed_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    subscribers = result.scalars().all()

    return PaginatedResponse(
        items=[
            SubscriberResponse(
                id=s.id, email=s.email, name=s.name, is_active=s.is_active, subscribed_at=s.subscribed_at
            )
            for s in subscribers
        ],
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total > 0 else 0,
    )


@router.patch("/subscribers/{subscriber_id}", response_model=SubscriberResponse)
async def toggle_subscriber(
    subscriber_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(NewsletterSubscriber).where(NewsletterSubscriber.id == subscriber_id)
    )
    subscriber = result.scalar_one_or_none()
    if subscriber is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscriber not found")
    subscriber.is_active = not subscriber.is_active
    await db.commit()
    await db.refresh(subscriber)
    return SubscriberResponse(
        id=subscriber.id,
        email=subscriber.email,
        name=subscriber.name,
        is_active=subscriber.is_active,
        subscribed_at=subscriber.subscribed_at,
    )


@router.delete("/subscribers/{subscriber_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subscriber(
    subscriber_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(NewsletterSubscriber).where(NewsletterSubscriber.id == subscriber_id)
    )
    subscriber = result.scalar_one_or_none()
    if subscriber is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscriber not found")
    await db.delete(subscriber)
    await db.commit()


@router.get("", response_model=PaginatedResponse[NewsletterResponse])
async def list_newsletters(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    category: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    base_query = select(Newsletter)
    count_query = select(func.count()).select_from(Newsletter)

    if category is not None:
        base_query = base_query.where(Newsletter.category == category)
        count_query = count_query.where(Newsletter.category == category)

    count_result = await db.execute(count_query)
    total = count_result.scalar_one()

    result = await db.execute(
        base_query.order_by(Newsletter.date.desc()).offset((page - 1) * page_size).limit(page_size)
    )
    newsletters = result.scalars().all()

    return PaginatedResponse(
        items=[_newsletter_to_response(nl) for nl in newsletters],
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total > 0 else 0,
    )


@router.get("/{newsletter_id}", response_model=NewsletterResponse)
async def get_newsletter(newsletter_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Newsletter).where(Newsletter.id == newsletter_id))
    nl = result.scalar_one_or_none()
    if nl is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Newsletter not found")
    return _newsletter_to_response(nl)


@router.post("", response_model=NewsletterResponse, status_code=status.HTTP_201_CREATED)
async def create_newsletter(
    body: NewsletterCreate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    nl = Newsletter(
        id=body.id,
        title=body.title,
        date=body.date,
        category=body.category,
        author=body.author,
        preview=body.preview,
        featured=body.featured,
        body_md=body.body_md,
        html=_render_md(body.body_md),
    )
    db.add(nl)
    await log_activity(db, admin, "create", "newsletter", body.id, f"Created newsletter: {body.title}")
    await db.commit()
    await db.refresh(nl)

    if body.send_to_subscribers:
        sent, failed = await _send_newsletter_emails(nl, db, admin)
        nl.emailed_at = datetime.now(timezone.utc)
        await log_activity(
            db, admin, "send", "newsletter", nl.id,
            f"Emailed newsletter '{nl.title}' to {sent} subscribers ({failed} failed)",
        )
        await db.commit()
        await db.refresh(nl)

    return _newsletter_to_response(nl)


@router.post("/{newsletter_id}/send", response_model=NewsletterSendResponse)
async def send_newsletter(
    newsletter_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Newsletter).where(Newsletter.id == newsletter_id))
    nl = result.scalar_one_or_none()
    if nl is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Newsletter not found")

    # Count active subscribers
    count_result = await db.execute(
        select(func.count()).select_from(NewsletterSubscriber).where(
            NewsletterSubscriber.is_active == True  # noqa: E712
        )
    )
    total_subscribers = count_result.scalar_one()

    sent, failed = await _send_newsletter_emails(nl, db, admin)
    nl.emailed_at = datetime.now(timezone.utc)
    await log_activity(
        db, admin, "send", "newsletter", nl.id,
        f"Emailed newsletter '{nl.title}' to {sent} subscribers ({failed} failed)",
    )
    await db.commit()
    await db.refresh(nl)

    return NewsletterSendResponse(
        newsletter_id=nl.id,
        total_subscribers=total_subscribers,
        sent_count=sent,
        failed_count=failed,
        emailed_at=nl.emailed_at,
    )


@router.put("/{newsletter_id}", response_model=NewsletterResponse)
async def update_newsletter(
    newsletter_id: str,
    body: NewsletterUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Newsletter).where(Newsletter.id == newsletter_id))
    nl = result.scalar_one_or_none()
    if nl is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Newsletter not found")
    if body.title is not None:
        nl.title = body.title
    if body.date is not None:
        nl.date = body.date
    if body.category is not None:
        nl.category = body.category
    if body.author is not None:
        nl.author = body.author
    if body.preview is not None:
        nl.preview = body.preview
    if body.featured is not None:
        nl.featured = body.featured
    if body.body_md is not None:
        nl.body_md = body.body_md
        nl.html = _render_md(body.body_md)
    await db.commit()
    await db.refresh(nl)
    return _newsletter_to_response(nl)


@router.delete("/{newsletter_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_newsletter(
    newsletter_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Newsletter).where(Newsletter.id == newsletter_id))
    nl = result.scalar_one_or_none()
    if nl is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Newsletter not found")
    await db.delete(nl)
    await db.commit()
