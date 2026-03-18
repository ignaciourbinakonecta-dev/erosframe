"""FastAPI application entry point."""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from app.config import settings
from app.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database on startup."""
    await init_db()
    # Create storage directory
    os.makedirs("storage", exist_ok=True)
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3003",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:3003",
        "https://erosframe.com",
        "https://www.erosframe.com",
        "https://frontend-livid-rho-29.vercel.app",
        "https://frontend-erosframes-projects.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files for local storage
if os.path.exists("storage"):
    app.mount("/storage", StaticFiles(directory="storage"), name="storage")

# Routers
from app.api.auth import router as auth_router
from app.api.projects import router as projects_router
from app.api.jobs import router as jobs_router
from app.api.admin import router as admin_router
from app.api.affiliates import router as affiliate_router
from app.api.reasoning import router as reasoning_router
from app.api.director import router as director_router
from app.api.webhooks import router as webhooks_router
from app.api.avatars import router as avatars_router

app.include_router(auth_router, prefix="/api")
app.include_router(projects_router, prefix="/api")
app.include_router(jobs_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(affiliate_router, prefix="/api")
app.include_router(reasoning_router, prefix="/api")
app.include_router(director_router, prefix="/api/director", tags=["Director Brain"])
app.include_router(webhooks_router, prefix="/api")
app.include_router(avatars_router, prefix="/api")


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
    }


@app.get("/tiers")
async def get_tiers():
    """Public endpoint: list available tiers with their specs."""
    from app.config import TierConfig
    tiers = []
    for tier_num, cfg in TierConfig.TIERS.items():
        tiers.append({
            "tier": tier_num,
            "name": cfg["name"],
            "model": cfg["model"],
            "resolution": cfg["resolution"],
            "fps": cfg["fps"],
            "shots_range": cfg["shots_range"],
            "cost_range": cfg["cost_range"],
            "wait_minutes": cfg["wait_minutes"],
            "clip_duration_range": cfg["clip_duration_range"],
        })
    return tiers
