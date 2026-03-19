from openai import AsyncOpenAI
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client
from contextlib import AsyncExitStack

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
    check_chat_user_permissions,
    get_chat_conversation, save_chat_conversation,
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

        server_list.append({
            "url": server_config["url"],
            "name": server_config["name"],
            "authorization_token": server_config["authorization_token"]
        })

    return server_list, None

def convert_tool_format(tool):
    return {
        "type": "function",
        "function": {
            "name": tool.name,
            "description": tool.description,
            "parameters": {
                "type": "object",
                "properties": tool.inputSchema["properties"],
                "required": tool.inputSchema.get("required", [])
            }
        }
    }

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
            base64_data = "data:image/jpeg;base64," + base64.b64encode(file_data).decode("utf-8")
            return {
                "type": "image_url",
                "image_url": {"url": base64_data}
            }
        except Exception as ex:
            logger.error(f"IMAGE_PROCESS_ERROR: {str(ex)}")
            return None
    return part

def format_message(message):
    role = message.get("role")
    content = message.get("content")

    if role == "user":
        return {"role": "user", "content": [item for item in [normalize_user_content(part) for part in content] if item is not None]}
    elif role == "assistant":
        return {"role": "assistant", "content": normalize_assistant_content(content)}

async def process_stream(chunk_queue: asyncio.Queue, request: ChatRequest, parameters, fastapi_request: Request, client) -> None:
    citations = []
    is_reasoning = False
    reasoning_done = False
    mcp_servers = parameters.pop("mcp_servers", None)
    try:
        if mcp_servers:
            async with AsyncExitStack() as exit_stack:
                available_tools = []
                tool_info_map = {}

                for server in mcp_servers:
                    transport = await exit_stack.enter_async_context(
                        streamablehttp_client(server["url"], headers={"Authorization": f"Bearer {server['authorization_token']}"})
                    )
                    read, write, _ = transport
                    session = await exit_stack.enter_async_context(ClientSession(read, write))
                    await session.initialize()

                    tools_response = await session.list_tools()
                    for tool in tools_response.tools:
                        available_tools.append(convert_tool_format(tool))
                        tool_info_map[tool.name] = {"server_name": server["name"], "session": session}

                parameters["tools"] = available_tools
                parameters["stream"] = False

                while True:
                    result = await client.chat.completions.create(**parameters)
                    message = result.choices[0].message
                    assistant_msg = {"role": "assistant", "content": message.content}
                    if message.tool_calls:
                        assistant_msg["tool_calls"] = [tc.model_dump() for tc in message.tool_calls]
                    parameters["messages"].append(assistant_msg)

                    if not message.tool_calls:
                        full_response_text = message.content or ""
                        chunk_size = 10
                        for i in range(0, len(full_response_text), chunk_size):
                            await chunk_queue.put(full_response_text[i:i+chunk_size])

                        await chunk_queue.put({
                            "type": "token_usage",
                            "input_tokens": result.usage.prompt_tokens or 0,
                            "output_tokens": result.usage.completion_tokens or 0
                        })
                        break

                    for tc in message.tool_calls:
                        tool_name = tc.function.name
                        tool_info = tool_info_map[tool_name]
                        server_name = tool_info["server_name"]
                        session = tool_info["session"]

                        await chunk_queue.put(RawChunk(
                            f"\n\n<tool_use>\n{json.dumps({'tool_id': tc.id, 'server_name': server_name, 'tool_name': tool_name}, ensure_ascii=False)}\n</tool_use>\n"
                        ))

                        tool_args = json.loads(tc.function.arguments) if tc.function.arguments else {}
                        mcp_result = await session.call_tool(tool_name, tool_args)
                        tool_result_text = "\n".join([c.text for c in mcp_result.content if hasattr(c, "text")])

                        await chunk_queue.put(RawChunk(
                            f"\n<tool_result>\n{json.dumps({'tool_id': tc.id, 'server_name': server_name, 'tool_name': tool_name, 'is_error': mcp_result.isError, 'result': tool_result_text}, ensure_ascii=False)}\n</tool_result>\n\n"
                        ))

                        parameters["messages"].append({
                            "role": "tool",
                            "tool_call_id": tc.id,
                            "name": tool_name,
                            "content": tool_result_text
                        })
        elif request.stream:
            stream_result = await client.chat.completions.create(**parameters)

            async for chunk in stream_result:
                if await fastapi_request.is_disconnected():
                    return

                delta = chunk.choices[0].delta

                reasoning = getattr(delta, "reasoning", None)
                if reasoning and not reasoning_done:
                    if not is_reasoning:
                        is_reasoning = True
                        await chunk_queue.put("<think>\n")
                    await chunk_queue.put(reasoning)

                if delta.content:
                    if is_reasoning:
                        await chunk_queue.put("\n</think>\n\n")
                        is_reasoning = False
                        reasoning_done = True
                    await chunk_queue.put(delta.content)

                if chunk.usage:
                    details = getattr(chunk.usage, "completion_tokens_details", None)
                    reasoning_tokens = getattr(details, "reasoning_tokens", 0) or 0
                    await chunk_queue.put({
                        "type": "token_usage",
                        "input_tokens": chunk.usage.prompt_tokens or 0,
                        "output_tokens": chunk.usage.completion_tokens or 0,
                        "reasoning_tokens": reasoning_tokens
                    })

                annotations = getattr(delta, "annotations", None) or []
                for annotation in annotations:
                    if annotation.get("type") == "url_citation":
                        citations.append(annotation.get("url_citation", {}).get("url"))

            if is_reasoning:
                await chunk_queue.put("\n</think>\n\n")
        else:
            single_result = await client.chat.completions.create(**parameters)
            full_response_text = single_result.choices[0].message.content

            annotations = getattr(single_result.choices[0].message, "annotations", None) or []
            for annotation in annotations:
                if annotation.get("type") == "url_citation":
                    citations.append(annotation.get("url_citation", {}).get("url"))

            chunk_size = 10
            for i in range(0, len(full_response_text), chunk_size):
                if await fastapi_request.is_disconnected():
                    return
                await chunk_queue.put(full_response_text[i:i+chunk_size])
                await asyncio.sleep(0.03)

            await chunk_queue.put({
                "type": "token_usage",
                "input_tokens": single_result.usage.prompt_tokens or 0,
                "output_tokens": single_result.usage.completion_tokens or 0
            })
    except Exception as ex:
        logger.error(f"STREAM_ERROR: {str(ex)}")
        await chunk_queue.put({"error": str(ex)})
    finally:
        if is_reasoning:
            await chunk_queue.put("\n</think>\n\n")

        if citations:
            citations_text = "\n<citations>"
            for idx, item in enumerate(citations, 1):
                citations_text += f"\n\n[{idx}] {item}"
            citations_text += "</citations>\n"
            await chunk_queue.put(RawChunk(citations_text))

        await client.close()
        await chunk_queue.put(None)

async def get_response(request: ChatRequest, user: User, fastapi_request: Request):
    error_message, in_billing, out_billing = check_chat_user_permissions(user, request)
    if error_message:
        yield f"data: {json.dumps({'error': error_message})}\n\n"
        return

    user_message = {"role": "user", "content": request.message}
    conversation = get_chat_conversation(user, request.conversation_id, request.memory)
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
        async with AsyncOpenAI(
            api_key=os.getenv("OPENROUTER_API_KEY"),
            base_url="https://openrouter.ai/api/v1"
        ) as client:
            parameters = {
                "model": request.model,
                "temperature": request.temperature if request.control.temperature else 1.0,
                "messages": formatted_messages,
                "stream": request.stream,
                "extra_body": {
                    "reasoning": {"effort": "none"}
                }
            }

            if request.control.verbosity and request.verbosity:
                parameters["max_tokens"] = getVerbosity(request.verbosity, "tokens")

            if request.control.reason and request.reason:
                parameters["extra_body"]["reasoning"] = {"effort": getReason(request.reason, "tertiary")}

            if request.web_search:
                parameters["extra_body"]["plugins"] = [{"id": "web"}]

            if len(request.mcp) > 0:
                mcp_servers, error = get_mcp_servers(request.mcp, user)
                if error:
                    yield f"data: {json.dumps({'error': error})}\n\n"
                    return
                parameters["mcp_servers"] = mcp_servers

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
        save_chat_conversation(user, user_message, response_text, token_usage, request, in_billing, out_billing)

@router.post("/chat/openrouter")
async def openrouter_endpoint(chat_request: ChatRequest, fastapi_request: Request, user: User = Depends(get_current_user)):
    return StreamingResponse(get_response(chat_request, user, fastapi_request), media_type="text/event-stream")
