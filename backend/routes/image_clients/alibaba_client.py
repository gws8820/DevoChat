import os
import base64
import asyncio
import aiohttp
import aiofiles

from fastapi import HTTPException, Depends

from ..auth import User, get_current_user
from ..common import router, ImageGenerateRequest, save_generated_image, check_image_user_permissions

async def generate_image(session: aiohttp.ClientSession, task_id: str, max_wait_time: int = 300) -> dict:
    start_time = asyncio.get_event_loop().time()
            
    headers = {
        "Authorization": f"Bearer {os.getenv('ALIBABA_API_KEY')}"
    }
    
    polling_url = f"https://dashscope-intl.aliyuncs.com/api/v1/tasks/{task_id}"
    
    while True:
        current_time = asyncio.get_event_loop().time()
        if current_time - start_time > max_wait_time:
            raise HTTPException(status_code=408, detail="Image generation timeout")
        
        async with session.get(polling_url, headers=headers) as response:
            if response.status != 200:
                raise HTTPException(status_code=500, detail=f"Polling failed: {response.status}")
            
            result = await response.json()
            status = result.get("output", {}).get("task_status")
            
            if status == "SUCCEEDED":
                return result
            elif status == "FAILED":
                error_detail = result.get("output", {}).get("message", "Unknown error during image generation")
                raise HTTPException(status_code=500, detail=f"Generation failed: {error_detail}")
            elif status in ["PENDING", "RUNNING"]:
                await asyncio.sleep(3)
                continue
            else:
                raise HTTPException(status_code=500, detail=f"Unknown status: {status}")

@router.post("/image/alibaba/text2image")
async def alibaba_endpoint(request: ImageGenerateRequest, user: User = Depends(get_current_user)):
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
            "input": {
                "prompt": prompt
            }
        }
        
        headers = {
            "X-DashScope-Async": "enable",
            "Authorization": f"Bearer {os.getenv('ALIBABA_API_KEY')}",
            "Content-Type": "application/json"
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis",
                json=request_data,
                headers=headers
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise HTTPException(
                        status_code=response.status, 
                        detail=f"Alibaba server error: {error_text}"
                    )
                
                response_data = await response.json()
                task_id = response_data["output"]["task_id"]
                
            result = await generate_image(session, task_id)
            
            results = result["output"]["results"]
            if not results or not results[0].get("url"):
                raise HTTPException(status_code=500, detail="No image URL in result")

            image_url = results[0]["url"]
            async with session.get(image_url) as img_response:
                if img_response.status != 200:
                    raise HTTPException(status_code=500, detail="Failed to download generated image")
                
                image_bytes = await img_response.read()
                
                if not image_bytes:
                    raise HTTPException(status_code=500, detail="Empty image data received")
                
                return save_generated_image(user, image_bytes, request.model, in_billing, out_billing)
                
    except HTTPException:
        raise
    except Exception as ex:
        raise HTTPException(status_code=500, detail=f"Alibaba image generation failed: {str(ex)}")

@router.post("/image/alibaba/image-edit")
async def alibaba_image_edit_endpoint(request: ImageGenerateRequest, user: User = Depends(get_current_user)):
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
        
        if not image_parts:
            raise HTTPException(status_code=400, detail="Image is required for image editing")
        
        image_path = image_parts[0]
        async with aiofiles.open(image_path, "rb") as image_file:
            image_bytes = await image_file.read()
            image_b64 = base64.b64encode(image_bytes).decode('utf-8')
            
        content = [
            {
                "text": "\n\n".join(text_parts)
            },
            {
                "image": f"data:image/jpeg;base64,{image_b64}"
            }
        ]
        
        request_data = {
            "model": request.model,
            "input": {
                "messages": [
                    {
                        "role": "user",
                        "content": content
                    }
                ]
            }
        }
        
        headers = {
            "Authorization": f"Bearer {os.getenv('ALIBABA_API_KEY')}",
            "Content-Type": "application/json"
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
                json=request_data,
                headers=headers
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise HTTPException(
                        status_code=response.status, 
                        detail=f"Alibaba image edit error: {error_text}"
                    )
                
                response_data = await response.json()
                choices = response_data["output"]["choices"]
                image_url = choices[0]["message"]["content"][0]["image"]
                
                if not image_url:
                    raise HTTPException(status_code=500, detail="No image URL in result")

                async with session.get(image_url) as img_response:
                    if img_response.status != 200:
                        raise HTTPException(status_code=500, detail="Failed to download generated image")
                    
                    image_bytes = await img_response.read()
                    
                    if not image_bytes:
                        raise HTTPException(status_code=500, detail="Empty image data received")
                    
                    return save_generated_image(user, image_bytes, request.model, in_billing, out_billing)
                    
    except HTTPException:
        raise
    except Exception as ex:
        raise HTTPException(status_code=500, detail=f"Alibaba image edit failed: {str(ex)}")
