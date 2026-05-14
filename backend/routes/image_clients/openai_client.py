import base64
import os

from fastapi import HTTPException, Depends
from openai import AsyncOpenAI

from ..auth import User, get_current_user
from ..common import acquire_stream_lock, release_stream_lock, router, ImageGenerateRequest, save_image_conversation, check_image_user_permissions

@router.post("/image/openai")
async def openai_endpoint(request: ImageGenerateRequest, user: User = Depends(get_current_user)):
  lock_acquired = False
  try:
    error_message, in_billing, out_billing = check_image_user_permissions(user, request)
    if error_message:
      raise HTTPException(status_code=403, detail=error_message)
    acquire_stream_lock(request.conversation_id)

    lock_acquired = True
      
    text_parts = []
    image_files = []
    
    for part in request.message:
      if part.get("type") == "text":
        text_parts.append(part.get("text"))
      elif part.get("type") == "image":
        file_path = part.get("content")
        abs_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", file_path.lstrip("/")))
        image_files.append(abs_path)
    
    prompt = "\n\n".join(text_parts)
    async with AsyncOpenAI(api_key=os.getenv('OPENAI_API_KEY')) as client:
      if image_files:
        with open(image_files[0], "rb") as image_file:
          response = await client.images.edit(
            model=request.model,
            image=image_file,
            prompt=prompt
          )
      else:
        response = await client.images.generate(
          model=request.model,
          prompt=prompt
        )
      
      if not response or not response.data:
        raise HTTPException(status_code=500, detail="No image generated")

      image_bytes = base64.b64decode(response.data[0].b64_json)
      return save_image_conversation(user, request, image_bytes, in_billing, out_billing)
  except HTTPException:
    raise
  except Exception as ex:
    raise HTTPException(status_code=500, detail=str(ex))
  finally:
    if lock_acquired:
      release_stream_lock(request.conversation_id)
