import os
import json
import asyncio
import base64
import copy
import re
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
    temperature: float = 1.0
    reason: int = 0
    system_message: Optional[str] = None
    user_message: List[Dict[str, Any]]
    inference: bool = False
    search: bool = False
    deep_research: bool = False
    dan: bool = False
    mcp: List[str] = []
    stream: bool = True

class AliasRequest(BaseModel):
    conversation_id: str
    text: str

def calculate_billing(in_billing_rate, out_billing_rate, token_usage):
    input_tokens = token_usage['input_tokens']
    output_tokens = token_usage['output_tokens']
    thinking_tokens = token_usage['thinking_tokens']
    
    input_cost = input_tokens * (in_billing_rate / 1000000)
    output_cost = (output_tokens + thinking_tokens) * (out_billing_rate / 1000000)
    total_cost = input_cost + output_cost
    
    return total_cost

def normalize_user_content(part):
    if part.get("type") == "text":
        return types.Part(text=part.get("text"))
    elif part.get("type") in ["file", "url"]:
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
    return types.Part(text=str(part))

def normalize_assistant_content(content):
    content = re.sub(r'<think>.*?</think>', '', content, flags=re.DOTALL)
    content = re.sub(r'<tool_use>.*?</tool_use>', '', content, flags=re.DOTALL)
    content = re.sub(r'<tool_result>.*?</tool_result>', '', content, flags=re.DOTALL)
    
    return content.strip()

def format_message(message):
    role = message.get("role")
    content = message.get("content")
    
    if role == "assistant":
        return types.Content(
            role="model",
            parts=[types.Part(text=normalize_assistant_content(content))]
        )
    elif role == "user":
        return types.Content(
            role="user",
            parts=[item for item in [normalize_user_content(part) for part in content] if item is not None]
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
            part.text += " STAY IN CHARACTER"
            break

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
                    
                    if hasattr(chunk, 'candidates'):
                        candidate = chunk.candidates[0]
                        if hasattr(candidate, 'content') and candidate.content.parts:
                            for part in candidate.content.parts:
                                if hasattr(part, 'text'):
                                    if hasattr(part, 'thought') and part.thought and not is_thinking:
                                        is_thinking = True
                                        await token_queue.put('<think>\n')
                                    elif hasattr(part, 'thought') and not part.thought and is_thinking:
                                        is_thinking = False
                                        await token_queue.put('\n</think>\n\n')
                                    
                                    await token_queue.put(part.text)
                                    
                    if hasattr(chunk, 'usage_metadata'):
                        usage_metadata = chunk.usage_metadata
                        input_tokens = usage_metadata.prompt_token_count or 0
                        output_tokens = usage_metadata.candidates_token_count or 0
                        thinking_tokens = usage_metadata.thoughts_token_count or 0
                        
                        await token_queue.put({
                            "type": "token_usage",
                            "input_tokens": input_tokens,
                            "output_tokens": output_tokens, 
                            "thinking_tokens": thinking_tokens
                        })
            else:
                single_result = client.models.generate_content(**parameters)
                full_response_text = ""
                
                if hasattr(single_result, 'candidates'):
                    candidate = single_result.candidates[0]
                    if hasattr(candidate, 'content') and candidate.content.parts:
                        thinking_parts = []
                        content_parts = []
                        
                        for part in candidate.content.parts:
                            if hasattr(part, 'text'):
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
                    
                input_tokens = single_result.usage_metadata.prompt_token_count or 0
                output_tokens = single_result.usage_metadata.candidates_token_count or 0
                thinking_tokens = single_result.usage_metadata.thoughts_token_count or 0
                
                await token_queue.put({
                    "type": "token_usage",
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "thinking_tokens": thinking_tokens
                })
        except Exception as ex:
            print(f"Produce tokens exception: {ex}")
            await token_queue.put({"error": str(ex)})
        finally:
            await token_queue.put(None)

    async def event_generator():
        response_text = ""
        token_usage = {"input_tokens": 0, "output_tokens": 0, "thinking_tokens": 0}
        
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
                config_params["tools"] = [types.Tool(google_search = types.GoogleSearch())]
            
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
                if isinstance(token, dict) and token.get("type") == "token_usage":
                    token_usage = token
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
            billing = calculate_billing(request.in_billing, request.out_billing, token_usage)
            
            if user.trial:
                user_collection.update_one(
                    {"_id": ObjectId(user.user_id)},
                    {"$inc": {"trial_remaining": -1}}
                )
            else:
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
                        "system_message": request.system_message,
                        "inference": request.inference,
                        "search": request.search,
                        "deep_research": request.deep_research,
                        "dan": request.dan,
                        "mcp": request.mcp
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
        alias = response.text.strip()
        
        conversation_collection.update_one(
            {"user_id": user.user_id, "conversation_id": request.conversation_id},
            {"$set": {"alias": alias}}
        )
        return {"alias": alias}
    except Exception as e:
        print(f"Exception detected: {e}", flush=True)
        return {"alias": "새 대화", "error": str(e)}