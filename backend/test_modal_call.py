
import httpx
import asyncio
import json

async def test_modal():
    url = "https://ignaciourbinakonecta--avatar-generate.modal.run"
    headers = {
        "Content-Type": "application/json",
        "x-modal-token-id": "wk-zgKLgaMEjSbsJJfCnoGZm4",
        "x-modal-token-secret": "ws-fKNahBbuJRC4OXpd8pnrkO"
    }
    payload = {
        "prompt": "a beautiful landscape, digital art, high quality",
        "width": 512,
        "height": 512,
        "steps": 1
    }
    
    print(f"Calling Modal endpoint: {url}...")
    async with httpx.AsyncClient(timeout=300.0) as client:
        try:
            response = await client.post(url, json=payload, headers=headers)
            print(f"Status Code: {response.status_code}")
            if response.status_code == 200:
                data = response.json()
                b64 = data.get("image_b64", "")
                print(f"Success! Length of b64: {len(b64)}")
                print(f"Start of b64: {b64[:50]}...")
            else:
                print(f"Error Response: {response.text}")
        except Exception as e:
            print(f"Exception: {str(e)}")

if __name__ == "__main__":
    asyncio.run(test_modal())
