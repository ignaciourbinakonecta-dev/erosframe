"""Avatar generation API router."""

import uuid
import os
import base64
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, Dict, Any

from app.api.deps import get_current_user
from app.database import get_db
from app.services.modal_service import build_avatar_prompt, generate_avatar_image, save_avatar_image
from app.models.avatar import Avatar

router = APIRouter(prefix="/avatars", tags=["Avatars"])

GENERATION_COST = 10  # créditos por generación


class AvatarListItem(BaseModel):
    id: int
    name: str
    texture_url: str
    status: str
    created_at: str
    morphs: Optional[Dict[str, Any]] = None
    styles: Optional[Dict[str, Any]] = None

    model_config = {"from_attributes": True}


@router.get("/", response_model=list[AvatarListItem])
async def list_avatars(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all saved avatars for the current user."""
    from sqlalchemy import select
    result = await db.execute(
        select(Avatar)
        .where(Avatar.user_id == current_user.id)
        .order_by(Avatar.created_at.desc())
    )
    avatars = result.scalars().all()
    return [
        AvatarListItem(
            id=a.id,
            name=a.name,
            texture_url=a.reference_pack_url or "",
            status=a.status,
            created_at=str(a.created_at),
            morphs=(a.metadata_json or {}).get("morphs"),
            styles=(a.metadata_json or {}).get("styles"),
        )
        for a in avatars
    ]


@router.delete("/{avatar_id}", status_code=204)
async def delete_avatar(
    avatar_id: int,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a saved avatar from DB and disk."""
    from sqlalchemy import select
    result = await db.execute(
        select(Avatar).where(Avatar.id == avatar_id, Avatar.user_id == current_user.id)
    )
    avatar = result.scalar_one_or_none()
    if not avatar:
        raise HTTPException(status_code=404, detail="Avatar no encontrado")

    # Remove file from disk
    if avatar.reference_pack_url:
        file_path = avatar.reference_pack_url.lstrip("/")
        if os.path.exists(file_path):
            os.remove(file_path)

    await db.delete(avatar)
    await db.commit()


class PortraitGenerateRequest(BaseModel):
    prompt: str


@router.post("/generate-portrait")
async def generate_portrait(
    req: PortraitGenerateRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate a 2D portrait image using Modal FLUX and deduct credits."""
    from app.models.user import User
    from sqlalchemy import select
    import httpx

    # Check credits
    result = await db.execute(select(User).where(User.id == current_user.id))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    current_credits = float(user.credits or 0)
    # Portraits cost 10 credits
    cost = 10.0
    if current_credits < cost:
        raise HTTPException(
            status_code=402,
            detail=f"Créditos insuficientes. Necesitas {cost}, tienes {int(current_credits)}.",
        )

    # Call Modal Service for 2D Image
    try:
        # We reuse the existing modal_service function which correctly points to the FLUX endpoint
        from app.services.modal_service import generate_avatar_image
        image_b64 = await generate_avatar_image(req.prompt)
        
        if not image_b64:
            raise HTTPException(status_code=500, detail="No image returned from Modal FLUX")

        # Deduct credits
        user.credits = current_credits - cost
        await db.commit()

        return {"image_b64": image_b64, "prompt_used": req.prompt, "credits_deducted": cost}
            
    except Exception as e:
        import traceback
        with open("error_log.txt", "w", encoding="utf-8") as f:
            f.write(traceback.format_exc())
        print(f"Error calling Modal FLUX for portrait: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class AvatarGenerateRequest(BaseModel):
    gender: str = "Mujer"
    age: int = 26
    height: int = 170
    weight: int = 60
    build: str = "Atlética"
    country: str = "Ninguno específico"
    eyes: str = "Ambar"
    hairstyle: str = "Blunt bob"
    hair_color: str = "Negro"
    breast_size: Optional[str] = None
    clothing: str = "Casual / Streetwear"
    extra_prompt: str = ""
    base_image_b64: Optional[str] = None
    strength: Optional[float] = 0.85


class AvatarGenerateResponse(BaseModel):
    image_b64: str
    prompt_used: str
    credits_deducted: int


@router.post("/generate", response_model=AvatarGenerateResponse)
async def generate_avatar(
    req: AvatarGenerateRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate an avatar image using Modal FLUX and deduct credits."""

    # Check credits (users have credits stored as float)
    from app.models.user import User
    from sqlalchemy import select

    result = await db.execute(select(User).where(User.id == current_user.id))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    current_credits = float(user.credits or 0)
    if current_credits < GENERATION_COST:
        raise HTTPException(
            status_code=402,
            detail=f"Créditos insuficientes. Necesitas {GENERATION_COST}, tienes {int(current_credits)}.",
        )

    # Build prompt
    prompt = build_avatar_prompt(
        gender=req.gender,
        age=req.age,
        country=req.country,
        build=req.build,
        eyes=req.eyes,
        hair_color=req.hair_color,
        hairstyle=req.hairstyle,
        clothing=req.clothing,
        breast_size=req.breast_size,
        extra=req.extra_prompt,
    )

    # Call Modal
    try:
        image_b64 = await generate_avatar_image(prompt, req.base_image_b64, req.strength)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error en generación: {str(e)}")

    # Deduct credits
    user.credits = current_credits - GENERATION_COST
    await db.commit()

    return AvatarGenerateResponse(
        image_b64=image_b64,
        prompt_used=prompt,
        credits_deducted=GENERATION_COST,
    )

@router.post("/professional/generate")
async def generate_professional_avatar(
    req: dict,
    # current_user=Depends(get_current_user),
):
    """Proxy request to Modal Blender service to avoid CORS and handle auth."""
    import httpx
    
    MODAL_PROFESSIONAL_URL = "https://ignaciourbinakonecta--blender-avatar-service-api-generate.modal.run"
    
    async with httpx.AsyncClient(timeout=600.0) as client:
        try:
            response = await client.post(
                MODAL_PROFESSIONAL_URL,
                json={"params": req},
                headers={"Content-Type": "application/json"}
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=f"Error en servicio profesional: {e.response.text}")
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Fallo de conexión con servicio profesional: {str(e)}")


SAVE_COST = 0  # Saving is free
AVATAR_STORAGE_DIR = "storage/avatars"


class AvatarSaveRequest(BaseModel):
    name: str = "Mi Avatar"
    image_b64: str              # Full base64 data URL (data:image/png;base64,...) or raw base64
    morphs: Optional[Dict[str, Any]] = None
    styles: Optional[Dict[str, Any]] = None


class AvatarSaveResponse(BaseModel):
    id: int
    name: str
    texture_url: str
    message: str


@router.post("/save", response_model=AvatarSaveResponse)
async def save_avatar(
    req: AvatarSaveRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save a generated avatar texture to local Railway storage and persist metadata in DB."""

    # Strip data URL header if present
    raw_b64 = req.image_b64
    if raw_b64.startswith("data:"):
        raw_b64 = raw_b64.split(",", 1)[1]

    try:
        image_bytes = base64.b64decode(raw_b64)
    except Exception:
        raise HTTPException(status_code=400, detail="Imagen base64 inválida")

    # Ensure storage directory exists
    os.makedirs(AVATAR_STORAGE_DIR, exist_ok=True)

    # Generate a unique filename
    filename = f"avatar_{current_user.id}_{uuid.uuid4().hex[:8]}.png"
    file_path = os.path.join(AVATAR_STORAGE_DIR, filename)

    with open(file_path, "wb") as f:
        f.write(image_bytes)

    # Build the public URL (served by FastAPI's StaticFiles at /storage/...)
    texture_url = f"/storage/avatars/{filename}"

    # Persist in DB
    avatar = Avatar(
        user_id=current_user.id,
        name=req.name,
        source_type="flux_projection",
        source_data=str(req.morphs or {}),
        reference_pack_url=texture_url,
        metadata_json={"styles": req.styles or {}, "morphs": req.morphs or {}},
        status="ready",
    )
    db.add(avatar)
    await db.commit()
    await db.refresh(avatar)

    return AvatarSaveResponse(
        id=avatar.id,
        name=avatar.name,
        texture_url=texture_url,
        message="Avatar guardado correctamente en tu colección.",
    )
