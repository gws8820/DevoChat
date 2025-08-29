import os
import base64
import aiohttp
import aiofiles

from fastapi import HTTPException, Depends

from ..auth import User, get_current_user
from ..common import router, ImageGenerateRequest, save_image_conversation, check_image_user_permissions

@router.post("/image/byteplus")
async def byteplus_endpoint(request: ImageGenerateRequest, user: User = Depends(get_current_user)):
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
            "model": request.model,
            "prompt": prompt,
            "response_format": "b64_json"
        }
        
        if image_parts:
            image_path = image_parts[0]
            async with aiofiles.open(image_path, "rb") as image_file:
                image_bytes = await image_file.read()
                image_b64 = base64.b64encode(image_bytes).decode('utf-8')
                
            request_data["image"] = f"data:image/jpeg;base64,{image_b64}"
        
        headers = {
            "Authorization": f"Bearer {os.getenv('BYTEPLUS_API_KEY')}",
            "Content-Type": "application/json"
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://ark.ap-southeast.bytepluses.com/api/v3/images/generations",
                json=request_data,
                headers=headers
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise HTTPException(
                        status_code=response.status, 
                        detail=f"BytePlus server error: {error_text}"
                    )
                
                response_data = await response.json()
                image_bytes = base64.b64decode(response_data["data"][0]["b64_json"])
                if not image_bytes:
                    raise HTTPException(status_code=500, detail="Empty image data received")
                
                return save_image_conversation(user, request, image_bytes, in_billing, out_billing)
                
    except HTTPException:
        raise
    except Exception as ex:
        raise HTTPException(status_code=500, detail=f"BytePlus image generation failed: {str(ex)}")
