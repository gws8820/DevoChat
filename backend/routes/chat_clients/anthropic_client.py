import anthropic

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
    ChatRequest, router, RawChunk,
    DEFAULT_PROMPT, DAN_PROMPT,
    check_user_permissions,
    get_conversation, save_conversation,
    normalize_assistant_content,
    getReason, getVerbosity,
    MAX_VERBOSITY_TOKENS
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
        
        mcp_server = {
            "type": "url",
            "url": server_config["url"],
            "name": server_config["name"],
            "authorization_token": server_config["authorization_token"]
        }
        
        server_list.append(mcp_server)
    
    return server_list, None

def normalize_user_content(part):
    if part.get("type") == "url":
        return {
            "type": "text",
            "text": part.get("content")
        }
    elif part.get("type") == "file":
        file_path = part.get("content")
        try:
            abs_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", file_path.lstrip("/")))
            with open(abs_path, "r", encoding="utf-8") as f:
                file_content = f.read()
            return {
                "type": "text",
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
            base64_data = base64.b64encode(file_data).decode("utf-8")
        except Exception as ex:
            logger.error(f"IMAGE_PROCESS_ERROR: {str(ex)}")
            return None
        return {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/jpeg",
                "data": base64_data,
            },
        }
    return part

def format_message(message):
    role = message.get("role")
    content = message.get("content")
    
    if role == "user":
        return {"role": "user", "content": [item for item in [normalize_user_content(part) for part in content] if item is not None]}
    elif role == "assistant":
        return {"role": "assistant", "content": normalize_assistant_content(content)}
        
async def process_stream(chunk_queue: asyncio.Queue, request: ChatRequest, parameters, fastapi_request: Request, client) -> None:
    is_thinking = False
    citations = []
    mcp_tools = {}
    try:
        if request.stream:
            stream_result = await client.beta.messages.create(**parameters)
            async for chunk in stream_result:
                if await fastapi_request.is_disconnected():
                    return
                if hasattr(chunk, "type"):
                    if chunk.type == "content_block_start" and hasattr(chunk, "content_block"):
                        if getattr(chunk.content_block, "type", "") == "thinking":
                            is_thinking = True
                            await chunk_queue.put('<think>\n')
                        elif getattr(chunk.content_block, "type", "") == "mcp_tool_use":
                            tool_id = getattr(chunk.content_block, "id")
                            server_name = getattr(chunk.content_block, "server_name")
                            tool_name = getattr(chunk.content_block, "name")
                            
                            mcp_tools[tool_id] = {
                                "server_name": server_name,
                                "tool_name": tool_name
                            }
                            
                            await chunk_queue.put(RawChunk(
                                f"\n\n<tool_use>\n{json.dumps({'tool_id': tool_id, 'server_name': server_name, 'tool_name': tool_name}, ensure_ascii=False)}\n</tool_use>\n"
                            ))
                        elif getattr(chunk.content_block, "type", "") == "mcp_tool_result":
                            tool_use_id = getattr(chunk.content_block, "tool_use_id")
                            tool_info = mcp_tools.get(tool_use_id)
                            
                            server_name = tool_info.get("server_name")
                            tool_name = tool_info.get("tool_name")
                            
                            is_error = getattr(chunk.content_block, "is_error")
                            result_block = getattr(chunk.content_block, "content")
                            
                            tool_result = ""
                            for result in result_block:
                                tool_result += result.text
                            
                            await chunk_queue.put(RawChunk(
                                f"\n<tool_result>\n{json.dumps({'tool_id': tool_use_id, 'server_name': server_name, 'tool_name': tool_name, 'is_error': is_error, 'result': tool_result}, ensure_ascii=False)}\n</tool_result>\n\n"
                            ))
                        elif getattr(chunk.content_block, "type", "") == "server_tool_use":
                            tool_id = getattr(chunk.content_block, "id")
                            tool_name = getattr(chunk.content_block, "name")
                            server_name = "Claude"
                            
                            mcp_tools[tool_id] = {
                                "server_name": server_name,
                                "tool_name": tool_name
                            }
                            
                            await chunk_queue.put(RawChunk(
                                f"\n\n<tool_use>\n{json.dumps({'tool_id': tool_id, 'server_name': server_name, 'tool_name': tool_name}, ensure_ascii=False)}\n</tool_use>\n"
                            ))
                        elif getattr(chunk.content_block, "type", "") == "web_search_tool_result":
                            tool_use_id = getattr(chunk.content_block, "tool_use_id")
                            tool_info = mcp_tools.get(tool_use_id)
                            
                            server_name = tool_info.get("server_name", "Claude")
                            tool_name = tool_info.get("tool_name", "web_search")
                            
                            content = getattr(chunk.content_block, "content", [])
                            tool_result = []
                            for idx, item in enumerate(content, 1):
                                tool_result.append(f"[{idx}] {item.title}")
                                citations.append(item.url)
                            
                            result = '\n'.join(tool_result)
                            await chunk_queue.put(RawChunk(
                                f"\n<tool_result>\n{json.dumps({'tool_id': tool_use_id, 'server_name': server_name, 'tool_name': tool_name, 'is_error': False, 'result': result}, ensure_ascii=False)}\n</tool_result>\n\n"
                            ))
                    elif chunk.type == "content_block_stop":
                        if is_thinking:
                            await chunk_queue.put('\n</think>\n\n')
                            is_thinking = False
                if hasattr(chunk, "delta"):
                    if hasattr(chunk.delta, "thinking"):
                        thinking = chunk.delta.thinking
                        if thinking:
                            await chunk_queue.put(thinking)
                    elif hasattr(chunk.delta, "text"):
                        text = chunk.delta.text
                        if text:
                            await chunk_queue.put(text)
                if hasattr(chunk, "usage"):
                    usage = chunk.usage
                    input_tokens = usage.input_tokens or 0
                    output_tokens = usage.output_tokens or 0
                    
                    await chunk_queue.put({
                        "type": "token_usage",
                        "input_tokens": input_tokens,
                        "output_tokens": output_tokens
                    })
        else:
            single_result = await client.beta.messages.create(**parameters)
            full_response_text = ""
            
            if hasattr(single_result, 'content'):
                thinking_parts = []
                content_parts = []
                
                for content_block in single_result.content:
                    if hasattr(content_block, 'type'):
                        if content_block.type == 'thinking':
                            thinking_parts.append(content_block.thinking)
                        elif content_block.type == 'text':
                            content_parts.append(content_block.text)
                
                if thinking_parts:
                    full_response_text += "<think>\n" + "".join(thinking_parts) + "\n</think>\n\n"
                full_response_text += "".join(content_parts)
                        
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
        if is_thinking:
            await chunk_queue.put('\n</think>\n\n')

        if citations:
            citations_text = "\n<citations>"
            for idx, item in enumerate(citations, 1):
                citations_text += f"\n\n[{idx}] {item}"
            citations_text += "</citations>\n"
            await chunk_queue.put(RawChunk(citations_text))

        await client.close()
        await chunk_queue.put(None)

async def get_response(request: ChatRequest, user: User, fastapi_request: Request):
    error_message, in_billing, out_billing = check_user_permissions(user, request)
    if error_message:
        yield f"data: {json.dumps({'error': error_message})}\n\n"
        return
    
    user_message = {"role": "user", "content": request.message}
    conversation = get_conversation(user, request.conversation_id, request.memory)
    conversation.append(user_message)

    formatted_messages = copy.deepcopy([format_message(m) for m in conversation])

    instructions = DEFAULT_PROMPT
    if request.control.instructions and request.instructions:
        instructions += "\n\n" + request.instructions
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
        async with anthropic.AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY")) as client:
            parameters = {
                "model": request.model,
                "temperature": request.temperature if request.control.temperature else 1.0,
                "system": instructions,
                "messages": formatted_messages,
                "stream": request.stream,
            }
            
            if request.control.verbosity and request.verbosity:
                parameters["max_tokens"] = getVerbosity(request.verbosity, "tokens")
            else:
                parameters["max_tokens"] = MAX_VERBOSITY_TOKENS
            
            if request.control.reason and request.reason:
                reason_tokens = getReason(request.reason, "tokens")
                parameters["max_tokens"] += reason_tokens
                parameters["thinking"] = {
                    "type": "enabled",
                    "budget_tokens": reason_tokens
                }

            if request.search:
                parameters["tools"] = [{
                    "name": "web_search",
                    "type": "web_search_20250305"
                }]
                
            if len(request.mcp) > 0:
                mcp_servers, error = get_mcp_servers(request.mcp, user)
                if error:
                    yield f"data: {json.dumps({'error': error})}\n\n"
                    return
                parameters["mcp_servers"] = mcp_servers
                parameters["betas"] = ["mcp-client-2025-04-04"]

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

@router.post("/chat/claude")
async def claude_endpoint(request: ChatRequest, fastapi_request: Request, user: User = Depends(get_current_user)):
    return StreamingResponse(get_response(request, user, fastapi_request), media_type="text/event-stream")