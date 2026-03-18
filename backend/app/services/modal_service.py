"""Modal service — calls the deployed FLUX web endpoint to generate avatar images."""

import httpx
import base64
from pathlib import Path
from app.config import settings

MODAL_ENDPOINT_URL: str = settings.MODAL_ENDPOINT_URL
MODAL_TOKEN_ID: str = settings.MODAL_TOKEN_ID
MODAL_TOKEN_SECRET: str = settings.MODAL_TOKEN_SECRET



def build_avatar_prompt(
    gender: str,
    age: int,
    country: str,
    build: str,
    eyes: str,
    hair_color: str,
    hairstyle: str,
    clothing: str,
    breast_size: str | None = None,
    extra: str = "",
) -> str:
    """Convert avatar form parameters into a FLUX-optimized prompt."""

    ethnicity_map = {
        "Japón": "Japanese",
        "Estados Unidos": "American",
        "Brasil": "Brazilian",
        "Rusia": "Russian",
        "Corea": "Korean",
        "China": "Chinese",
        "México": "Mexican",
        "Colombia": "Colombian",
        "España": "Spanish",
        "Egipto": "Egyptian",
        "Francia": "French",
        "Ninguno específico": "",
    }

    build_map = {
        "Muscular": "muscular athletic",
        "Atlética": "athletic toned",
        "Delgada": "slim",
        "Curvy": "curvy",
        "Robusta": "full-figured",
    }

    clothing_map = {
        "Casual / Streetwear": "casual streetwear outfit",
        "Elegante / Vestido de noche": "elegant evening dress",
        "Ropa interior / Lingerie": "lingerie",
        "Traje de baño / Bikini": "swimsuit bikini",
        "Traje ejecutivo": "professional business suit",
        "Cyberpunk Scifi": "cyberpunk sci-fi outfit",
    }

    breast_map = {
        "Pequeño": "small chest",
        "Mediano": "medium chest",
        "Grande": "large chest",
        "Muy Grande": "very large chest",
    }

    ethnicity = ethnicity_map.get(country, "")
    body = build_map.get(build, build)
    outfit = clothing_map.get(clothing, clothing)

    parts = [
        "high-end fashion photography, professional DSLR portrait",
        f"realistic 8k UHD of a {age} year old",
        f"{ethnicity} {gender.lower()}" if ethnicity else gender.lower(),
        f"{body} body",
        f"{eyes} eyes, highly detailed iris",
        f"{hair_color} {hairstyle} hair, individual strands visible",
    ]

    if gender == "Mujer" and breast_size:
        parts.append(breast_map.get(breast_size, ""))

    parts += [
        f"wearing {outfit}",
        "raw photo, masterpiece, 85mm lens, f/1.8, bokeh, natural skin texture, visible pores, professional studio lighting, cinematic color grading, sharp focus",
    ]

    if extra.strip():
        parts.append(extra.strip())

    return ", ".join(p for p in parts if p)


async def generate_avatar_image(prompt: str, base_image_b64: str | None = None, strength: float = 0.85) -> str:
    """
    Call the Modal web endpoint and return a base64-encoded PNG string.
    Raises httpx.HTTPStatusError on failure.
    """
    if not MODAL_ENDPOINT_URL:
        raise ValueError(
            "MODAL_ENDPOINT_URL no configurado. Corre: modal deploy modal_app.py y copia la URL al .env"
        )

    payload = {
        "prompt": prompt,
        "width": 768,
        "height": 1024,
        "steps": 28,
    }
    
    if base_image_b64:
        payload["init_image_b64"] = base_image_b64
        payload["strength"] = strength

    # Modal web endpoints accept token auth via Basic Auth
    auth = (MODAL_TOKEN_ID, MODAL_TOKEN_SECRET) if MODAL_TOKEN_ID else None

    async with httpx.AsyncClient(timeout=600.0, follow_redirects=True) as client:
        response = await client.post(
            MODAL_ENDPOINT_URL,
            json=payload,
            auth=auth,
        )
        response.raise_for_status()
        data = response.json()
        return data["image_b64"]


async def save_avatar_image(b64_str: str, filename: str) -> str:
    """Save base64 image to local storage dir. Returns relative URL."""
    storage_dir = Path("storage/avatars")
    storage_dir.mkdir(parents=True, exist_ok=True)

    img_bytes = base64.b64decode(b64_str)
    filepath = storage_dir / filename
    filepath.write_bytes(img_bytes)
    return f"/storage/avatars/{filename}"
