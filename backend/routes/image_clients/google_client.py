import os

from fastapi import HTTPException, Depends
from PIL import Image
from google.genai import types, Client

from ..auth import User, get_current_user
from ..common import router, ImageGenerateRequest, save_image_conversation, check_image_user_permissions

client = Client(api_key=os.getenv('GEMINI_API_KEY'))
    
@router.post("/image/google/gemini")
async def gemini_endpoint(request: ImageGenerateRequest, user: User = Depends(get_current_user)):
  try:
    error_message, in_billing, out_billing = check_image_user_permissions(user, request)
    if error_message:
      raise HTTPException(status_code=403, detail=error_message)
      
    contents: list = []
    
    for part in request.prompt:
      if part.get("type") == "text":
        contents.append(part.get("text"))

      if part.get("type") == "image":
        file_path = part.get("content")
        abs_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", file_path.lstrip("/")))

        img = Image.open(abs_path)
        contents.append(img)

    response = await client.aio.models.generate_content(
      model=request.model,
      contents=contents,
      config=types.GenerateContentConfig(response_modalities=["TEXT", "IMAGE"])
    )

    if not response or not getattr(response, "candidates", None):
      raise HTTPException(status_code=500, detail="No image generated")
    
    img_bytes = None
    for part in response.candidates[0].content.parts:
      if hasattr(part, 'inline_data') and part.inline_data:
        img_bytes = part.inline_data.data
        break

    if not img_bytes:
      raise HTTPException(status_code=500, detail="Invalid image response")

    return save_image_conversation(user, request, img_bytes, in_billing, out_billing)
  except Exception as ex:
    raise HTTPException(status_code=500, detail=str(ex))
  
@router.post("/image/google/imagen")
async def imagen_endpoint(request: ImageGenerateRequest, user: User = Depends(get_current_user)):
  try:
    error_message, in_billing, out_billing = check_image_user_permissions(user, request)
    if error_message:
      raise HTTPException(status_code=403, detail=error_message)
      
    prompt = "\n\n".join(part.get("text") for part in request.prompt)
    
    response = await client.aio.models.generate_images(
      model=request.model,
      prompt=prompt,
      config=types.GenerateImagesConfig(number_of_images=1),
    )
    
    if not response or not getattr(response, "generated_images", None):
      raise HTTPException(status_code=500, detail="No image generated")
      
    img_bytes = response.generated_images[0].image.image_bytes

    if not img_bytes:
      raise HTTPException(status_code=500, detail="Invalid image response")

    return save_image_conversation(user, request, img_bytes, in_billing, out_billing)
  except Exception as ex:
    raise HTTPException(status_code=500, detail=str(ex))