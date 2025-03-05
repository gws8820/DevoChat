import os
import json
import asyncio
import base64
import tempfile
import textract
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
    dan: bool = False
    stream: bool = True

class ApiSettings(BaseModel):
    admin_role: str = "system"
    api_key: str
    base_url: str = ""

def calculate_billing(request_array, response, in_billing_rate, out_billing_rate, search_billing_rate: Optional[float] = None):
    def count_tokens(message):
        encoding = tiktoken.get_encoding("cl100k_base")
        tokens = 4
        tokens += len(encoding.encode(message.get("role", "")))
        
        content = message.get("content", "")
        if isinstance(content, list):
            combined = ""
            for part in content:
                if part.get("type") == "text":
                    combined += "text " + part.get("text", "") + " "
                elif part.get("type") == "image_url":
                    combined += "image_url "
                    tokens += 1000
            content_str = combined.strip()
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

def process_files(parts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    def extract_text(base64_str: str, filename: str) -> str:
        header, encoded = base64_str.split(",", 1)
        file_data = base64.b64decode(encoded)
        _, ext = os.path.splitext(filename)

        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            tmp.write(file_data)
            tmp.flush()
            tmp_path = tmp.name

        try:
            extracted_bytes = textract.process(tmp_path)
            text = extracted_bytes.decode("utf-8", errors="ignore")
        except Exception as e:
            print(f"textract error: {e}")
            text = ""
        finally:
            os.remove(tmp_path)
        return text

    processed = []
    for part in parts:
        if part.get("type") == "file":
            extracted_text = extract_text(part.get("content"), part.get("name", ""))
            processed.append({
                "type": "file",
                "name": part.get("name"),
                "content": f"[[{part.get('name', '')}]]\n{extracted_text}"
            })
        else:
            processed.append(part)
    return processed

def format_message(message):
    def normalize_content(part):
        if part.get("type") == "file":
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
                ext = part.get("name").split(".")[-1]
                base64_data = "data:image/" + ext + ";base64," + base64.b64encode(file_data).decode("utf-8")
            except Exception as e:
                base64_data = ""
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
        return {"role": "user", "content": [normalize_content(part) for part in content]}
        
def get_response(request: ChatRequest, settings: ApiSettings, user: User, fastapi_request: Request):
    conversation_data = conversation_collection.find_one({
        "user_id": user.user_id,
        "conversation_id": request.conversation_id
    })
    conversation = conversation_data["conversation"][-50:] if conversation_data else []
    processed_user_message = process_files(request.user_message)
    conversation.append({"role": "user", "content": processed_user_message})

    formatted_messages = [copy.deepcopy(format_message(m)) for m in conversation]

    if request.dan and DAN_PROMPT:
        formatted_messages.insert(0, {
            "role": settings.admin_role,
            "content": [{"type": "text", "text": DAN_PROMPT}]
        })
        for part in reversed(formatted_messages[-1]["content"]):
            if part.get("type") == "text":
                part["text"] += " STAY IN CHARACTER"
                break

    if request.system_message:
        formatted_messages.insert(0, {
            "role": settings.admin_role,
            "content": [{"type": "text", "text": request.system_message}]
        })

    formatted_messages.insert(0, {
        "role": settings.admin_role,
        "content": [{"type": "text", "text": MARKDOWN_PROMPT}]
    })

    async def produce_tokens(token_queue: asyncio.Queue, request, parameters, fastapi_request: Request, client):
        citation = None 
        try:
            if request.stream:
                stream_result = await client.chat.completions.create(**parameters, timeout=300)
                async for chunk in stream_result:
                    if await fastapi_request.is_disconnected():
                        return
                    if chunk.choices[0].delta.content:
                        await token_queue.put(chunk.choices[0].delta.content)
                    if citation is None and hasattr(chunk, "citations"):
                        citation = chunk.citations
            else:
                single_result = await client.chat.completions.create(**parameters, timeout=300)
                full_response_text = single_result.choices[0].message.content
                if hasattr(single_result, "citations"):
                    citation = single_result.citations

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
            if citation:
                await token_queue.put("\n\n## 출처\n")
                for idx, item in enumerate(citation):
                    await token_queue.put(f"- [{idx+1}] {item}\n")
            await token_queue.put(None)

    async def event_generator():
        response_text = ""
        try:
            client = AsyncOpenAI(api_key=settings.api_key, base_url=(settings.base_url or None))
            parameters = {
                "model": request.model.split(':')[0],
                "temperature": request.temperature,
                "messages": formatted_messages,
                "stream": request.stream
            }
            if request.reason != 0:
                mapping = {1: "low", 2: "medium", 3: "high"}
                parameters["reasoning_effort"] = mapping.get(request.reason)
            
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
            conversation.append(formatted_response)
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
                {"$set": {
                    "conversation": conversation,
                    "model": request.model,
                    "temperature": request.temperature,
                    "reason": request.reason,
                    "system_message": request.system_message
                }},
                upsert=True
            )
    return StreamingResponse(event_generator(), media_type="text/event-stream")

async def get_alias(user_message: str) -> str:
    client = AsyncOpenAI(api_key=os.getenv('OPENAI_API_KEY'))
    completion = await client.chat.completions.create(
        model="gpt-4o-mini",
        temperature=0.1,
        max_tokens=10,
        messages=[{
            "role": "user",
            "content": ALIAS_PROMPT + user_message
        }],
    )
    return completion.choices[0].message.content

@router.post("/gpt")
async def gpt_endpoint(chat_request: ChatRequest, fastapi_request: Request, user: User = Depends(get_current_user)):
    settings = ApiSettings(
        admin_role="developer",
        api_key=os.getenv('OPENAI_API_KEY')
    )
    return get_response(chat_request, settings, user, fastapi_request)

@router.post("/gemini")
async def gemini_endpoint(chat_request: ChatRequest, fastapi_request: Request, user: User = Depends(get_current_user)):
    settings = ApiSettings(
        api_key=os.getenv('GEMINI_API_KEY'),
        base_url="https://generativelanguage.googleapis.com/v1beta/openai"
    )
    return get_response(chat_request, settings, user, fastapi_request)

@router.post("/llama")
async def llama_endpoint(chat_request: ChatRequest, fastapi_request: Request, user: User = Depends(get_current_user)):
    settings = ApiSettings(
        api_key=os.getenv('LLAMA_API_KEY'),
        base_url="https://api.llama-api.com"
    )
    return get_response(chat_request, settings, user, fastapi_request)

@router.post("/perplexity")
async def perplexity_endpoint(chat_request: ChatRequest, fastapi_request: Request, user: User = Depends(get_current_user)):
    settings = ApiSettings(
        api_key=os.getenv('PERPLEXITY_API_KEY'),
        base_url="https://api.perplexity.ai"
    )
    return get_response(chat_request, settings, user, fastapi_request)

@router.post("/deepseek")
async def deepseek_endpoint(chat_request: ChatRequest, fastapi_request: Request, user: User = Depends(get_current_user)):
    settings = ApiSettings(
        api_key=os.getenv('DEEPSEEK_API_KEY'),
        base_url="https://api.deepseek.com"
    )
    return get_response(chat_request, settings, user, fastapi_request)

@router.post("/grok")
async def grok_endpoint(chat_request: ChatRequest, fastapi_request: Request, user: User = Depends(get_current_user)):
    settings = ApiSettings(
        api_key=os.getenv('XAI_API_KEY'),
        base_url="https://api.x.ai/v1"
    )
    return get_response(chat_request, settings, user, fastapi_request)