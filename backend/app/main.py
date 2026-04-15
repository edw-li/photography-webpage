import logging
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator
from pathlib import Path

logging.basicConfig(level=logging.INFO)

# Register HEIC/HEIF codec with Pillow so Image.open() can read Apple HEIC files.
from pillow_heif import register_heif_opener  # noqa: E402
register_heif_opener()

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded

from .config import settings
from .rate_limit import limiter
from .api import auth, members, gallery, events, newsletters, contests, contact, activity, uploads


logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    if not settings.turnstile_enabled:
        logger.warning(
            "Cloudflare Turnstile CAPTCHA is DISABLED. "
            "Set TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY to enable."
        )
    yield


app = FastAPI(title="Photography Club API", version="1.0.0", lifespan=lifespan)

# Rate limiting
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Rate limit exceeded. Try again later."},
    )


# CSRF: Accepted risk. All state-changing endpoints use Bearer token auth (not
# cookies), so CSRF attacks cannot forge requests. Cloudflare provides an
# additional protection layer. If cookie-based auth is ever added, CSRF tokens
# must be introduced.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next) -> Response:
    response: Response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' https://challenges.cloudflare.com; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: https: blob:; "
        "connect-src 'self' https://challenges.cloudflare.com; "
        "frame-src https://challenges.cloudflare.com;"
    )
    return response


app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(members.router, prefix="/api/v1/members", tags=["members"])
app.include_router(gallery.router, prefix="/api/v1/gallery", tags=["gallery"])
app.include_router(events.router, prefix="/api/v1/events", tags=["events"])
app.include_router(newsletters.router, prefix="/api/v1/newsletters", tags=["newsletters"])
app.include_router(contests.router, prefix="/api/v1/contests", tags=["contests"])
app.include_router(contact.router, prefix="/api/v1/contact", tags=["contact"])
app.include_router(activity.router, prefix="/api/v1/activity", tags=["activity"])
app.include_router(uploads.router, prefix="/api/v1/uploads", tags=["uploads"])

# Mount static files for uploaded images (local dev only; OCI mode serves from cloud)
if not settings.oci_configured:
    upload_path = Path(settings.upload_dir)
    upload_path.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=str(upload_path)), name="uploads")


@app.get("/api/health")
async def health_check():
    return {"status": "ok"}
