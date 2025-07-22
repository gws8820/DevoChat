import time
import json
import datetime
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

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