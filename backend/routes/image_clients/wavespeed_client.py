import os
import base64
import asyncio
import aiohttp
import aiofiles

from fastapi import HTTPException, Depends

from ..auth import User, get_current_user
from ..common import router, ImageGenerateRequest, save_image_conversation, check_image_user_permissions


async def generate_image(session: aiohttp.ClientSession, request_id: str, max_wait_time: int = 300) -> dict:
    start_time = asyncio.get_event_loop().time()
    
    headers = {
        "Authorization": f"Bearer {os.getenv('WAVESPEED_API_KEY')}"
    }
    
    polling_url = f"https://api.wavespeed.ai/api/v3/predictions/{request_id}/result"
    
    while True:
        current_time = asyncio.get_event_loop().time()
        if current_time - start_time > max_wait_time:
            raise HTTPException(status_code=408, detail="Image generation timeout")
        
        async with session.get(polling_url, headers=headers) as response:
            if response.status != 200:
                try:
                    error_text = await response.text()
                except Exception:
                    error_text = str(response.status)
                raise HTTPException(status_code=500, detail=error_text)
            
            result = await response.json()
            status = result.get("data", {}).get("status")
            
            if status == "completed":
                return result
            elif status == "failed":
                error_detail = result.get("data", {}).get("error")
                raise HTTPException(status_code=500, detail=error_detail)
            elif status in ["created", "processing"]:
                await asyncio.sleep(1)
                continue
            else:
                raise HTTPException(status_code=500, detail=status)

 
@router.post("/image/wavespeed")
async def wavespeed_endpoint(request: ImageGenerateRequest, user: User = Depends(get_current_user)):
    try:
        error_message, in_billing, out_billing = check_image_user_permissions(user, request)
        if error_message:
            raise HTTPException(status_code=403, detail=error_message)
        
        text_parts = []
        image_parts = []
        
        for part in request.prompt:
            if part.get("type") == "text":
                text_parts.append(part.get("text"))
            elif part.get("type") == "image":
                file_path = part.get("content")
                abs_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", file_path.lstrip("/")))
                image_parts.append(abs_path)
        
        prompt = "\n\n".join(text_parts)
        
        request_data = {"prompt": prompt, "images": []}

        for image_path in image_parts:
            async with aiofiles.open(image_path, "rb") as image_file:
                image_bytes = await image_file.read()
                image_b64 = f"data:image/jpeg;base64,{base64.b64encode(image_bytes).decode('utf-8')}"
                request_data["images"].append(image_b64)
        
        headers = {
            "Authorization": f"Bearer {os.getenv('WAVESPEED_API_KEY')}",
            "Content-Type": "application/json"
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"https://api.wavespeed.ai/api/v3/{request.model}",
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
                request_id = response_data["data"]["id"]
                
            result = await generate_image(session, request_id)
            
            image_url = result["data"]["outputs"][0]
            if not image_url:
                raise HTTPException(status_code=500, detail="No image URL in result")

            async with session.get(image_url) as img_response:
                if img_response.status != 200:
                    try:
                        error_text = await img_response.text()
                    except Exception:
                        error_text = "Failed to download generated image"
                    raise HTTPException(status_code=img_response.status, detail=error_text)
                
                image_bytes = await img_response.read()
                
                if not image_bytes:
                    raise HTTPException(status_code=500, detail="Empty image data received")
                
                return save_image_conversation(user, request, image_bytes, in_billing, out_billing)
                
    except HTTPException:
        raise
    except Exception as ex:
        raise HTTPException(status_code=500, detail=str(ex))