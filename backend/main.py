import os
import re
import json
import requests
from dotenv import load_dotenv
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException, Response, Depends
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import FileResponse
import aiofiles
import aiofiles.os
from pathlib import Path
from routes import auth, realtime, conversations, uploads
from routes.chat_clients import openai_client, grok_client, responses_client, anthropic_client, google_client, mistral_client
from routes.image_clients import openai_client, google_client, grok_client, flux_client, wavespeed_client
from routes.auth import User, get_current_user
from bs4 import BeautifulSoup
import base64
from logging_util import LoggingMiddleware

class URLRequest(BaseModel):
    url: str

class NoticeResponse(BaseModel):
    message: str
    hash: str

class MCPServer(BaseModel):
    id: str
    name: str
    icon: str
    admin: bool

load_dotenv()
app = FastAPI()

app.include_router(auth.router)
app.include_router(conversations.router)
app.include_router(uploads.router)
app.include_router(realtime.router)

app.include_router(openai_client.router)
app.include_router(grok_client.router)
app.include_router(responses_client.router)
app.include_router(anthropic_client.router)
app.include_router(google_client.router)
app.include_router(mistral_client.router)

app.include_router(openai_client.router)
app.include_router(google_client.router)
app.include_router(grok_client.router)
app.include_router(flux_client.router)
app.include_router(wavespeed_client.router)

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

app.add_middleware(LoggingMiddleware)

@app.get("/notice", response_model=NoticeResponse)
async def get_notice():
    message = ""
    hash = base64.b64encode(message.encode('utf-8')).decode('utf-8')
    
    return NoticeResponse(
        message=message,
        hash=hash
    )
    
@app.get("/uploads/images/{file_path:path}")
async def serve_uploaded_images(file_path: str):
    file_location = Path("uploads/images") / file_path
    if not await aiofiles.os.path.exists(file_location):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(
        file_location, 
        headers={
            "Cache-Control": "public, max-age=3600",
            "Content-Type": "image/jpeg"
        }
    )

@app.get("/uploads/files/{file_path:path}")
async def serve_uploaded_files(file_path: str):
    file_location = Path("uploads/files") / file_path
    if not await aiofiles.os.path.exists(file_location):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(
        file_location,
        headers={"Cache-Control": "public, max-age=3600"}
    )

@app.get("/generated/images/{file_path:path}")
async def serve_generated_images(file_path: str):
    file_location = Path("generated/images") / file_path
    if not await aiofiles.os.path.exists(file_location):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(
        file_location,
        headers={
            "Cache-Control": "public, max-age=3600",
            "Content-Type": "image/png"
        }
    )

@app.get("/icons/{file_path:path}")
async def serve_icons(file_path: str):
    file_location = Path("icons") / file_path
    if not await aiofiles.os.path.exists(file_location):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(
        file_location,
        headers={
            "Cache-Control": "public, max-age=86400",
            "Content-Type": "image/png"
        }
    )

@app.get("/chat_models", response_model=dict)
async def get_models(user: User = Depends(get_current_user)):
    try:
        with open("config/chat_models.json", "r", encoding="utf-8") as f:
            models_data = json.load(f)
            
        models = []
        for model in models_data["models"]:
            if not user.admin and model["admin"]:
                continue
            models.append(model)
        
        return {
            "models": models,
            "default": models_data["default"]
        }
    except Exception as ex:
        raise HTTPException(status_code=500, detail=f"Error occurred while fetching chat models: {str(ex)}")

@app.get("/image_models", response_model=dict)
async def get_image_models(user: User = Depends(get_current_user)):
    try:
        with open("config/image_models.json", "r", encoding="utf-8") as f:
            models_data = json.load(f)

        models = []
        for model in models_data["models"]:
            if not user.admin and model.get("admin"):
                continue
            models.append(model)

        return {
            "models": models,
            "default": models_data["default"]
        }
    except Exception as ex:
        raise HTTPException(status_code=500, detail=f"Error occurred while fetching image models: {str(ex)}")

@app.get("/realtime_models", response_model=dict)
async def get_realtime_models(user: User = Depends(get_current_user)):
    try:
        with open("config/realtime_models.json", "r", encoding="utf-8") as f:
            models_data = json.load(f)

        return {
            "models": models_data["models"],
            "default": models_data["default"]
        }
    except Exception as ex:
        raise HTTPException(status_code=500, detail=f"Error occurred while fetching realtime models: {str(ex)}")

@app.get("/mcp-servers", response_model=list[MCPServer])
async def get_mcp_servers(user: User = Depends(get_current_user)):
    try:
        with open("config/mcp_servers.json", "r", encoding="utf-8") as f:
            mcp_servers = json.load(f)
        
        servers = []
        for server_id, config in mcp_servers.items():
            if not user.admin and config["admin"]:
                continue
            
            server = MCPServer(
                id=server_id,
                name=config["name"],
                icon=f"/icons/{server_id}.png",
                admin=config["admin"]
            )
            servers.append(server)
        
        return servers
    except Exception as ex:
        raise HTTPException(status_code=500, detail=f"Error occured while fetching MCP servers: {str(ex)}")

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
    except Exception as ex:
        raise HTTPException(status_code=500, detail=str(ex))

@app.post("/visit_url")
def visit_url(request: URLRequest):
    try:
        if len(request.url) > 20000:
            raise HTTPException(status_code=413, detail="URL size exceeds 20000 characters limit.")
        
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
        response = requests.get(request.url, headers=headers, timeout=5, allow_redirects=True)
        soup = BeautifulSoup(response.text, "html.parser")
        
        for tag in soup(['script', 'style', 'head', 'meta', 'noscript']):
            tag.decompose()
            
        content = soup.get_text(separator="\n", strip=True)
        content = re.sub(r'\n\s*\n', '\n\n', content)
        
        return {"content": f"[[{request.url}]]\n{content}"}
    except Exception as ex:
        raise HTTPException(status_code=400, detail=f"Error occured while visiting URL: {str(ex)}")

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