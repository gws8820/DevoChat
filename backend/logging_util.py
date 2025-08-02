import time
import json
import logging
import os
from logging.handlers import RotatingFileHandler
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("devochat")
logger.setLevel(logging.DEBUG)

logs_dir = os.path.join(os.path.dirname(__file__), "logs")
os.makedirs(logs_dir, exist_ok=True)

formatter = logging.Formatter(
    '[%(asctime)s.%(msecs)03d] %(levelname)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

info_handler = RotatingFileHandler(
    os.path.join(logs_dir, "server.log"),
    maxBytes=10*1024*1024,
    backupCount=5,
    encoding='utf-8'
)
info_handler.setLevel(logging.INFO)
info_handler.setFormatter(formatter)
logger.addHandler(info_handler)

debug_handler = RotatingFileHandler(
    os.path.join(logs_dir, "debug.log"),
    maxBytes=10*1024*1024,
    backupCount=5,
    encoding='utf-8'
)
debug_handler.setLevel(logging.DEBUG)
debug_handler.setFormatter(formatter)
logger.addHandler(debug_handler)

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
    except Exception as ex:
        return f"ERROR_READING_BODY: {str(ex)}"


class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
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
        
        if request.method in ["POST", "DELETE"]:
            logger.info(f"REQUEST: {json.dumps(log_data, ensure_ascii=False, indent=2)}")
        else:
            logger.debug(f"REQUEST: {json.dumps(log_data, ensure_ascii=False, indent=2)}")
        
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
            
            if request.method in ["POST", "DELETE"]:
                logger.info(f"RESPONSE: {json.dumps(response_data, ensure_ascii=False, indent=2)}")
            else:
                logger.debug(f"RESPONSE: {json.dumps(response_data, ensure_ascii=False, indent=2)}")
            
            return response
            
        except Exception as ex:
            process_time = time.time() - start_time
            
            error_data = {
                "method": request.method,
                "path": str(request.url.path),
                "error": str(ex),
                "process_time_ms": round(process_time * 1000, 2),
                "client_ip": client_ip
            }
            
            logger.error(f"ERROR: {json.dumps(error_data, ensure_ascii=False, indent=2)}")
            raise