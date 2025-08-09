from openai import AsyncOpenAI

import os
import json
import asyncio
import base64
import copy
from fastapi import Depends, Request
from fastapi.responses import StreamingResponse
from typing import Any, Dict, Optional, List
from ..auth import User, get_current_user
from ..common import (
    ChatRequest, router,
    MARKDOWN_PROMPT, DAN_PROMPT,
    check_user_permissions,
    get_conversation, save_conversation,
    normalize_assistant_content
)
from logging_util import logger

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

def normalize_user_content(part):
    if part.get("type") == "text":
        return {
            "type": "input_text",
            "text": part.get("text")
        }
    elif part.get("type") == "url":
        return {
            "type": "input_text",
            "text": part.get("content")
        }
    elif part.get("type") == "file":
        file_path = part.get("content")
        try:
            abs_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", file_path.lstrip("/")))
            with open(abs_path, "r", encoding="utf-8") as f:
                file_content = f.read()
            return {
                "type": "input_text",
                "text": file_content
            }
        except Exception as ex:
            logger.error(f"FILE_PROCESS_ERROR: {str(ex)}")
            return None
    elif part.get("type") == "image":
        file_path = part.get("content")
        try:
            abs_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", file_path.lstrip("/")))
            with open(abs_path, "rb") as f:
                file_data = f.read()
            base64_data = "data:image/jpeg;base64," + base64.b64encode(file_data).decode("utf-8")
        except Exception as ex:
            logger.error(f"IMAGE_PROCESS_ERROR: {str(ex)}")
            return None
        return {
            "type": "input_image",
            "image_url": base64_data
        }

def format_message(message):
    role = message.get("role")
    content = message.get("content")
    
    if role == "user":
        return {"role": "user", "content": [item for item in [normalize_user_content(part) for part in content] if item is not None]}
    elif role == "assistant":
        return {"role": "assistant", "content": normalize_assistant_content(content)}

async def process_stream(chunk_queue: asyncio.Queue, request, parameters, fastapi_request: Request, client):
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
                        await chunk_queue.put('<think>\n')
                    await chunk_queue.put(chunk.delta)
                elif chunk.type == "response.output_text.delta":
                    if is_thinking:
                        await chunk_queue.put('\n</think>\n\n')
                        is_thinking = False
                    await chunk_queue.put(chunk.delta)
                elif chunk.type == "response.completed":
                    if chunk.response.usage:
                        input_tokens = chunk.response.usage.input_tokens or 0
                        output_tokens = chunk.response.usage.output_tokens or 0
                        
                        await chunk_queue.put({
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
                        
                        await chunk_queue.put(f"\n\n<tool_use>\n{json.dumps({'tool_id': tool_id, 'server_name': server_name, 'tool_name': tool_name}, ensure_ascii=False)}\n</tool_use>\n")
                    elif hasattr(chunk, "item") and getattr(chunk.item, "type", "") == "web_search_call":
                        tool_id = getattr(chunk.item, "id")
                        tool_name = "web_search"
                        server_name = "GPT"
                        
                        mcp_tools[tool_id] = {
                            "server_name": server_name,
                            "tool_name": tool_name
                        }
                        
                        await chunk_queue.put(f"\n\n<tool_use>\n{json.dumps({'tool_id': tool_id, 'server_name': server_name, 'tool_name': tool_name}, ensure_ascii=False)}\n</tool_use>\n")
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
                            
                            await chunk_queue.put(f"\n<tool_result>\n{json.dumps({'tool_id': tool_id, 'server_name': server_name, 'tool_name': tool_name, 'is_error': is_error, 'result': result}, ensure_ascii=False)}\n</tool_result>\n\n")
                    elif hasattr(chunk, "item") and getattr(chunk.item, "type", "") == "web_search_call":
                        tool_id = getattr(chunk.item, "id")
                        tool_info = mcp_tools.get(tool_id)
                        
                        if tool_info:
                            server_name = tool_info["server_name"]
                            tool_name = tool_info["tool_name"]
                            
                            is_error = getattr(chunk.item, "status", "") != "completed"
                            
                            await chunk_queue.put(f"\n<tool_result>\n{json.dumps({'tool_id': tool_id, 'server_name': server_name, 'tool_name': tool_name, 'is_error': is_error, 'result': ''}, ensure_ascii=False)}\n</tool_result>\n\n")
        else:
            single_result = await client.responses.create(**parameters)
            full_response_text = single_result.output_text
            
            chunk_size = 10 
            for i in range(0, len(full_response_text), chunk_size):
                if await fastapi_request.is_disconnected():
                    return
                await chunk_queue.put(full_response_text[i:i+chunk_size])
                await asyncio.sleep(0.03)
            
            input_tokens = single_result.usage.input_tokens or 0
            output_tokens = single_result.usage.output_tokens or 0
            
            await chunk_queue.put({
                "type": "token_usage",
                "input_tokens": input_tokens,
                "output_tokens": output_tokens
            })
    except Exception as ex:
        logger.error(f"STREAM_ERROR: {str(ex)}")
        await chunk_queue.put({"error": str(ex)})
    finally:
        await client.close()
        await chunk_queue.put(None)

async def get_response(request: ChatRequest, user: User, fastapi_request: Request):
    error_message, in_billing, out_billing = check_user_permissions(user, request)
    if error_message:
        yield f"data: {json.dumps({'error': error_message})}\n\n"
        return
    
    user_message = {"role": "user", "content": request.user_message}
    conversation = get_conversation(user, request.conversation_id)
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

    response_text = ""
    token_usage = None
    
    try:
        async with AsyncOpenAI(api_key=os.getenv('OPENAI_API_KEY')) as client:
            parameters = {
                "model": request.model.split(':')[0],
                "temperature": request.temperature,
                "instructions": instructions,
                "input": formatted_messages,
                "stream": request.stream,
                "background": bool(request.stream and (request.reason or request.deep_research) and not request.mcp)
            }

            if request.reason > 0:
                mapping = {1: "low", 2: "medium", 3: "high"}
                reasoning_effort = mapping.get(request.reason)
                parameters["reasoning"] = {
                    "effort": reasoning_effort,
                    "summary": "auto"
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
                
            chunk_queue = asyncio.Queue()
            stream_task = asyncio.create_task(process_stream(chunk_queue, request, parameters, fastapi_request, client))
            while True:
                chunk = await chunk_queue.get()
                if chunk is None:
                    break
                if await fastapi_request.is_disconnected():
                    break
                if isinstance(chunk, dict):
                    if "error" in chunk:
                        yield f"data: {json.dumps(chunk)}\n\n"
                        break
                    elif chunk.get("type") == "token_usage":
                        token_usage = chunk
                else:
                    response_text += chunk
                    yield f"data: {json.dumps({'content': chunk})}\n\n"

            if not stream_task.done():
                stream_task.cancel()
    except Exception as ex:
        logger.error(f"RESPONSE_ERROR: {str(ex)}")
        yield f"data: {json.dumps({'error': str(ex)})}\n\n"
    finally:
        save_conversation(user, user_message, response_text, token_usage, request, in_billing, out_billing)
    
@router.post("/gpt")
async def openai_endpoint(chat_request: ChatRequest, fastapi_request: Request, user: User = Depends(get_current_user)):
    return StreamingResponse(get_response(chat_request, user, fastapi_request), media_type="text/event-stream")