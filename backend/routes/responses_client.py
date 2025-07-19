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
from openai import AsyncOpenAI
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

def get_mcp_servers(server_ids: List[str], current_user: User) -> tuple[List[Dict[str, Any]], Optional[str]]:
    try:
        with open("mcp_servers.json", "r", encoding="utf-8") as f:
            mcp_server_configs = json.load(f)
    except Exception:
        return [], "서버 오류가 발생했습니다."
    
    server_list = []
    
    for server_id in server_ids:
        if server_id not in mcp_server_configs:
            return [], "잘못된 접근입니다."
        
        server_config = mcp_server_configs[server_id]
        
        if server_config.get("admin") and not current_user.admin:
            return [], "잘못된 접근입니다."
        
        mcp_server = {
            "type": "mcp",
            "server_label": server_config["name"],
            "server_url": server_config["url"],
            "require_approval": "never",
            "headers": {
                "Authorization": f"Bearer {server_config['authorization_token']}"
            }
        }
        
        server_list.append(mcp_server)
    
    return server_list, None

def calculate_billing(in_billing_rate, out_billing_rate, token_usage):
    input_tokens = token_usage['input_tokens']
    output_tokens = token_usage['output_tokens']

    input_cost = input_tokens * (in_billing_rate / 1000000)
    output_cost = output_tokens * (out_billing_rate / 1000000)
    total_cost = input_cost + output_cost
    
    return total_cost

def normalize_user_content(part):
    if part.get("type") == "text":
        return {
            "type": "input_text",
            "text": part.get("text")
        }
    elif part.get("type") in ["file", "url"]:
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
            base64_data = "data:image/jpeg;base64," + base64.b64encode(file_data).decode("utf-8")
        except Exception as e:
            return None
        return {
            "type": "input_image",
            "image_url": base64_data
        }

def normalize_assistant_content(content):
    content = re.sub(r'<think>.*?</think>', '', content, flags=re.DOTALL)
    content = re.sub(r'<tool_use>.*?</tool_use>', '', content, flags=re.DOTALL)
    content = re.sub(r'<tool_result>.*?</tool_result>', '', content, flags=re.DOTALL)
    
    return content.strip()

def format_message(message):
    role = message.get("role")
    content = message.get("content")
    if role == "assistant":
        return {"role": "assistant", "content": normalize_assistant_content(content)}
    elif role == "user":
        return {"role": "user", "content": [item for item in [normalize_user_content(part) for part in content] if item is not None]}

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
        for part in reversed(formatted_messages[-1]["content"]):
            if part.get("type") == "text":
                part["text"] += " STAY IN CHARACTER"
                break

    mapping = {1: "low", 2: "medium", 3: "high"}
    reasoning_effort = mapping.get(request.reason)

    async def produce_tokens(token_queue: asyncio.Queue, request, parameters, fastapi_request: Request, client):
        is_thinking = False
        mcp_tools = {}
        try:
            if request.stream:
                stream_result = await client.responses.create(**parameters)
                async for chunk in stream_result:
                    if await fastapi_request.is_disconnected():
                        return
                    if chunk.type == "response.reasoning_summary_text.delta":
                        if not is_thinking:
                            is_thinking = True
                            await token_queue.put('<think>\n')
                        await token_queue.put(chunk.delta)
                    elif chunk.type == "response.output_text.delta":
                        if is_thinking:
                            await token_queue.put('\n</think>\n\n')
                            is_thinking = False
                        await token_queue.put(chunk.delta)
                    elif chunk.type == "response.completed":
                        if hasattr(chunk, 'response') and hasattr(chunk.response, 'usage') and chunk.response.usage:
                            input_tokens = chunk.response.usage.input_tokens or 0
                            output_tokens = chunk.response.usage.output_tokens or 0
                            
                            await token_queue.put({
                                "type": "token_usage",
                                "input_tokens": input_tokens,
                                "output_tokens": output_tokens
                            })
                    elif chunk.type == "response.output_item.added":
                        if hasattr(chunk, "item") and getattr(chunk.item, "type", "") == "mcp_call":
                            tool_id = getattr(chunk.item, "id")
                            tool_name = getattr(chunk.item, "name")
                            server_name = getattr(chunk.item, "server_label")
                            
                            mcp_tools[tool_id] = {
                                "server_name": server_name,
                                "tool_name": tool_name
                            }
                            
                            await token_queue.put(f"\n\n<tool_use>\n{json.dumps({'tool_id': tool_id, 'server_name': server_name, 'tool_name': tool_name}, ensure_ascii=False)}\n</tool_use>\n")
                        elif hasattr(chunk, "item") and getattr(chunk.item, "type", "") == "web_search_call":
                            tool_id = getattr(chunk.item, "id")
                            tool_name = "web_search"
                            server_name = "OpenAI"
                            
                            mcp_tools[tool_id] = {
                                "server_name": server_name,
                                "tool_name": tool_name
                            }
                            
                            await token_queue.put(f"\n\n<tool_use>\n{json.dumps({'tool_id': tool_id, 'server_name': server_name, 'tool_name': tool_name}, ensure_ascii=False)}\n</tool_use>\n")
                    elif hasattr(chunk, "type") and chunk.type == "response.output_item.done":
                        if hasattr(chunk, "item") and getattr(chunk.item, "type", "") == "mcp_call":
                            tool_id = getattr(chunk.item, "id")
                            tool_info = mcp_tools.get(tool_id)
                            
                            if tool_info:
                                server_name = tool_info["server_name"]
                                tool_name = tool_info["tool_name"]
                                
                                is_error = getattr(chunk.item, "error") is not None
                                
                                if is_error:
                                    error_obj = getattr(chunk.item, "error")
                                    if isinstance(error_obj, dict) and "content" in error_obj:
                                        result = error_obj["content"][0]["text"]
                                    else:
                                        result = ""
                                else:
                                    result = getattr(chunk.item, "output", "")
                                
                                await token_queue.put(f"\n<tool_result>\n{json.dumps({'tool_id': tool_id, 'server_name': server_name, 'tool_name': tool_name, 'is_error': is_error, 'result': result}, ensure_ascii=False)}\n</tool_result>\n\n")
                        elif hasattr(chunk, "item") and getattr(chunk.item, "type", "") == "web_search_call":
                            tool_id = getattr(chunk.item, "id")
                            tool_info = mcp_tools.get(tool_id)
                            
                            if tool_info:
                                server_name = tool_info["server_name"]
                                tool_name = tool_info["tool_name"]
                                
                                is_error = getattr(chunk.item, "status", "") != "completed"
                                
                                await token_queue.put(f"\n<tool_result>\n{json.dumps({'tool_id': tool_id, 'server_name': server_name, 'tool_name': tool_name, 'is_error': is_error, 'result': ''}, ensure_ascii=False)}\n</tool_result>\n\n")
            else:
                single_result = await client.responses.create(**parameters)
                full_response_text = single_result.output_text
                
                chunk_size = 10 
                for i in range(0, len(full_response_text), chunk_size):
                    if await fastapi_request.is_disconnected():
                        return
                    await token_queue.put(full_response_text[i:i+chunk_size])
                    await asyncio.sleep(0.03)
                
                input_tokens = single_result.usage.input_tokens or 0
                output_tokens = single_result.usage.output_tokens or 0
                
                await token_queue.put({
                    "type": "token_usage",
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens
                })
        except Exception as ex:
            print(f"Produce tokens exception: {ex}")
            await token_queue.put({"error": str(ex)})
        finally:
            await client.close()
            await token_queue.put(None)

    async def event_generator():
        response_text = ""
        token_usage = {"input_tokens": 0, "output_tokens": 0}
        
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
                    "stream": request.stream,
                    "background": bool(request.stream and (request.reason or request.deep_research) and not request.mcp)
                }

                if request.search:
                    parameters["tools"] = [{"type": "web_search_preview"}]
                if request.deep_research:
                    parameters["tools"] = [
                        {"type": "web_search_preview"}, 
                        {"type": "code_interpreter", "container": {"type": "auto"}}
                    ]
                if len(request.mcp) > 0:
                    mcp_servers, error = get_mcp_servers(request.mcp, user)
                    if error:
                        yield f"data: {json.dumps({'error': error})}\n\n"
                        return
                    parameters["tools"] = mcp_servers
                    
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
    
@router.post("/gpt")
async def gpt_endpoint(chat_request: ChatRequest, fastapi_request: Request, user: User = Depends(get_current_user)):
    return get_response(chat_request, user, fastapi_request)