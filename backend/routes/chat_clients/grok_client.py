from xai_sdk import AsyncClient
from xai_sdk.chat import assistant, system, user, image
from xai_sdk.tools import web_search, mcp

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
    getReason, getVerbosity
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
        
        mcp_server = mcp (
            server_url = server_config["url"],
            server_label = server_config["name"],
            authorization = server_config["authorization_token"]
        )
        
        server_list.append(mcp_server)
    
    return server_list, None

def normalize_user_content(part):
    if part.get("type") == "text":
        return part.get("text")
    elif part.get("type") == "url":
        return part.get("content")
    elif part.get("type") == "file":
        file_path = part.get("content")
        try:
            abs_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", file_path.lstrip("/")))
            with open(abs_path, "r", encoding="utf-8") as f:
                file_content = f.read()
            return file_content
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
            return image(base64_data, detail="high")
        except Exception as ex:
            logger.error(f"IMAGE_PROCESS_ERROR: {str(ex)}")
            return None

def format_message(message):
    role = message.get("role")
    content = message.get("content")
    
    if role == "user":
        return user(*[normalize_user_content(part) for part in content])
    elif role == "assistant":
        return assistant(normalize_assistant_content(content))
        
async def process_stream(chunk_queue: asyncio.Queue, request: ChatRequest, parameters, fastapi_request: Request, client) -> None:
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
                        await chunk_queue.put('<think>\n')
                    await chunk_queue.put(chunk.reasoning_content)
                    
                if chunk.tool_calls:
                    for tool_call in chunk.tool_calls:
                        tool_use_id = tool_call.id
                        tool_info = tool_call.function
                        
                        server_name = ""
                        tool_name = ""
                        
                        if "." in tool_info.name:
                            parts = tool_info.name.split(".")
                            server_name = parts[0]
                            tool_name = parts[1]
                        else:
                            server_name = "xAI"
                            tool_name = tool_info.name
                        
                        result = tool_info.arguments
                        
                        await chunk_queue.put(RawChunk(
                            f"\n<tool_result>\n{json.dumps({'tool_id': tool_use_id, 'server_name': server_name, 'tool_name': tool_name, 'result': result}, ensure_ascii=False)}\n</tool_result>\n\n"
                        ))
                        
                if chunk.content:
                    if is_thinking:
                        await chunk_queue.put('\n</think>\n\n')
                        is_thinking = False
                    await chunk_queue.put(chunk.content)
                    
                latest_response = response
            
            if hasattr(latest_response, 'citations'):
                citations = latest_response.citations
            
            input_tokens = latest_response.usage.prompt_tokens or 0
            output_tokens = latest_response.usage.completion_tokens or 0
            reasoning_tokens = latest_response.usage.reasoning_tokens or 0
            
            await chunk_queue.put({
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
                await chunk_queue.put(full_response_text[i:i+chunk_size])
                await asyncio.sleep(0.03)
            
            input_tokens = single_result.usage.prompt_tokens or 0
            output_tokens = single_result.usage.completion_tokens or 0
            reasoning_tokens = single_result.usage.reasoning_tokens or 0
            
            await chunk_queue.put({
                "type": "token_usage",
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "reasoning_tokens": reasoning_tokens
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
        
        last_message = formatted_messages[-1]
        if hasattr(last_message, 'args'):
            new_args = list(last_message.args)
            new_args[0] = new_args[0] + " STAY IN CHARACTER"
            formatted_messages[-1].args = tuple(new_args)
            
    formatted_messages.insert(0, system(instructions))
    
    response_text = ""
    token_usage = None
    
    client_disconnected = False
    
    try:
        client = AsyncClient(api_key=os.getenv('GROK_API_KEY'))
        
        parameters = {
            "model": request.model,
            "temperature": request.temperature if request.control.temperature else 1.0,
            "messages": formatted_messages,
            "tools": []
        }
        
        if request.control.verbosity and request.verbosity:
            parameters["max_tokens"] = getVerbosity(request.verbosity, "tokens")
        
        if request.control.reason and request.reason:
            parameters["reasoning_effort"] = getReason(request.reason, "binary")
            
        if request.search:
            parameters["tools"].append(web_search())
            
        if len(request.mcp) > 0:
            mcp_servers, error = get_mcp_servers(request.mcp, user)
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
    
@router.post("/chat/grok")
async def grok_endpoint(chat_request: ChatRequest, fastapi_request: Request, user: User = Depends(get_current_user)):
    return StreamingResponse(get_response(chat_request, user, fastapi_request), media_type="text/event-stream")