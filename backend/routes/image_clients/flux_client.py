import os
import base64
import asyncio
import aiohttp

from fastapi import HTTPException, Depends

from ..auth import User, get_current_user
from ..common import router, ImageGenerateRequest, save_image_conversation, check_image_user_permissions

async def generate_image(session: aiohttp.ClientSession, polling_url: str, max_wait_time: int = 300) -> dict:
    start_time = asyncio.get_event_loop().time()
    
    while True:
        current_time = asyncio.get_event_loop().time()
        if current_time - start_time > max_wait_time:
            raise HTTPException(status_code=408, detail="Image generation timeout")
        
        async with session.get(polling_url) as response:
            if response.status != 200:
                raise HTTPException(status_code=500, detail=f"Polling failed: {response.status}")
            
            result = await response.json()
            status = result.get("status")
            
            if status == "Ready":
                return result
            elif status == "Error":
                error_detail = result.get("error", "Unknown error during image generation")
                raise HTTPException(status_code=500, detail=f"Generation failed: {error_detail}")
            elif status in ["Pending", "Running"]:
                await asyncio.sleep(2)
                continue
            else:
                raise HTTPException(status_code=500, detail=f"Unknown status: {status}")

@router.post("/image/flux")
async def flux_endpoint(request: ImageGenerateRequest, user: User = Depends(get_current_user)):
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
        
        request_data = {
            "prompt": prompt,
            "safety_tolerance": 6,
            "prompt_upsampling": False
        }
        
        if image_parts:
            for i, image_path in enumerate(image_parts[:4]):
                with open(image_path, "rb") as image_file:
                    image_b64 = base64.b64encode(image_file.read()).decode('utf-8')
                    
                if i == 0:
                    request_data["input_image"] = image_b64
                elif i == 1:
                    request_data["input_image_2"] = image_b64
                elif i == 2:
                    request_data["input_image_3"] = image_b64
                elif i == 3:
                    request_data["input_image_4"] = image_b64
        
        headers = {
            "x-key": os.getenv('FLUX_API_KEY'),
            "Content-Type": "application/json"
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"https://api.bfl.ai/v1/{request.model}",
                json=request_data,
                headers=headers
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise HTTPException(
                        status_code=response.status, 
                        detail=f"Flux server error: {error_text}"
                    )
                
                response_data = await response.json()
                polling_url = response_data["polling_url"]
                
            result = await generate_image(session, polling_url)
            
            image_url = result["result"]["sample"]
            if not image_url:
                raise HTTPException(status_code=500, detail="No image URL in result")

            async with session.get(image_url) as img_response:
                if img_response.status != 200:
                    raise HTTPException(status_code=500, detail="Failed to download generated image")
                
                image_bytes = await img_response.read()
                
                if not image_bytes:
                    raise HTTPException(status_code=500, detail="Empty image data received")
                
                return save_image_conversation(user, request, image_bytes, in_billing, out_billing)
                
    except HTTPException:
        raise
    except Exception as ex:
        raise HTTPException(status_code=500, detail=f"Flux image generation failed: {str(ex)}")