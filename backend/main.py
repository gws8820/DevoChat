import os
import io
import uuid
from dotenv import load_dotenv
from PIL import Image, ImageOps
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from routes import auth, conversations, openai_client, anthropic_client

load_dotenv()
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        os.getenv('PRODUCTION_URL'),
        os.getenv('DEVELOPMENT_URL')
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/images", StaticFiles(directory="images"), name="images")

app.include_router(auth.router)
app.include_router(conversations.router)
app.include_router(openai_client.router)
app.include_router(anthropic_client.router)

@app.get("/")
def read_root():
    return {"message": "Service is Running"}

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "images")
os.makedirs(UPLOAD_DIR, exist_ok=True)

@app.post("/upload")
async def upload_image(file: UploadFile = File(...)):
    contents = await file.read()

    try:
        image = Image.open(io.BytesIO(contents))
    except Exception:
        return {"error": "Can't Read Image File"}

    image = ImageOps.exif_transpose(image)

    if image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info):
        if image.mode != "RGBA":
            image = image.convert("RGBA")
        background = Image.new("RGB", image.size, (255, 255, 255))
        background.paste(image, mask=image.split()[3])
        image = background
    else:
        image = image.convert("RGB")

    max_dimension = (1024, 1024)
    image.thumbnail(max_dimension, Image.Resampling.LANCZOS)

    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=60, optimize=True)
    
    new_filename = f"{uuid.uuid4().hex}.jpeg"
    file_location = os.path.join(UPLOAD_DIR, new_filename)
    with open(file_location, "wb") as f:
        f.write(buffer.getvalue())

    return {
        "info": "File Successfully Uploaded",
        "file_name": new_filename,
        "file_path": f"/images/{new_filename}"
    }