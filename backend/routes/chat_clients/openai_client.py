from openai import AsyncOpenAI

import os
import json
import asyncio
import base64
import copy
from fastapi import Depends, Request
from fastapi.responses import StreamingResponse
from ..auth import User, get_current_user
from ..common import (
    ChatRequest, router,
    DEFAULT_PROMPT, DAN_PROMPT,
    check_user_permissions,
    get_conversation, save_conversation,
    normalize_assistant_content,
    getReason, getVerbosity,
    STREAM_COOLDOWN_SECONDS,
    
    ApiSettings
)
from logging_util import logger
    
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
        
async def process_stream(chunk_queue: asyncio.Queue, request, parameters, fastapi_request: Request, client):
    citations = None
    is_thinking = False
    try:
        if request.stream:
            stream_result = await client.chat.completions.create(**parameters)
            
            async for chunk in stream_result:
                if await fastapi_request.is_disconnected():
                    return
                
                choices = getattr(chunk, "choices", None) or []
                delta = getattr(choices[0], "delta", None) if choices else None
                
                if hasattr(delta, 'reasoning_content'):
                    if not is_thinking:
                        is_thinking = True
                        await chunk_queue.put('<think>\n')
                    await chunk_queue.put(delta.reasoning_content)
                
                if hasattr(delta, 'content'):
                    if is_thinking:
                        await chunk_queue.put('\n</think>\n\n')
                        is_thinking = False
                    await chunk_queue.put(delta.content)
                
                if chunk.usage:
                    input_tokens = chunk.usage.prompt_tokens or 0
                    output_tokens = chunk.usage.completion_tokens or 0
                    
                    await chunk_queue.put({
                        "type": "token_usage",
                        "input_tokens": input_tokens,
                        "output_tokens": output_tokens
                    })
                if citations is None and hasattr(chunk, "citations"):
                    citations = chunk.citations
        else:
            single_result = await client.chat.completions.create(**parameters)
            full_response_text = single_result.choices[0].message.content

            if hasattr(single_result, "citations"):
                citations = single_result.citations

            chunk_size = 10 
            for i in range(0, len(full_response_text), chunk_size):
                if await fastapi_request.is_disconnected():
                    return
                await chunk_queue.put(full_response_text[i:i+chunk_size])
                await asyncio.sleep(0.03)
                
            input_tokens = single_result.usage.prompt_tokens or 0
            output_tokens = single_result.usage.completion_tokens or 0
            
            await chunk_queue.put({
                "type": "token_usage",
                "input_tokens": input_tokens,
                "output_tokens": output_tokens
            })
    except Exception as ex:
        logger.error(f"STREAM_ERROR: {str(ex)}")
        await chunk_queue.put({"error": str(ex)})
    finally:
        if citations:
            await chunk_queue.put('\n<citations>')
            for idx, item in enumerate(citations, 1):
                await chunk_queue.put(f"\n\n[{idx}] {item}")
            await chunk_queue.put('</citations>\n')

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
            
    formatted_messages.insert(0, {
        "role": "system",
        "content": [{"type": "text", "text": instructions}]
    })

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
                "messages": formatted_messages,
                "stream": request.stream
            }
            
            if request.control.verbosity and request.verbosity:
                parameters["max_tokens"] = getVerbosity(request.verbosity, "tokens")

            if request.control.reason and request.reason:
                parameters["reasoning_effort"] = getReason(request.reason, "tertiary")
            
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

@router.post("/chat/ollama")
async def ollama_endpoint(chat_request: ChatRequest, fastapi_request: Request, user: User = Depends(get_current_user)):
    settings = ApiSettings(
        api_key='ollama',
        base_url="https://ollama.devochat.com/v1",
        headers={
            "CF-Access-Client-Id": os.getenv('CF_ACCESS_CLIENT_ID'),
            "CF-Access-Client-Secret": os.getenv('CF_ACCESS_CLIENT_SECRET'),
        }
    )
    return StreamingResponse(get_response(chat_request, settings, user, fastapi_request), media_type="text/event-stream")

@router.post("/chat/perplexity")
async def perplexity_endpoint(chat_request: ChatRequest, fastapi_request: Request, user: User = Depends(get_current_user)):
    settings = ApiSettings(
        api_key=os.getenv('PERPLEXITY_API_KEY'),
        base_url="https://api.perplexity.ai"
    )
    return StreamingResponse(get_response(chat_request, settings, user, fastapi_request), media_type="text/event-stream")

@router.post("/chat/deepseek")
async def deepseek_endpoint(chat_request: ChatRequest, fastapi_request: Request, user: User = Depends(get_current_user)):
    settings = ApiSettings(
        api_key=os.getenv('DEEPSEEK_API_KEY'),
        base_url="https://api.deepseek.com/v1"
    )
    return StreamingResponse(get_response(chat_request, settings, user, fastapi_request), media_type="text/event-stream")

@router.post("/chat/novita")
async def novita_endpoint(chat_request: ChatRequest, fastapi_request: Request, user: User = Depends(get_current_user)):
    settings = ApiSettings(
        api_key=os.getenv('NOVITA_API_KEY'),
        base_url="https://api.novita.ai/openai"
    )
    return StreamingResponse(get_response(chat_request, settings, user, fastapi_request), media_type="text/event-stream")

@router.post("/chat/fireworks")
async def fireworks_endpoint(chat_request: ChatRequest, fastapi_request: Request, user: User = Depends(get_current_user)):
    settings = ApiSettings(
        api_key=os.getenv('FIREWORKS_API_KEY'),
        base_url="https://api.fireworks.ai/inference/v1"
    )
    return StreamingResponse(get_response(chat_request, settings, user, fastapi_request), media_type="text/event-stream")