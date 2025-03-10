import os
import io
import uuid
import tempfile
import zipfile
import textract
from dotenv import load_dotenv
from PIL import Image, ImageOps
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from routes import auth, conversations, openai_client, anthropic_client, huggingface_client

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

app.include_router(auth.router)
app.include_router(conversations.router)
app.include_router(openai_client.router)
app.include_router(anthropic_client.router)
app.include_router(huggingface_client.router)

app.mount("/images", StaticFiles(directory="images"), name="images")

@app.get("/")
def read_root():
    return {"message": "Service is Running"}

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "images")
os.makedirs(UPLOAD_DIR, exist_ok=True)

@app.post("/upload/image")
async def upload_image(file: UploadFile = File(...)):
    file_data = await file.read()
    if len(file_data) > 100 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds size limit.")

    try:
        image = Image.open(io.BytesIO(file_data))
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
    image.save(buffer, format="JPEG", quality=100, optimize=True)
    
    filename = f"{uuid.uuid4().hex}.jpeg"
    file_location = os.path.join(UPLOAD_DIR, filename)
    with open(file_location, "wb") as f:
        f.write(buffer.getvalue())

    return {
        "type": "image",
        "name": filename,
        "content": f"/images/{filename}"
    }

@app.post("/upload/file")
async def upload_file(file: UploadFile = File(...)):
    supported_archives = ['.zip']
    text_extensions = [
        '.txt', '.text', '.md', '.markdown',
        '.json', '.xml', '.html', '.htm',
        '.csv', '.tsv', '.yaml', '.yml', '.log', '.sql',
        '.py', '.pyw', '.rb', '.pl',
        '.java', '.c', '.cpp', '.h', '.hpp',
        '.js', '.jsx', '.ts', '.tsx',
        '.css', '.scss', '.less',
        '.cs', '.sh', '.bash', '.bat', '.ps1',
        '.ini', '.conf', '.cfg', '.toml',
        '.tex',
        '.r',
        '.swift', '.scala',
        '.hs', '.erl', '.ex', '.exs',
        '.go', '.rs', '.php'
    ]
    
    file_data = await file.read()
    if len(file_data) > 100 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds size limit.")

    filename = file.filename
    _, ext = os.path.splitext(filename)
    ext = ext.lower()

    if ext in supported_archives:
        extracted_parts = []
        try:
            with zipfile.ZipFile(io.BytesIO(file_data)) as z:
                for inner_filename in z.namelist():
                    if inner_filename.startswith("__MACOSX") or os.path.basename(inner_filename).startswith("._"):
                        continue
                    if inner_filename.endswith('/'):
                        continue

                    inner_ext = os.path.splitext(inner_filename)[1].lower()
                    inner_file_data = z.read(inner_filename)

                    if inner_ext in text_extensions:
                        try:
                            extracted_text = inner_file_data.decode("utf-8", errors="replace")
                        except Exception as e:
                            print(f"Decoding error for {inner_filename}: {e}")
                            extracted_text = ""
                    else:
                        with tempfile.NamedTemporaryFile(suffix=inner_ext, delete=False) as tmp:
                            tmp.write(inner_file_data)
                            tmp.flush()
                            tmp_path = tmp.name
                        try:
                            extracted_bytes = textract.process(tmp_path)
                            extracted_text = extracted_bytes.decode("utf-8", errors="ignore")
                        except Exception as e:
                            print(f"textract error for {inner_filename}: {e}")
                            extracted_text = ""
                        finally:
                            os.remove(tmp_path)
                    extracted_parts.append(f"[[{inner_filename}]]\n{extracted_text}")
            final_extracted_text = "\n\n".join(extracted_parts)
        except Exception as e:
            print(f"Error processing archive file {filename}: {e}")
            final_extracted_text = ""
        
        return {
            "type": "file",
            "name": filename,
            "content": final_extracted_text
        }
    else:
        if ext in text_extensions:
            try:
                extracted_text = file_data.decode("utf-8", errors="replace")
            except Exception as e:
                print(f"Direct decode error: {e}")
                extracted_text = ""
        else:
            with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
                tmp.write(file_data)
                tmp.flush()
                tmp_path = tmp.name

            try:
                extracted_bytes = textract.process(tmp_path)
                extracted_text = extracted_bytes.decode("utf-8", errors="ignore")
            except Exception as e:
                print(f"textract error: {e}")
                extracted_text = ""
            finally:
                os.remove(tmp_path)

        return {
            "type": "file",
            "name": filename,
            "content": f"[[{filename}]]\n{extracted_text}"
        }