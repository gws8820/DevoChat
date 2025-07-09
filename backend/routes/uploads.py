import os
import uuid
import tempfile
import zipfile
import textract
import io
from fastapi import APIRouter, File, UploadFile, HTTPException
from pydantic import BaseModel
from PIL import Image, ImageOps
from typing import List
from google.cloud import speech

router = APIRouter()

IMAGE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "images")
FILES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "files")

os.makedirs(IMAGE_DIR, exist_ok=True)
os.makedirs(FILES_DIR, exist_ok=True)

class WebContent(BaseModel):
    unique_id: str
    html: str
    stylesheets: List[str]
    title: str

def is_binary(data: bytes) -> bool:
    if not data:
        return False
    
    sample_size = min(8192, len(data))
    sample = data[:sample_size]
    
    if b'\x00' in sample:
        return True
    
    binary_signatures = [
        b'\x89PNG',  # PNG
        b'\xff\xd8\xff',  # JPEG
        b'GIF8',  # GIF
        b'RIFF',  # AVI, WAV
        b'\x00\x00\x00\x18ftypmp4',  # MP4
        b'\x00\x00\x00 ftypM4V',  # M4V
        b'MZ',  # EXE
        b'\x7fELF',  # ELF (Linux executables)
        b'\xca\xfe\xba\xbe',  # Mach-O (macOS executables)
        b'PK\x03\x04',  # ZIP
        b'Rar!',  # RAR
        b'\x50\x4b\x03\x04',  # ZIP variant
    ]
    
    for signature in binary_signatures:
        if sample.startswith(signature):
            return True
    
    try:
        decoded = sample.decode('utf-8', errors='replace')
        replacement_ratio = decoded.count('\ufffd') / len(decoded) if decoded else 0
        return replacement_ratio > 0.1
    except Exception:
        return True

@router.post("/upload/image")
async def upload_image(file: UploadFile = File(...)):
    file_data = await file.read()
    if len(file_data) > 100 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds size limit.")

    try:
        image = Image.open(io.BytesIO(file_data))
    except Exception:
        raise HTTPException(status_code=400, detail="Can't Read Image File")

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
    
    # Save with UUID filename but return original filename for display
    saved_filename = f"{uuid.uuid4().hex}.jpeg"
    file_location = os.path.join(IMAGE_DIR, saved_filename)
    with open(file_location, "wb") as f:
        f.write(buffer.getvalue())
    
    return {
        "type": "image",
        "name": file.filename,
        "content": f"/images/{saved_filename}"
    }

@router.post("/upload/file")
async def upload_file(file: UploadFile = File(...)):
    supported_archives = ['.zip']
    audio_extensions = ['.wav', '.mp3', '.ogg', '.flac', '.amr', '.amr-wb', '.mulaw', '.alaw', '.webm', '.m4a', '.mp4']
    
    file_data = await file.read()
    if len(file_data) > 100 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds size limit.")

    filename = file.filename
    _, ext = os.path.splitext(filename)
    ext = ext.lower()

    extracted_text = ""

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

                    inner_extracted_text = ""
                    
                    with tempfile.NamedTemporaryFile(suffix=inner_ext, delete=False) as tmp:
                        tmp.write(inner_file_data)
                        tmp.flush()
                        tmp_path = tmp.name
                    
                    try:
                        extracted_bytes = textract.process(tmp_path)
                        inner_extracted_text = extracted_bytes.decode("utf-8", errors="ignore").strip()
                    except Exception:
                        try:
                            if not is_binary(inner_file_data):
                                decoded_text = inner_file_data.decode("utf-8", errors="replace")
                                inner_extracted_text = decoded_text.strip()
                            else:
                                inner_extracted_text = ""
                        except Exception:
                            inner_extracted_text = ""
                    finally:
                        os.remove(tmp_path)
                    
                    if inner_extracted_text.strip():
                        extracted_parts.append(f"[[{inner_filename}]]\n{inner_extracted_text}")
                    else:
                        raise HTTPException(status_code=422, detail="Text extraction failed")
            
            extracted_text = "\n\n".join(extracted_parts)
        
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=422, detail="Archive processing failed")
        
    else:
        if ext in audio_extensions:
            with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
                tmp.write(file_data)
                tmp.flush()
                tmp_path = tmp.name
            
            try:
                client = speech.SpeechClient(client_options={"api_key": os.getenv("GOOGLE_STT_API_KEY")})
                
                with open(tmp_path, "rb") as audio_file:
                    content = audio_file.read()
                audio = speech.RecognitionAudio(content=content)
                
                config = speech.RecognitionConfig(
                    encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
                    language_code="ko-KR",
                    alternative_language_codes=["en-US"],
                    enable_automatic_punctuation=True,
                )
                response = client.recognize(config=config, audio=audio)
                
                for result in response.results:
                    extracted_text += result.alternatives[0].transcript + " "
            except Exception as e:
                try:
                    extracted_bytes = textract.process(tmp_path)
                    extracted_text = extracted_bytes.decode("utf-8", errors="ignore").strip()
                except Exception as e:
                    extracted_text = ""
            finally:
                os.remove(tmp_path)
        
        else:
            with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
                tmp.write(file_data)
                tmp.flush()
                tmp_path = tmp.name

            try:
                extracted_bytes = textract.process(tmp_path)
                extracted_text = extracted_bytes.decode("utf-8", errors="ignore").strip()
            except Exception:
                try:
                    if not is_binary(file_data):
                        decoded_text = file_data.decode("utf-8", errors="replace")
                        extracted_text = decoded_text.strip()
                    else:
                        extracted_text = ""
                except Exception:
                    extracted_text = ""
            finally:
                os.remove(tmp_path)

    if not extracted_text.strip():
        raise HTTPException(status_code=422, detail="Text extraction failed")

    if len(extracted_text) > 20000:
        raise HTTPException(status_code=413, detail="Extracted text exceeds 20000 character limit.")

    # Save with UUID filename but return original filename for display
    saved_filename = f"{uuid.uuid4().hex}{ext}"
    file_location = os.path.join(FILES_DIR, saved_filename)
    with open(file_location, "wb") as f:
        f.write(file_data)

    return {
        "type": "file",
        "name": filename,
        "content": f"[[{filename}]]\n{extracted_text}",
        "file_path": f"/files/{saved_filename}"
    }

@router.post("/upload_page")
async def upload_page(content: WebContent):
    try:
        stylesheet_content = ""
        for sheet in content.stylesheets:
            if sheet.startswith(('http://', 'https://')):
                stylesheet_content += f'<link rel="stylesheet" href="{sheet}">\n'
            else:
                stylesheet_content += f'{sheet}\n'
        
        html_content = f"""<!DOCTYPE html>
        <html>
            <head>
                <meta charset="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                <meta name="theme-color" content="#000000" />
                <meta name="description" content="DevoChat" />
                <meta property="og:title" content="{content.title}">
                <meta property="og:site_name" content="{content.title}">
                <meta property="og:description" content="DevoChat 공유 링크">
                <meta property="og:image" content="https://devochat.com/full_logo.png">
                <meta property="og:url" content="https://share.devochat.com/og">
                <meta property="og:type" content="website">

                <link rel="icon" type="image/png" href="https://devochat.com/favicon/favicon-96x96.png" sizes="96x96" />
                <link rel="icon" type="image/svg+xml" href="https://devochat.com/favicon/favicon.svg" />
                <link rel="shortcut icon" href="https://devochat.com/favicon/favicon.ico" />
                <link rel="apple-touch-icon" sizes="180x180" href="https://devochat.com/favicon/apple-touch-icon.png" />
                <meta name="apple-mobile-web-app-title" content="DevoChat 공유 링크" />

                <title>{content.title}</title>
                {stylesheet_content}
            </head>
            <body style="display: flex; position: relative; flex-direction: column; margin: 0; overflow: hidden;">
                <div class="header" style="position: sticky; top: 0; background-color: white;">
                    <img src="https://devochat.com/logo.png" alt="DEVOCHAT" width="143.5px" style="cursor: pointer;" onclick="location.href='https://devochat.com'" />
                </div>
                <div class="container">
                    {content.html}
                </div>
            </body>
        </html>"""

        file_path = os.path.join("shared_pages", f"{content.unique_id}.html")
        os.makedirs("shared_pages", exist_ok=True)
        
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(html_content)
        
        return {"success": True}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) 