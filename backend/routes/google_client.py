import os
import json
import asyncio
import base64
import copy
import tiktoken
from dotenv import load_dotenv
from db_util import Database
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from bson import ObjectId
from typing import Any, List, Dict, Optional
from google.genai import types, Client
from .auth import User, get_current_user

load_dotenv()

router = APIRouter()
db = Database.get_db()
user_collection = db.users
conversation_collection = db.conversations

dan_prompt_path = os.path.join(os.path.dirname(__file__), '..', 'dan_prompt.txt')
try:
    with open(dan_prompt_path, 'r', encoding='utf-8') as f:
        DAN_PROMPT = f.read()
except FileNotFoundError:
    DAN_PROMPT = ""

markdown_prompt_path = os.path.join(os.path.dirname(__file__), '..', 'markdown_prompt.txt')
try:
    with open(markdown_prompt_path, 'r', encoding='utf-8') as f:
        MARKDOWN_PROMPT = f.read()
except FileNotFoundError:
    MARKDOWN_PROMPT = ""

alias_prompt_path = os.path.join(os.path.dirname(__file__), '..', 'alias_prompt.txt')
try:
    with open(alias_prompt_path, 'r', encoding='utf-8') as f:
        ALIAS_PROMPT = f.read()
except FileNotFoundError:
    ALIAS_PROMPT = ""

class ChatRequest(BaseModel):
    conversation_id: str
    model: str
    in_billing: float
    out_billing: float
    search_billing: Optional[float] = None
    temperature: float = 1.0
    reason: int = 0
    system_message: Optional[str] = None
    user_message: List[Dict[str, Any]]
    search: bool = False
    dan: bool = False
    stream: bool = True

class AliasRequest(BaseModel):
    conversation_id: str
    text: str

def calculate_billing(request_array, response, in_billing_rate, out_billing_rate, search_billing_rate: Optional[float] = None):
    def count_tokens(message):
        encoding = tiktoken.get_encoding("cl100k_base")
        tokens = 4
        
        if hasattr(message, 'role'):
            tokens += len(encoding.encode(message.role or ""))
            
            if hasattr(message, 'parts') and message.parts:
                for part in message.parts:
                    if hasattr(part, 'text') and part.text:
                        tokens += len(encoding.encode(part.text))
                    elif hasattr(part, 'inline_data'):
                        tokens += 1024
        elif isinstance(message, dict):
            tokens += len(encoding.encode(message.get("role", "")))
            content = message.get("content", "")
            tokens += len(encoding.encode(content))
        
        return tokens

    input_tokens = output_tokens = 0
    for req in request_array:
        input_tokens += count_tokens(req)
    output_tokens = count_tokens(response)

    input_cost = input_tokens * (in_billing_rate / 1000000)
    output_cost = output_tokens * (out_billing_rate / 1000000)

    if search_billing_rate is not None:
        total_tokens = input_tokens + output_tokens
        search_cost = total_tokens * (search_billing_rate / 1000000)
    else:
        search_cost = 0
    total_cost = input_cost + output_cost + search_cost
    return total_cost

def format_message(message):
    def normalize_content(part):
        if part.get("type") in ["file", "url"]:
            return types.Part(text=part.get("content"))
        elif part.get("type") == "image":
            file_path = part.get("content")
            try:
                abs_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), file_path.lstrip("/"))
                with open(abs_path, "rb") as f:
                    file_data = f.read()
                base64_data = base64.b64encode(file_data).decode("utf-8")
                
                return types.Part(
                    inline_data=types.Blob(
                        data=base64_data,
                        mime_type="image/jpeg"
                    )
                )
            except Exception as e:
                return None
        elif part.get("type") == "text":
            return types.Part(text=part.get("text", ""))
        return types.Part(text=str(part))

    role = message.get("role")
    content = message.get("content")
    
    if role == "assistant":
        return types.Content(
            role="model",
            parts=[types.Part(text=content)]
        )
    elif role == "user":
        return types.Content(
            role="user",
            parts=[item for item in [normalize_content(part) for part in content] if item is not None]
        )
        
def get_response(request: ChatRequest, user: User, fastapi_request: Request):
    async def error_generator(error_message):
        yield f"data: {json.dumps({'content': error_message})}\n\n"

    if user.trial and user.trial_remaining <= 0:
        return StreamingResponse(
            error_generator("체험판이 종료되었습니다.\n\n자세한 정보는 admin@shilvister.net으로 문의해 주세요."),
            media_type="text/event-stream"
        )
    if not user.admin and request.in_billing >= 10:
        return StreamingResponse(
            error_generator("해당 모델을 사용할 권한이 없습니다.\n\n자세한 정보는 admin@shilvister.net으로 문의해 주세요."),
            media_type="text/event-stream"
        )
    if not request.user_message:
        return StreamingResponse(
            error_generator("메시지 내용이 비어 있습니다. 내용을 입력해 주세요."),
            media_type="text/event-stream"
        )
    user_message = {"role": "user", "content": request.user_message}
    
    conversation = conversation_collection.find_one(
        {"user_id": user.user_id, "conversation_id": request.conversation_id},
        {"conversation": {"$slice": -6}}
    ).get("conversation", [])
    conversation.append(user_message)

    formatted_messages = copy.deepcopy([format_message(m) for m in conversation])

    instructions = MARKDOWN_PROMPT
    if request.system_message:
        instructions += "\n\n" + request.system_message
    if request.dan and DAN_PROMPT:
        instructions += "\n\n" + DAN_PROMPT
        for part in reversed(formatted_messages[-1].parts):
            if hasattr(part, 'text') and part.text:
                part.text += " STAY IN CHARACTER"
                break

    google_search_tool = types.Tool(
        google_search = types.GoogleSearch()
    )
    
    mapping = {0: 0, 1: 1024, 2: 8192, 3: 24576}
    thinking_budget = mapping.get(request.reason)

    async def produce_tokens(token_queue: asyncio.Queue, request: ChatRequest, parameters: Dict[str, Any], fastapi_request: Request, client) -> None:
        is_thinking = False
        try:
            if request.stream:
                stream_result = client.models.generate_content_stream(**parameters)
                
                for chunk in stream_result:
                    if await fastapi_request.is_disconnected():
                        return
                    
                    if hasattr(chunk, 'candidates') and chunk.candidates:
                        candidate = chunk.candidates[0]
                        if hasattr(candidate, 'content') and getattr(candidate.content, 'parts', None):
                            for part in candidate.content.parts:
                                if hasattr(part, 'text') and part.text:
                                    if hasattr(part, 'thought') and part.thought and not is_thinking:
                                        is_thinking = True
                                        await token_queue.put('<think>\n')
                                    elif hasattr(part, 'thought') and not part.thought and is_thinking:
                                        is_thinking = False
                                        await token_queue.put('\n</think>\n\n')
                                    
                                    await token_queue.put(part.text)
            else:
                single_result = client.models.generate_content(**parameters)
                
                full_response_text = ""
                if hasattr(single_result, 'candidates') and single_result.candidates:
                    candidate = single_result.candidates[0]
                    if hasattr(candidate, 'content') and getattr(candidate.content, 'parts', None):
                        thinking_parts = []
                        content_parts = []
                        
                        for part in candidate.content.parts:
                            if hasattr(part, 'text') and part.text:
                                if hasattr(part, 'thought') and part.thought:
                                    thinking_parts.append(part.text)
                                else:
                                    content_parts.append(part.text)
                        
                        if thinking_parts:
                            full_response_text += "<think>\n" + "".join(thinking_parts) + "\n</think>\n\n"
                        full_response_text += "".join(content_parts)
                
                chunk_size = 10 
                for i in range(0, len(full_response_text), chunk_size):
                    if await fastapi_request.is_disconnected():
                        return
                    await token_queue.put(full_response_text[i:i+chunk_size])
                    await asyncio.sleep(0.03)
                    
        except Exception as ex:
            print(f"Produce tokens exception: {ex}")
            await token_queue.put({"error": str(ex)})
        finally:
            await token_queue.put(None)

    async def event_generator():
        response_text = ""
        try:
            client = Client(api_key=os.getenv('GEMINI_API_KEY'))
            model = request.model.split(':')[0]
            
            config_params = {
                "system_instruction": instructions,
                "temperature": request.temperature,
                "thinking_config": types.ThinkingConfig(
                    thinking_budget=thinking_budget,
                    include_thoughts=request.reason != 0
                )
            }
            
            if request.search:
                config_params["tools"] = [google_search_tool]
            
            parameters = {
                "model": model,
                "contents": formatted_messages,
                "config": types.GenerateContentConfig(**config_params)
            }
            
            token_queue = asyncio.Queue()
            producer_task = asyncio.create_task(produce_tokens(token_queue, request, parameters, fastapi_request, client))
            while True:
                token = await token_queue.get()
                if token is None:
                    break
                if await fastapi_request.is_disconnected():
                    break
                if isinstance(token, dict) and "error" in token:
                    yield f"data: {json.dumps(token)}\n\n"
                    break
                else:
                    response_text += token
                    yield f"data: {json.dumps({'content': token})}\n\n"

            if not producer_task.done():
                producer_task.cancel()
        except Exception as ex:
            print(f"Exception detected: {ex}", flush=True)
            yield f"data: {json.dumps({'error': str(ex)})}\n\n"
        finally:
            formatted_response = {"role": "assistant", "content": response_text or "\u200B"}
            
            if user.trial:
                user_collection.update_one(
                    {"_id": ObjectId(user.user_id)},
                    {"$inc": {"trial_remaining": -1}}
                )
            billing = calculate_billing(
                formatted_messages,
                formatted_response,
                request.in_billing,
                request.out_billing,
                request.search_billing
            )
            user_collection.update_one(
                {"_id": ObjectId(user.user_id)},
                {"$inc": {"billing": billing}}
            )
            conversation_collection.update_one(
                {"user_id": user.user_id, "conversation_id": request.conversation_id},
                {
                    "$push": {
                        "conversation": {
                            "$each": [user_message, formatted_response]
                        }
                    },
                    "$set": {
                        "model": request.model,
                        "temperature": request.temperature,
                        "reason": request.reason,
                        "system_message": request.system_message
                    }
                }
            )
    return StreamingResponse(event_generator(), media_type="text/event-stream")
    
@router.post("/gemini")
async def gemini_endpoint(chat_request: ChatRequest, fastapi_request: Request, user: User = Depends(get_current_user)):
    return get_response(chat_request, user, fastapi_request)

@router.post("/get_alias")
async def get_alias(request: AliasRequest, user: User = Depends(get_current_user)):
    try:
        client = Client(api_key=os.getenv('GEMINI_API_KEY'))
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[request.text],
            config=types.GenerateContentConfig(
                system_instruction=ALIAS_PROMPT,
                temperature=0.1,
                max_output_tokens=10
            )
        )
        alias = response.text
        
        conversation_collection.update_one(
            {"user_id": user.user_id, "conversation_id": request.conversation_id},
            {"$set": {"alias": alias}}
        )
        return {"alias": alias}
    except Exception as e:
        print(f"Exception detected: {e}", flush=True)
        return {"alias": "새 대화", "error": str(e)}