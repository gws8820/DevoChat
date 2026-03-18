import os
import base64
import asyncio
import aiofiles
import xai_sdk

from fastapi import HTTPException, Depends

from ..auth import User, get_current_user
from ..common import router, ImageGenerateRequest, save_image_conversation, check_image_user_permissions

client = xai_sdk.Client(api_key=os.getenv('XAI_API_KEY'))

@router.post("/image/grok")
async def grok_endpoint(request: ImageGenerateRequest, user: User = Depends(get_current_user)):
    try:
        error_message, in_billing, out_billing = check_image_user_permissions(user, request)
        if error_message:
            raise HTTPException(status_code=403, detail=error_message)

        text_parts = []
        image_parts = []

        for part in request.message:
            if part.get("type") == "text":
                text_parts.append(part.get("text"))
            elif part.get("type") == "image":
                file_path = part.get("content")
                abs_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", file_path.lstrip("/")))
                image_parts.append(abs_path)

        prompt = "\n\n".join(text_parts)

        kwargs = {
            "prompt": prompt,
            "model": request.model,
            "image_format": "base64",
        }

        image_urls = []
        for image_path in image_parts:
            async with aiofiles.open(image_path, "rb") as f:
                image_data = await f.read()
            image_b64 = f"data:image/jpeg;base64,{base64.b64encode(image_data).decode('utf-8')}"
            image_urls.append(image_b64)

        if len(image_urls) == 1:
            kwargs["image_url"] = image_urls[0]
        elif len(image_urls) > 1:
            kwargs["image_urls"] = image_urls

        response = await asyncio.to_thread(client.image.sample, **kwargs)

        if not response.image:
            raise HTTPException(status_code=500, detail="Empty image data received")

        return save_image_conversation(user, request, response.image, in_billing, out_billing)

    except HTTPException:
        raise
    except Exception as ex:
        raise HTTPException(status_code=500, detail=str(ex))
