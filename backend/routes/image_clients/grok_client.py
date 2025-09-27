import os
import base64
import aiohttp
import aiofiles

from fastapi import HTTPException, Depends

from ..auth import User, get_current_user
from ..common import router, ImageGenerateRequest, save_image_conversation, check_image_user_permissions

@router.post("/image/grok")
async def grok_endpoint(request: ImageGenerateRequest, user: User = Depends(get_current_user)):
    try:
        error_message, in_billing, out_billing = check_image_user_permissions(user, request)
        if error_message:
            raise HTTPException(status_code=403, detail=error_message)
        
        prompt = "\n\n".join(part.get("text") for part in request.prompt)
        
        request_data = {
            "model": request.model,
            "prompt": prompt,
            "response_format": "b64_json",
            "n": 1
        }
        
        headers = {
            "Authorization": f"Bearer {os.getenv('XAI_API_KEY')}",
            "Content-Type": "application/json"
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://api.x.ai/v1/images/generations",
                json=request_data,
                headers=headers
            ) as response:
                if response.status != 200:
                    try:
                        error_text = await response.text()
                    except Exception:
                        error_text = str(response)
                    raise HTTPException(status_code=response.status, detail=error_text)
                
                response_data = await response.json()
                image_bytes = base64.b64decode(response_data["data"][0]["b64_json"])
                if not image_bytes:
                    raise HTTPException(status_code=500, detail="Empty image data received")
                
                return save_image_conversation(user, request, image_bytes, in_billing, out_billing)
                
    except HTTPException:
        raise
    except Exception as ex:
        raise HTTPException(status_code=500, detail=str(ex))
