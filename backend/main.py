import os
import re
import json
import requests
from dotenv import load_dotenv
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException, Response
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from routes import auth, realtime, conversations, openai_client, responses_client, anthropic_client, google_client, mistral_client, huggingface_client, uploads
from bs4 import BeautifulSoup
import base64

load_dotenv()
app = FastAPI()

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
app.include_router(uploads.router)
app.include_router(realtime.router)
app.include_router(openai_client.router)
app.include_router(responses_client.router)
app.include_router(anthropic_client.router)
app.include_router(google_client.router)
app.include_router(mistral_client.router)
app.include_router(huggingface_client.router)

app.mount("/images", StaticFiles(directory="images"), name="images")
app.mount("/files", StaticFiles(directory="files"), name="files")
app.mount("/icons", StaticFiles(directory="icons"), name="icons")

@app.get("/notice", response_model=NoticeResponse)
async def get_notice():
    notice_message = 'MCP 서버 지원이 추가되었습니다! + 버튼을 눌러 확인해보세요.'
    notice_hash = base64.b64encode(notice_message.encode('utf-8')).decode('utf-8')
    
    return NoticeResponse(
        message=notice_message,
        hash=notice_hash
    )

@app.get("/mcp-servers", response_model=list[MCPServer])
async def get_mcp_servers():
    try:
        with open("mcp_servers.json", "r", encoding="utf-8") as f:
            mcp_servers = json.load(f)
        
        servers = []
        for server_id, config in mcp_servers.items():
            server = MCPServer(
                id=server_id,
                name=config["name"],
                icon=f"/icons/{server_id}.png",
                admin=config["admin"]
            )
            servers.append(server)
        
        return servers
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error occured while fetching MCP servers: {str(e)}")

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