import os
import re
import json
import requests
import time
import datetime
from dotenv import load_dotenv
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException, Response, Request
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from routes import auth, realtime, conversations, uploads
from routes.clients import openai_client, grok_client, responses_client, anthropic_client, google_client, mistral_client, huggingface_client
from bs4 import BeautifulSoup
import base64

load_dotenv()
app = FastAPI()

def log_with_timestamp(message, level="INFO"):
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    print(f"[{timestamp}] {level}: {message}")

async def get_request_body(request: Request):
    try:
        body = await request.body()
        if body:
            request._body = body
            content_type = request.headers.get("content-type", "")
            
            if "application/json" in content_type:
                try:
                    return json.loads(body.decode())
                except:
                    return body.decode()[:500] + "..." if len(body) > 500 else body.decode()
            elif "multipart/form-data" in content_type:
                return f"FILE_UPLOAD: {len(body)} bytes"
            else:
                body_str = body.decode()[:500]
                return body_str + "..." if len(body) > 500 else body_str
        return None
    except Exception as e:
        return f"ERROR_READING_BODY: {str(e)}"

@app.middleware("http")
async def detailed_logging_middleware(request: Request, call_next):
    start_time = time.time()
    
    client_ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "unknown")
    
    request_body = await get_request_body(request)
    
    log_data = {
        "method": request.method,
        "path": str(request.url.path),
        "client_ip": client_ip,
        "user_agent": user_agent[:100] + "..." if len(user_agent) > 100 else user_agent,
    }
    
    if request_body:
        log_data["body"] = request_body
    
    log_with_timestamp(f"REQUEST: {json.dumps(log_data, ensure_ascii=False, indent=2)}")
    
    try:
        response = await call_next(request)
        process_time = time.time() - start_time
        
        response_data = {
            "method": request.method,
            "path": str(request.url.path),
            "status_code": response.status_code,
            "process_time_ms": round(process_time * 1000, 2),
            "client_ip": client_ip
        }
        
        log_with_timestamp(f"RESPONSE: {json.dumps(response_data, ensure_ascii=False)}")
        
        return response
        
    except Exception as e:
        process_time = time.time() - start_time
        
        error_data = {
            "method": request.method,
            "path": str(request.url.path),
            "error": str(e),
            "process_time_ms": round(process_time * 1000, 2),
            "client_ip": client_ip
        }
        
        log_with_timestamp(f"ERROR: {json.dumps(error_data, ensure_ascii=False, indent=2)}", "ERROR")
        raise

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
app.include_router(grok_client.router)
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
    notice_message = '이제 Grok 모델이 검색 기능을 지원합니다!'
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