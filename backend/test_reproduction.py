import httpx
import asyncio
import base64
import os
from dotenv import load_dotenv

load_dotenv()

async def test_reproduction():
    url = os.getenv("MODAL_ENDPOINT_URL")
    token_id = os.getenv("MODAL_TOKEN_ID")
    token_secret = os.getenv("MODAL_TOKEN_SECRET")
    
    # Prompt corregido (el mismo que ahora usa el frontend)
    prompt = "Portrait photo, upper body, facing camera directly, neutral lighting, passport style but cinematic, highly detailed face. Person characteristics: género mujer, 25 años de edad, mide 175 cm y pesa 55 kg, etnia latino. Photorealistic, 8k, RAW photo, smooth flawless skin, clean face, studio portrait, sharp focus, no artifacts, no noise, professional quality."
    
    payload = {
        "prompt": prompt,
        "width": 768,
        "height": 1024,
        "steps": 4
    }
    
    headers = {
        "x-modal-token-id": token_id,
        "x-modal-token-secret": token_secret,
        "Content-Type": "application/json"
    }
    
    print(f"Calling Modal with reproduction prompt...")
    async with httpx.AsyncClient(timeout=300.0) as client:
        try:
            response = await client.post(url, json=payload, headers=headers)
            if response.status_code == 200:
                data = response.json()
                img_data = base64.b64decode(data["image_b64"])
                with open("reproduction_output.png", "wb") as f:
                    f.write(img_data)
                print("Image saved to reproduction_output.png")
            else:
                print(f"Error: {response.status_code} - {response.text}")
        except Exception as e:
            print(f"Exception: {e}")

if __name__ == "__main__":
    asyncio.run(test_reproduction())
