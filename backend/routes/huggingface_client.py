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
from typing import Any, Union, List, Dict, Optional
from huggingface_hub import AsyncInferenceClient
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

def calculate_billing(request_array, response, in_billing_rate, out_billing_rate, search_billing_rate: Optional[float] = None):
    def count_tokens(message):
        encoding = tiktoken.get_encoding("cl100k_base")
        tokens = 4
        tokens += len(encoding.encode(message.get("role", "")))
        
        content = message.get("content", "")
        if isinstance(content, list):
            for part in content:
                if part.get("type") == "text":
                    content_str = "text " + part.get("text", "") + " "
                elif part.get("type") == "image_url":
                    content_str = "image_url "
                    tokens += 1024
        else:
            content_str = content
        tokens += len(encoding.encode(content_str))
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
            return {
                "type": "text",
                "text": part.get("content")
            }
        elif part.get("type") == "image":
            file_path = part.get("content")
            try:
                abs_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), file_path.lstrip("/"))
                with open(abs_path, "rb") as f:
                    file_data = f.read()
                base64_data = "data:image/jpeg;base64," + base64.b64encode(file_data).decode("utf-8")
            except Exception as e:
                return None
            return {
                "type": "image_url",
                "image_url": {"url": base64_data}
            }
        return part

    role = message.get("role")
    content = message.get("content")
    if role == "assistant":
        return {"role": "assistant", "content": content}
    elif role == "user":
        return {"role": "user", "content": [item for item in [normalize_content(part) for part in content] if item is not None]}
        
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

    if request.dan and DAN_PROMPT:
        formatted_messages.insert(0, {
            "role": "system",
            "content": [{"type": "text", "text": DAN_PROMPT}]
        })
        for part in reversed(formatted_messages[-1]["content"]):
            if part.get("type") == "text":
                part["text"] += " STAY IN CHARACTER"
                break

    if request.system_message:
        formatted_messages.insert(0, {
            "role": "system",
            "content": [{"type": "text", "text": request.system_message}]
        })

    formatted_messages.insert(0, {
        "role": "system",
        "content": [{"type": "text", "text": MARKDOWN_PROMPT}]
    })

    async def produce_tokens(token_queue: asyncio.Queue, request, parameters, fastapi_request: Request, client):
        try:
            if request.stream:
                stream_result = await client.chat.completions.create(**parameters)
                async for chunk in stream_result:
                    if await fastapi_request.is_disconnected():
                        return
                    if chunk.choices[0].delta.content:
                        await token_queue.put(chunk.choices[0].delta.content)
            else:
                single_result = await client.chat.completions.create(**parameters)
                full_response_text = single_result.choices[0].message.content

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
            await client.close()
            await token_queue.put(None)

    async def event_generator():
        response_text = ""
        try:
            async with AsyncInferenceClient(api_key=os.getenv('HUGGINGFACE_API_KEY'), provider="fireworks-ai") as client:
                parameters = {
                    "model": request.model.split(':')[0],
                    "temperature": request.temperature,
                    "messages": formatted_messages,
                    "stream": request.stream,
                    "max_tokens": 4096
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

@router.post("/huggingface")
async def deepseek_endpoint(chat_request: ChatRequest, fastapi_request: Request, user: User = Depends(get_current_user)):
    return get_response(chat_request, user, fastapi_request)