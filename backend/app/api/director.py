import httpx
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.director_service import director_service
from app.services.billing_service import billing_service
from app.api.deps import get_current_user
from app.database import get_db
from app.models.user import User

router = APIRouter()

class PlanRequest(BaseModel):
    idea: str
    target_duration_sec: int = 15
    style: str = "cinematic"

class ShotModel(BaseModel):
    order: int
    prompt: str
    camera_movement: str
    lighting: str
    mood: str
    dialogue: Optional[str] = None
    negative_prompt: Optional[str] = None
    duration_target_sec: int

class RefineRequest(BaseModel):
    shot: ShotModel
    feedback: str

class RefineSequenceRequest(BaseModel):
    shots: List[ShotModel]
    feedback: str

# Cost per LLM usage (Director Brain)
DIRECTOR_COST_CREDITS = 0.05

@router.post("/plan")
async def plan_video(
    request: PlanRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        await billing_service.deduct_credits(db, user.id, DIRECTOR_COST_CREDITS, "Director AI: Generar Plan")
        result = await director_service.plan_video(
            request.idea, 
            request.target_duration_sec, 
            request.style
        )
        return result
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/refine", response_model=ShotModel)
async def refine_shot(
    request: RefineRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        await billing_service.deduct_credits(db, user.id, DIRECTOR_COST_CREDITS, "Director AI: Refinar Shot")
        shot_dict = request.shot.model_dump()
        result = await director_service.refine_shot(shot_dict, request.feedback)
        return result
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/refine-sequence")
async def refine_sequence(
    request: RefineSequenceRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        await billing_service.deduct_credits(db, user.id, DIRECTOR_COST_CREDITS, "Director AI: Refinar Secuencia")
        shots_list = [shot.model_dump() for shot in request.shots]
        result = await director_service.refine_sequence(shots_list, request.feedback)
        return result
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/health")
async def health_check():
    try:
        # We assume True if the service instance is initialized
        # In a real scenario we'd ping the Modal endpoint
        return {"status": "online", "model": director_service.model}
    except Exception:
        pass
    return {"status": "offline"}
