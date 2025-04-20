import os
import json
import asyncio
import base64
import shutil
import time
import copy
import tiktoken
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, Request, File, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from pymongo import MongoClient
from bson import ObjectId
from typing import Any, Union, List, Dict, Optional
from openai import AsyncOpenAI
from .auth import User, get_current_user

load_dotenv()

router = APIRouter()
mongoclient = MongoClient(os.getenv('MONGODB_URI'))
db = mongoclient.chat_db
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

def calculate_billing(request_array, response, in_billing_rate, out_billing_rate, search_billing_rate: Optional[float] = None):
    def count_tokens(message):
        encoding = tiktoken.get_encoding("cl100k_base")
        tokens = 4
        tokens += len(encoding.encode(message.get("role", "")))
        
        content = message.get("content", "")
        if isinstance(content, list):
            for part in content:
                if part.get("type") == "input_text":
                    content_str = "input_text " + part.get("input_text", "") + " "
                elif part.get("type") == "input_image":
                    content_str = "input_image "
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
                "type": "input_text",
                "text": part.get("content")
            }
        elif part.get("type") == "image":
            file_path = part.get("content")
            try:
                abs_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), file_path.lstrip("/"))
                with open(abs_path, "rb") as f:
                    file_data = f.read()
                ext = part.get("name").split(".")[-1]
                base64_data = "data:image/" + ext + ";base64," + base64.b64encode(file_data).decode("utf-8")
            except Exception as e:
                base64_data = ""
            return {
                "type": "input_image",
                "image_url": base64_data
            }
        elif part.get("type") == "url":
            return {
                "type": "input_text",
                "text": part.get("content")
            }
        return {
            "type": "input_text",
            "text": part.get("text")
        }

    role = message.get("role")
    content = message.get("content")
    if role == "assistant":
        return {"role": "assistant", "content": content}
    elif role == "user":
        return {"role": "user", "content": [normalize_content(part) for part in content]}

def get_response(request: ChatRequest, user: User, fastapi_request: Request):
    async def error_generator(error_message):
        yield f"data: {json.dumps({'content': error_message})}\n\n"

    if user.trial and user.trial_remaining <= 0:
        error_message = "체험판이 종료되었습니다.\n\n자세한 정보는 admin@shilvister.net으로 문의해 주세요."
        return StreamingResponse(error_generator(error_message), media_type="text/event-stream")
    elif not user.admin and request.in_billing >= 10:
        error_message = "해당 모델을 사용할 권한이 없습니다.\n\n자세한 정보는 admin@shilvister.net으로 문의해 주세요."
        return StreamingResponse(error_generator(error_message), media_type="text/event-stream")

    user_message = {"role": "user", "content": request.user_message}

    conversation = conversation_collection.find_one(
        {"user_id": user.user_id, "conversation_id": request.conversation_id},
        {"conversation": {"$slice": -8}}
    ).get("conversation", [])
    conversation.append(user_message)

    formatted_messages = [format_message(m) for m in conversation]

    instructions = MARKDOWN_PROMPT
    if request.system_message:
        instructions += "\n\n" + request.system_message
    if request.dan and DAN_PROMPT:
        instructions += "\n\n" + DAN_PROMPT
        for part in reversed(formatted_messages[-1]["content"]):
            if part.get("type") == "input_text":
                part["input_text"] += " STAY IN CHARACTER"
                break

    mapping = {1: "low", 2: "medium", 3: "high"}
    reasoning_effort = mapping.get(request.reason) or None

    async def produce_tokens(token_queue: asyncio.Queue, request, parameters, fastapi_request: Request, client):
        citation = None
        is_thinking = False
        try:
            if request.stream:
                stream_result = await client.responses.create(**parameters, timeout=300)
                async for chunk in stream_result:
                    if await fastapi_request.is_disconnected():
                        return
                    if hasattr(chunk, "type") and chunk.type == "response.reasoning_summary_text.delta":
                        if not is_thinking:
                            is_thinking = True
                            await token_queue.put('<think>\n')
                        await token_queue.put(chunk.delta)
                    if hasattr(chunk, "type") and chunk.type == "response.output_text.delta":
                        if is_thinking:
                            await token_queue.put('\n</think>\n\n')
                            is_thinking = False
                        await token_queue.put(chunk.delta)
            else:
                single_result = await client.responses.create(**parameters, timeout=300)
                full_response_text = single_result.output_text

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
            async with AsyncOpenAI(api_key=os.getenv('OPENAI_API_KEY')) as client:
                parameters = {
                    "model": request.model.split(':')[0],
                    "temperature": request.temperature,
                    "reasoning": {
                        "effort": reasoning_effort,
                        "summary": "auto"
                    },
                    "instructions": instructions,
                    "input": formatted_messages,
                    "stream": request.stream
                }

                if request.search:
                    parameters["tools"] = [{"type": "web_search_preview"}]

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
            formatted_messages.insert(0, {"role": "system", "content": instructions})
            formatted_response = {"role": "assistant", "content": response_text or "\u200B"}
            if user.trial:
                user_collection.update_one(
                    {"_id": ObjectId(user.user_id)},
                    {"$inc": {"trial_remaining": -1}}
                )
            else:
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

async def get_alias(user_message: str) -> str:
    async with AsyncOpenAI(api_key=os.getenv('OPENAI_API_KEY')) as client:
        completion = await client.chat.completions.create(
            model="gpt-4.1-nano",
            temperature=0.1,
            max_tokens=10,
            messages=[{
                "role": "user",
                "content": ALIAS_PROMPT + user_message
            }],
        )
    
    return completion.choices[0].message.content.rstrip()

@router.post("/gpt")
async def gpt_endpoint(chat_request: ChatRequest, fastapi_request: Request, user: User = Depends(get_current_user)):
    return get_response(chat_request, user, fastapi_request)