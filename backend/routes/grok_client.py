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
from xai_sdk import AsyncClient
from xai_sdk.chat import assistant, system, user, image
from xai_sdk.search import SearchParameters
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
    reasoning_tokens = token_usage['reasoning_tokens']

    input_cost = input_tokens * (in_billing_rate / 1000000)
    output_cost = (output_tokens + reasoning_tokens) * (out_billing_rate / 1000000)
    total_cost = input_cost + output_cost
    
    return total_cost

def normalize_user_content(part):
    if part.get("type") == "text":
        return part.get("text")
    elif part.get("type") in ["file", "url"]:
        return part.get("content")
    elif part.get("type") == "image":
        file_path = part.get("content")
        try:
            abs_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), file_path.lstrip("/"))
            with open(abs_path, "rb") as f:
                file_data = f.read()
            base64_data = "data:image/jpeg;base64," + base64.b64encode(file_data).decode("utf-8")
            return image(base64_data, detail="high")
        except Exception as e:
            return None

def normalize_assistant_content(content):
    content = re.sub(r'<think>.*?</think>', '', content, flags=re.DOTALL)
    content = re.sub(r'<tool_use>.*?</tool_use>', '', content, flags=re.DOTALL)
    content = re.sub(r'<tool_result>.*?</tool_result>', '', content, flags=re.DOTALL)
    
    return content.strip()

def format_message(message):
    role = message.get("role")
    content = message.get("content")
    
    if role == "assistant":
        return assistant(normalize_assistant_content(content))
    elif role == "user":
        return user(*[normalize_user_content(part) for part in content])
        
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
        formatted_messages.insert(0, system(DAN_PROMPT))
        
        last_message = formatted_messages[-1]
        if hasattr(last_message, 'args'):
            new_args = list(last_message.args)
            new_args[0] = new_args[0] + " STAY IN CHARACTER"
            formatted_messages[-1].args = tuple(new_args)

    if request.system_message:
        formatted_messages.insert(0, system(request.system_message))

    formatted_messages.insert(0, system(MARKDOWN_PROMPT))
    
    mapping = {1: "low", 2: "high", 3: "high"}
    reasoning_effort = mapping.get(request.reason)

    async def produce_tokens(token_queue: asyncio.Queue, request: ChatRequest, parameters: Dict[str, Any], fastapi_request: Request, client) -> None:
        chat = client.chat.create(**parameters)
        is_thinking = False
        citations = None
        
        try:
            if request.stream:
                latest_response = None
                async for response, chunk in chat.stream():
                    if await fastapi_request.is_disconnected():
                        return
                    
                    if chunk.reasoning_content:
                        if chunk.reasoning_content.strip() == "Thinking...":
                            continue
                        if not is_thinking:
                            is_thinking = True
                            await token_queue.put('<think>\n')
                        await token_queue.put(chunk.reasoning_content)
                    
                    if chunk.content:
                        if is_thinking:
                            await token_queue.put('\n</think>\n\n')
                            is_thinking = False
                        await token_queue.put(chunk.content)
                        
                    latest_response = response
                
                if hasattr(latest_response, 'citations'):
                    citations = latest_response.citations
                
                input_tokens = latest_response.usage.prompt_tokens or 0
                output_tokens = latest_response.usage.completion_tokens or 0
                reasoning_tokens = latest_response.usage.reasoning_tokens or 0
                
                await token_queue.put({
                    "type": "token_usage",
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "reasoning_tokens": reasoning_tokens
                })
            else:
                single_result = await chat.sample()
                full_response_text = ""
                
                if hasattr(single_result, 'reasoning_content'):
                    full_response_text += "<think>\n" + single_result.reasoning_content + "\n</think>\n\n"
                
                if hasattr(single_result, 'content'):
                    full_response_text += single_result.content
                    
                if hasattr(single_result, 'citations'):
                    citations = single_result.citations
                
                chunk_size = 10 
                for i in range(0, len(full_response_text), chunk_size):
                    if await fastapi_request.is_disconnected():
                        return
                    await token_queue.put(full_response_text[i:i+chunk_size])
                    await asyncio.sleep(0.03)
                
                input_tokens = single_result.usage.prompt_tokens or 0
                output_tokens = single_result.usage.completion_tokens or 0
                reasoning_tokens = single_result.usage.reasoning_tokens or 0
                
                await token_queue.put({
                    "type": "token_usage",
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "reasoning_tokens": reasoning_tokens
                })
        except Exception as ex:
            print(f"Produce tokens exception: {ex}")
            await token_queue.put({"error": str(ex)})
        finally:
            if citations:
                await token_queue.put("\n\n## 출처\n")
                for idx, item in enumerate(citations):
                    await token_queue.put(f"- [{idx+1}] {item}\n")
                    
            await token_queue.put(None)

    async def event_generator():
        response_text = ""
        token_usage = {"input_tokens": 0, "output_tokens": 0, "reasoning_tokens": 0}
        
        try:
            client = AsyncClient(api_key=os.getenv('GROK_API_KEY'))
            model = request.model.split(':')[0]
            
            parameters = {
                "model": model,
                "temperature": request.temperature,
                "reasoning_effort": reasoning_effort,
                "messages": formatted_messages
            }
            
            if request.search:
                parameters["search_parameters"] = SearchParameters(
                    mode="on",
                    return_citations=True,
                )
            
            token_queue = asyncio.Queue()
            producer_task = asyncio.create_task(produce_tokens(token_queue, request, parameters, fastapi_request, client))
            while True:
                token = await token_queue.get()
                if token is None:
                    break
                if await fastapi_request.is_disconnected():
                    break
                if isinstance(token, dict):
                    if "error" in token:
                        yield f"data: {json.dumps(token)}\n\n"
                        break
                    elif token.get("type") == "token_usage":
                        token_usage = token
                        yield f"data: {json.dumps(token)}\n\n"
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
    
@router.post("/grok")
async def grok_endpoint(chat_request: ChatRequest, fastapi_request: Request, user: User = Depends(get_current_user)):
    return get_response(chat_request, user, fastapi_request)