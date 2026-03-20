import httpx
import asyncio
import os
from dotenv import load_dotenv

load_dotenv()

async def test_modal():
    url = os.getenv("MODAL_ENDPOINT_URL")
    token_id = os.getenv("MODAL_TOKEN_ID")
    token_secret = os.getenv("MODAL_TOKEN_SECRET")
    
    print(f"Testing URL: {url}")
    
    payload = {
        "prompt": "a professional portrait of a woman, highly detailed",
        "steps": 4
    }
    
    auth = (token_id, token_secret) if token_id else None
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(url, json=payload, auth=auth)
            print(f"Status Code: {response.status_code}")
            print(f"Response headers: {response.headers}")
            print(f"Response text: '{response.text[:500]}'")
            try:
                print(f"JSON: {response.json()}")
            except:
                print("Response is NOT valid JSON")
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_modal())
