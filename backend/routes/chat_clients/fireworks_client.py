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
    DEFAULT_PROMPT, DAN_PROMPT,
    check_user_permissions,
    get_conversation, save_conversation,
    normalize_assistant_content,
    getReason, getVerbosity,
    STREAM_COOLDOWN_SECONDS,
        
    ApiSettings,
    RawChunk
)
from logging_util import logger

def get_mcp_servers(server_ids: List[str], current_user: User) -> tuple[List[Dict[str, Any]], Optional[str]]:
    try:
        config_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "config", "mcp_servers.json"))
        with open(config_path, "r", encoding="utf-8") as f:
            mcp_server_configs = json.load(f)
    except Exception as ex:
        logger.error(f"MCP_SERVER_FETCH_ERROR: {str(ex)}")
        return [], "서버 오류가 발생했습니다."
    
    server_list = []
    
    for server_id in server_ids:
        if server_id not in mcp_server_configs:
            logger.warning(json.dumps({"event": "INVALID_MCP_SERVER_ERROR", "username": current_user.name, "server_id": server_id}, ensure_ascii=False, indent=2))
            continue
        
        server_config = mcp_server_configs[server_id]
        
        if server_config.get("admin") and not current_user.admin:
            logger.warning(json.dumps({"event": "MCP_SERVER_PERMISSION_ERROR", "username": current_user.name, "server_id": server_id}, ensure_ascii=False, indent=2))
            return [], "잘못된 접근입니다."
        
        server_url = server_config["url"]
        token = server_config.get("authorization_token")
        if token:
            if "access_token=" not in server_url:
                sep = "&" if "?" in server_url else "?"
                server_url = f"{server_url}{sep}access_token={token}"

        mcp_server = {
            "type": "mcp",
            "server_url": server_url
        }
        
        server_list.append(mcp_server)
    
    return server_list, None

def get_search_tool():
    return {
        "type": "mcp",
        "server_url": os.getenv("PERPLEXITY_MCP_URL")
    }

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
    first_chunk = True
    has_reasoning = "reasoning" in parameters
    mcp_tools = {}
    tool_id = None
    try:
        if request.stream:
            stream_result = await client.responses.create(**parameters)
            async for chunk in stream_result:
                if await fastapi_request.is_disconnected():
                    return
                if chunk.type == "response.output_text.delta":
                    if chunk.delta:
                        if first_chunk and request.inference and '<think>' not in chunk.delta:
                            await chunk_queue.put('<think>\n')
                            first_chunk = False
                        
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
                        mcp_info = getattr(chunk.item, "mcp", {})
                        server_name = "Fireworks"
                        tool_name = mcp_info.get("name")
                        
                        mcp_tools[tool_id] = {"tool_name": tool_name}
                        
                        await chunk_queue.put(RawChunk(
                            f"\n\n<tool_use>\n{json.dumps({'tool_id': tool_id, 'server_name': server_name, 'tool_name': tool_name}, ensure_ascii=False)}\n</tool_use>\n"
                        ))
                elif chunk.type == "response.mcp_call.completed":
                    if tool_id:
                        tool_info = mcp_tools.get(tool_id)
                        
                        if tool_info:
                            server_name = "Fireworks"
                            tool_name = tool_info["tool_name"]
                            
                            await chunk_queue.put(RawChunk(
                                f"\n<tool_result>\n{json.dumps({'tool_id': tool_id, 'server_name': server_name, 'tool_name': tool_name, 'is_error': False}, ensure_ascii=False)}\n</tool_result>\n\n"
                            ))
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

async def get_response(request: ChatRequest, settings: ApiSettings, user: User, fastapi_request: Request):
    error_message, in_billing, out_billing = check_user_permissions(user, request)
    if error_message:
        yield f"data: {json.dumps({'error': error_message})}\n\n"
        return
    
    user_message = {"role": "user", "content": request.user_message}
    conversation = get_conversation(user, request.conversation_id, request.memory)
    conversation.append(user_message)

    formatted_messages = copy.deepcopy([format_message(m) for m in conversation])

    instructions = DEFAULT_PROMPT
    if request.control.system_message and request.system_message:
        instructions += "\n\n" + request.system_message
    if request.dan and DAN_PROMPT:
        instructions += "\n\n" + DAN_PROMPT
        for part in reversed(formatted_messages[-1]["content"]):
            if part.get("type") == "text":
                part["text"] += " STAY IN CHARACTER"
                break

    response_text = ""
    token_usage = None
    
    client_disconnected = False
    
    try:
        async with AsyncOpenAI(
            api_key=settings.api_key,
            base_url=settings.base_url,
            default_headers=settings.headers or {}
        ) as client:
            parameters = {
                "model": request.model,
                "temperature": request.temperature if request.control.temperature else 1.0,
                "instructions": instructions,
                "input": formatted_messages,
                "stream": request.stream,
                "tools": []
            }
            
            if request.control.verbosity and request.verbosity:
                parameters["text"] = {"verbosity": getVerbosity(request.verbosity, "tertiary")}
            
            if request.control.reason and request.reason:
                reason_effort = getReason(request.reason, "tertiary")
                parameters["reasoning"] = {
                    "effort": reason_effort,
                    "summary": "auto"
                }

            if request.search:
                parameters["tools"].append(get_search_tool())

            if len(request.mcp) > 0:
                mcp_list = [m for m in request.mcp if not (request.search and m == "perplexity")]
                if mcp_list:
                    mcp_servers, error = get_mcp_servers(mcp_list, user)
                    if error:
                        yield f"data: {json.dumps({'error': error})}\n\n"
                        return
                    parameters["tools"].extend(mcp_servers)
                
            chunk_queue = asyncio.Queue()
            stream_task = asyncio.create_task(process_stream(chunk_queue, request, parameters, fastapi_request, client))
            
            while True:
                chunk = await chunk_queue.get()
                if chunk is None:
                    break
                if await fastapi_request.is_disconnected():
                    client_disconnected = True
                    break
                if isinstance(chunk, dict):
                    if "error" in chunk:
                        yield f"data: {json.dumps(chunk)}\n\n"
                        break
                    elif chunk.get("type") == "token_usage":
                        token_usage = chunk
                        continue
                if isinstance(chunk, RawChunk):
                    text_chunk = chunk.content
                    response_text += text_chunk
                    yield f"data: {json.dumps({'content': text_chunk})}\n\n"
                else:
                    text_chunk = chunk
                    response_text += text_chunk
                    
                    step = 3
                    for i in range(0, len(text_chunk), step):
                        if await fastapi_request.is_disconnected():
                            client_disconnected = True
                            break
                        
                        sub_chunk = text_chunk[i:i+step]
                        yield f"data: {json.dumps({'content': sub_chunk})}\n\n"
                
                if client_disconnected:
                    break

            if not stream_task.done():
                stream_task.cancel()
    except Exception as ex:
        logger.error(f"RESPONSE_ERROR: {str(ex)}")
        yield f"data: {json.dumps({'error': str(ex)})}\n\n"
    finally:
        save_conversation(user, user_message, response_text, token_usage, request, in_billing, out_billing)