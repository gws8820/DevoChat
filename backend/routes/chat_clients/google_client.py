from google import genai

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
    getReason,

    AliasRequest, CHAT_ALIAS_PROMPT, IMAGE_ALIAS_PROMPT,
    get_chat_alias_model, get_image_alias_model,
    save_alias
)
from logging_util import logger

def normalize_user_content(part):
    if part.get("type") == "text":
        return {"type": "text", "text": part.get("text")}
    elif part.get("type") == "url":
        return {"type": "text", "text": part.get("content")}
    elif part.get("type") == "file":
        file_path = part.get("content")
        try:
            abs_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", file_path.lstrip("/")))
            with open(abs_path, "r", encoding="utf-8") as f:
                file_content = f.read()
            return {"type": "text", "text": file_content}
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
            return {
                "type": "image",
                "data": base64_data,
                "mime_type": "image/jpeg"
            }
        except Exception as ex:
            logger.error(f"IMAGE_PROCESS_ERROR: {str(ex)}")
            return None
    return {"type": "text", "text": str(part)}

def format_message(message):
    role = message.get("role")
    content = message.get("content")

    if role == "user":
        return {"role": "user", "content": [item for item in [normalize_user_content(part) for part in content] if item is not None]}
    elif role == "assistant":
        return {"role": "model", "content": normalize_assistant_content(content)}

async def process_stream(chunk_queue: asyncio.Queue, request: ChatRequest, parameters, fastapi_request: Request, client) -> None:
    is_reasoning = False
    tools = {}
    try:
        if request.stream:
            stream_result = await client.aio.interactions.create(**parameters, stream=True)
            async for chunk in stream_result:
                if await fastapi_request.is_disconnected():
                    return
                if chunk.event_type == "content.start":
                    content = getattr(chunk, 'content', None)
                    if content and getattr(content, 'type', None) == 'google_search_call':
                        tool_id = content.id
                        server_name = "Google"
                        tool_name = "web_search"
                        tools[tool_id] = {"server_name": server_name, "tool_name": tool_name}

                        await chunk_queue.put(
                            f"\n\n<tool_use>\n{json.dumps({'tool_id': tool_id, 'server_name': server_name, 'tool_name': tool_name}, ensure_ascii=False)}\n</tool_use>\n"
                        )
                    elif content and getattr(content, 'type', None) == 'google_search_result':
                        tool_use_id = content.call_id
                        tool_info = tools.get(tool_use_id, {})
                        server_name = tool_info.get("server_name")
                        tool_name = tool_info.get("tool_name")
                        tool_result = tool_info.get("tool_result", "")

                        await chunk_queue.put(
                            f"\n<tool_result>\n{json.dumps({'tool_id': tool_use_id, 'server_name': server_name, 'tool_name': tool_name, 'is_error': False, 'result': tool_result}, ensure_ascii=False)}\n</tool_result>\n\n"
                        )
                elif chunk.event_type == "content.delta":
                    if chunk.delta.type == "google_search_call":
                        tool_id = chunk.delta.id
                        queries = getattr(getattr(chunk.delta, 'arguments', None), 'queries', None) or []
                        if tool_id in tools:
                            tools[tool_id]["tool_result"] = "\n".join(queries)
                    elif chunk.delta.type == "thought_summary":
                        if not is_reasoning:
                            is_reasoning = True
                            await chunk_queue.put('<think>\n')
                        if chunk.delta.content and chunk.delta.content.text:
                            await chunk_queue.put(chunk.delta.content.text)
                    elif chunk.delta.type == "text":
                        if is_reasoning:
                            is_reasoning = False
                            await chunk_queue.put('\n</think>\n\n')
                        if chunk.delta.text:
                            await chunk_queue.put(chunk.delta.text)
                elif chunk.event_type == "interaction.complete":
                    interaction = getattr(chunk, 'interaction', None)
                    usage = getattr(interaction, 'usage', None) if interaction else None
                    if usage:
                        await chunk_queue.put({
                            "type": "token_usage",
                            "input_tokens": getattr(usage, 'total_input_tokens', 0) or 0,
                            "output_tokens": getattr(usage, 'total_output_tokens', 0) or 0,
                            "reasoning_tokens": getattr(usage, 'total_thought_tokens', 0) or 0
                        })
        else:
            single_result = await client.aio.interactions.create(**parameters)
            full_response_text = ""

            for output in single_result.outputs:
                if output.type == "thought" and output.summary:
                    full_response_text += f"<think>\n{output.summary}\n</think>\n\n"
                elif output.type == "text":
                    full_response_text += output.text

            chunk_size = 10
            for i in range(0, len(full_response_text), chunk_size):
                if await fastapi_request.is_disconnected():
                    return
                await chunk_queue.put(full_response_text[i:i+chunk_size])
                await asyncio.sleep(0.03)

            usage = getattr(single_result, 'usage', None)
            if usage:
                await chunk_queue.put({
                    "type": "token_usage",
                    "input_tokens": getattr(usage, 'total_input_tokens', 0) or 0,
                    "output_tokens": getattr(usage, 'total_output_tokens', 0) or 0,
                    "reasoning_tokens": getattr(usage, 'total_thought_tokens', 0) or 0
                })
    except Exception as ex:
        logger.error(f"STREAM_ERROR: {str(ex)}")
        await chunk_queue.put({"error": str(ex)})
    finally:
        if is_reasoning:
            await chunk_queue.put('\n</think>\n\n')
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
        client = genai.Client(api_key=os.getenv('GEMINI_API_KEY'))

        generation_config = {
            "temperature": request.temperature if request.control.temperature else 1.0
        }
        if request.control.reason and request.reason:
            thinking_level = getReason(request.reason, "binary")
            generation_config["thinking_level"] = thinking_level
            generation_config["thinking_summaries"] = "auto"
        else:
            generation_config["thinking_level"] = "minimal"

        parameters = {
            "model": request.model,
            "input": formatted_messages,
            "system_instruction": instructions,
            "generation_config": generation_config,
            "tools": []
        }

        if request.web_search:
            parameters["tools"].append({"type": "google_search"})

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

@router.post("/chat/gemini")
async def gemini_endpoint(chat_request: ChatRequest, fastapi_request: Request, user: User = Depends(get_current_user)):
    return StreamingResponse(get_response(chat_request, user, fastapi_request), media_type="text/event-stream")

@router.post("/chat/get_alias")
async def get_chat_alias(request: AliasRequest, user: User = Depends(get_current_user)):
    try:
        client = genai.Client(api_key=os.getenv('GEMINI_API_KEY'))
        interaction = await client.aio.interactions.create(
            model=get_chat_alias_model(),
            input=request.text,
            system_instruction=CHAT_ALIAS_PROMPT,
            generation_config={"thinking_level": "minimal"}
        )
        alias = interaction.outputs[-1].text.strip()[:15]
        save_alias(user, request.conversation_id, alias)
        return {"alias": alias}
    except Exception as ex:
        logger.error(f"GET_ALIAS_ERROR: {str(ex)}")
        return {"alias": "새 대화", "error": str(ex)}

@router.post("/image/get_alias")
async def get_image_alias(request: AliasRequest, user: User = Depends(get_current_user)):
    try:
        client = genai.Client(api_key=os.getenv('GEMINI_API_KEY'))
        interaction = await client.aio.interactions.create(
            model=get_image_alias_model(),
            input=request.text,
            system_instruction=IMAGE_ALIAS_PROMPT
        )
        alias = interaction.outputs[-1].text.strip()[:15]
        save_alias(user, request.conversation_id, alias)
        return {"alias": alias}
    except Exception as ex:
        logger.error(f"GET_ALIAS_ERROR: {str(ex)}")
        return {"alias": "새 대화", "error": str(ex)}
