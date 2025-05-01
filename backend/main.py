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
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from routes import auth, realtime, conversations, openai_client, responses_client, anthropic_client, huggingface_client
from PIL import Image, ImageOps
from typing import List
from bs4 import BeautifulSoup

load_dotenv()
app = FastAPI()

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "images")
os.makedirs(UPLOAD_DIR, exist_ok=True)

class URLRequest(BaseModel):
    url: str

class WebContent(BaseModel):
    html: str
    stylesheets: List[str]
    title: str

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
        '.java', '.c', '.cpp', '.h', '.hpp', '.v',
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

@app.post("/upload_page")
async def upload_page(content: WebContent):
    try:
        unique_id = str(uuid.uuid4())
        
        stylesheet_content = ""
        for sheet in content.stylesheets:
            if sheet.startswith('http'):
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
                <div class="header" style="position: sticky; top: 0; background-color: white; padding: 0 20px;">
                    <img src="https://devochat.com/logo.png" alt="DEVOCHAT" width="143.5px" style="cursor: pointer;" onclick="location.href='https://devochat.com'" />
                </div>
                <div class="container">
                    {content.html}
                </div>
            </body>
        </html>"""

        file_path = os.path.join("shared_pages", f"{unique_id}.html")
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(html_content)
        
        share_url = f"https://share.devochat.com/id/{unique_id}"
        
        return {"success": True, "url": share_url}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/og")
async def get_opengraph_page():
    return {"detail": "Not Found"}

@app.get("/id/{share_id}", response_class=HTMLResponse)
async def get_shared_page(share_id: str):
    file_path = os.path.join("shared_pages", f"{share_id}.html")
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="공유된 페이지를 찾을 수 없습니다.")
    
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

@app.get("/{full_path:path}")
def catch_all(full_path: str):
    return RedirectResponse(url="https://devochat.com")