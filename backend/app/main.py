import logging
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator
from pathlib import Path

logging.basicConfig(level=logging.INFO)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import settings
from .api import auth, members, gallery, events, newsletters, contests, contact, activity, uploads


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    yield


app = FastAPI(title="Photography Club API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(members.router, prefix="/api/v1/members", tags=["members"])
app.include_router(gallery.router, prefix="/api/v1/gallery", tags=["gallery"])
app.include_router(events.router, prefix="/api/v1/events", tags=["events"])
app.include_router(newsletters.router, prefix="/api/v1/newsletters", tags=["newsletters"])
app.include_router(contests.router, prefix="/api/v1/contests", tags=["contests"])
app.include_router(contact.router, prefix="/api/v1/contact", tags=["contact"])
app.include_router(activity.router, prefix="/api/v1/activity", tags=["activity"])
app.include_router(uploads.router, prefix="/api/v1/uploads", tags=["uploads"])

# Mount static files for uploaded images
upload_path = Path(settings.upload_dir)
upload_path.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(upload_path)), name="uploads")


@app.get("/api/health")
async def health_check():
    return {"status": "ok"}
