import httpx
import asyncio
import base64
import os
from dotenv import load_dotenv

load_dotenv()

async def debug_modal_direct():
    url = os.getenv("MODAL_ENDPOINT_URL")
    token_id = os.getenv("MODAL_TOKEN_ID")
    token_secret = os.getenv("MODAL_TOKEN_SECRET")
    
    if not url:
        print("MODAL_ENDPOINT_URL not found in .env")
        return

    payload = {
        "prompt": "high-end fashion photography, realistic 8k UHD of a 25 year old woman, blue eyes, blonde hair, wearing casual streetwear, natural skin texture",
        "width": 768,
        "height": 1024,
        "steps": 4
    }
    
    headers = {
        "x-modal-token-id": token_id,
        "x-modal-token-secret": token_secret,
        "Content-Type": "application/json"
    }
    
    print(f"Calling Modal directly: {url}")
    async with httpx.AsyncClient(timeout=300.0) as client:
        try:
            response = await client.post(url, json=payload, headers=headers)
            print(f"Status: {response.status_code}")
            if response.status_code == 200:
                data = response.json()
                if "image_b64" in data:
                    img_data = base64.b64decode(data["image_b64"])
                    with open("debug_output.png", "wb") as f:
                        f.write(img_data)
                    print("Image saved to debug_output.png")
                else:
                    print(f"Error: image_b64 not in response. Data: {data}")
            else:
                print(f"Error: {response.text}")
        except Exception as e:
            print(f"Exception: {e}")

if __name__ == "__main__":
    asyncio.run(debug_modal_direct())
