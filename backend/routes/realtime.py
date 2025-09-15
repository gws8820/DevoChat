import os
import json
import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, Query
from .auth import User, get_current_user

load_dotenv()
router = APIRouter()

@router.get("/session")
async def create_ephemeral_token(user: User = Depends(get_current_user), model: str = Query(None)):
    if user.trial:
        raise HTTPException(status_code=403, detail="체험판 유저는 Realtime API 사용이 불가합니다.\n\n자세한 정보는 admin@shilvister.net으로 문의해 주세요.")

    REALTIME_MODEL = model.split(":")[0]
    REALTIME_VOICE = model.split(":")[1]
    
    realtime_api_key = os.getenv("REALTIME_API_KEY")
    url = "https://api.openai.com/v1/realtime/client_secrets"
    
    session_config = {
        "session": {
            "type": "realtime",
            "model": REALTIME_MODEL,
            "audio": {
                "output": {
                    "voice": REALTIME_VOICE,
                },
            },
        },
    }
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {realtime_api_key}"
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(url, headers=headers, content=json.dumps(session_config))
    
    if response.status_code != 200:
        raise HTTPException(status_code=response.status_code, detail=response.text)
    
    token_data = response.json()
    
    return {
        "token": token_data["value"],
        "model": REALTIME_MODEL
    }