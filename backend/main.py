import os
import re
import requests
import io
import uuid
import tempfile
import zipfile
import textract
from dotenv import load_dotenv
from pydantic import BaseModel
from fastapi import FastAPI, File, UploadFile, HTTPException, Response
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from routes import auth, realtime, conversations, openai_client, responses_client, anthropic_client, google_client, mistral_client, huggingface_client
from PIL import Image, ImageOps
from typing import List
from bs4 import BeautifulSoup
from google.cloud import speech
import base64

load_dotenv()
app = FastAPI()

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "images")
os.makedirs(UPLOAD_DIR, exist_ok=True)

class URLRequest(BaseModel):
    url: str

class WebContent(BaseModel):
    unique_id: str
    html: str
    stylesheets: List[str]
    title: str

class NoticeResponse(BaseModel):
    message: str
    hash: str

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
app.include_router(realtime.router)
app.include_router(conversations.router)
app.include_router(openai_client.router)
app.include_router(responses_client.router)
app.include_router(anthropic_client.router)
app.include_router(google_client.router)
app.include_router(mistral_client.router)
app.include_router(huggingface_client.router)

app.mount("/images", StaticFiles(directory="images"), name="images")

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
    
    # Save with UUID filename but return original filename for display
    saved_filename = f"{uuid.uuid4().hex}.jpeg"
    file_location = os.path.join(UPLOAD_DIR, saved_filename)
    with open(file_location, "wb") as f:
        f.write(buffer.getvalue())
    
    return {
        "type": "image",
        "name": file.filename,  # Return original filename for display
        "content": f"/images/{saved_filename}"  # Use UUID filename for actual file path
    }

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

@app.post("/upload/file")
async def upload_file(file: UploadFile = File(...)):
    supported_archives = ['.zip']
    audio_extensions = ['.wav', '.mp3', '.ogg', '.flac', '.amr', '.amr-wb', '.mulaw', '.alaw', '.webm', '.m4a', '.mp4']
    
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

                    extracted_text = ""
                    
                    with tempfile.NamedTemporaryFile(suffix=inner_ext, delete=False) as tmp:
                        tmp.write(inner_file_data)
                        tmp.flush()
                        tmp_path = tmp.name
                    
                    try:
                        extracted_bytes = textract.process(tmp_path)
                        extracted_text = extracted_bytes.decode("utf-8", errors="ignore").strip()
                    except Exception:
                        try:
                            if not is_binary(inner_file_data):
                                decoded_text = inner_file_data.decode("utf-8", errors="replace")
                                extracted_text = decoded_text.strip()
                            else:
                                extracted_text = ""
                        except Exception:
                            extracted_text = ""
                    finally:
                        os.remove(tmp_path)
                    
                    if extracted_text.strip():
                        extracted_parts.append(f"[[{inner_filename}]]\n{extracted_text}")
                    else:
                        raise HTTPException(status_code=422, detail="Text extraction failed")
            
            final_extracted_text = "\n\n".join(extracted_parts)
        
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=422, detail="Archive processing failed")
        
        return {
            "type": "file",
            "name": filename,
            "content": final_extracted_text
        }
    else:
        extracted_text = ""
        
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

        return {
            "type": "file",
            "name": filename,
            "content": f"[[{filename}]]\n{extracted_text}"
        }

@app.post("/upload_page")
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
                <meta property="og:site-name" content="{content.title}">
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

@app.get("/id/{share_id}", response_class=HTMLResponse)
async def get_shared_page(share_id: str):
    file_path = os.path.join("shared_pages", f"{share_id}.html")
    
    if not os.path.exists(file_path):
        with open("./error.html", "r", encoding="utf-8") as f:
            error_content = f.read()
        return Response(
            content=error_content,
            media_type="text/html; charset=utf-8",
            status_code=404
        )
    
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        return content
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/visit_url")
def visit_url(request: URLRequest):
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
        response = requests.get(request.url, headers=headers, timeout=5, allow_redirects=True)
        soup = BeautifulSoup(response.text, "html.parser")
        
        for tag in soup(['script', 'style', 'head', 'meta', 'noscript']):
            tag.decompose()
            
        content = soup.get_text(separator="\n", strip=True)
        content = re.sub(r'\n\s*\n', '\n\n', content)
        
        return {"content": f"[[{request.url}]]\n{content}"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error occured while visiting URL: {str(e)}")

@app.get("/notice", response_model=NoticeResponse)
async def get_notice():
    notice_message = 'OpenAI o3 모델 가격이 80% 인하되었습니다!'
    notice_hash = base64.b64encode(notice_message.encode('utf-8')).decode('utf-8')
    
    return NoticeResponse(
        message=notice_message,
        hash=notice_hash
    )

@app.get("/og")
async def get_opengraph_page():
    return {"detail": "Not Found"}

@app.get("/{full_path:path}")
def catch_all():
    with open("./error.html", "r", encoding="utf-8") as f:
        error_content = f.read()
    return Response(
        content=error_content,
        media_type="text/html; charset=utf-8",
        status_code=404
    )