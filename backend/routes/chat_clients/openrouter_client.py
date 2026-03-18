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
    ChatRequest, router, RawChunk,
    DEFAULT_PROMPT, DAN_PROMPT,
    check_chat_user_permissions,
    get_chat_conversation, save_chat_conversation,
    normalize_assistant_content,
    getReason, getVerbosity
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
    citations = []
    is_reasoning = False
    reasoning_done = False
    try:
        if request.stream:
            stream_result = await client.chat.completions.create(**parameters)

            async for chunk in stream_result:
                if await fastapi_request.is_disconnected():
                    return

                choices = getattr(chunk, "choices", None) or []
                delta = getattr(choices[0], "delta", None) if choices else None

                reasoning = getattr(delta, 'reasoning', None)
                if reasoning and not reasoning_done:
                    if not is_reasoning:
                        is_reasoning = True
                        await chunk_queue.put('<think>\n')
                    await chunk_queue.put(reasoning)

                content = getattr(delta, 'content', None)
                if content:
                    if is_reasoning:
                        await chunk_queue.put('\n</think>\n\n')
                        is_reasoning = False
                        reasoning_done = True
                    await chunk_queue.put(content)

                if chunk.usage:
                    input_tokens = chunk.usage.prompt_tokens or 0
                    output_tokens = chunk.usage.completion_tokens or 0
                    details = getattr(chunk.usage, 'completion_tokens_details', None)
                    reasoning_tokens = getattr(details, 'reasoning_tokens', 0) or 0

                    await chunk_queue.put({
                        "type": "token_usage",
                        "input_tokens": input_tokens,
                        "output_tokens": output_tokens,
                        "reasoning_tokens": reasoning_tokens
                    })

                annotations = getattr(delta, 'annotations', None) or []
                for annotation in annotations:
                    if annotation.get('type') == 'url_citation':
                        url = annotation.get('url_citation', {}).get('url')
                        citations.append(url)

            if is_reasoning:
                await chunk_queue.put('\n</think>\n\n')
        else:
            single_result = await client.chat.completions.create(**parameters)
            full_response_text = single_result.choices[0].message.content

            annotations = getattr(single_result.choices[0].message, 'annotations', None) or []
            for annotation in annotations:
                if annotation.get('type') == 'url_citation':
                    url = annotation.get('url_citation', {}).get('url')
                    citations.append(url)

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
        if is_reasoning:
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
            
    formatted_messages.insert(0, {
        "role": "system",
        "content": [{"type": "text", "text": instructions}]
    })

    response_text = ""
    token_usage = None
    
    client_disconnected = False
    
    try:
        async with AsyncOpenAI(
            api_key=os.getenv('OPENROUTER_API_KEY'),
            base_url="https://openrouter.ai/api/v1"
        ) as client:
            parameters = {
                "model": request.model,
                "temperature": request.temperature if request.control.temperature else 1.0,
                "messages": formatted_messages,
                "stream": request.stream,
                "extra_body": {
                    "reasoning": {
                        "effort": "none"
                    }
                }
            }
            
            if request.control.verbosity and request.verbosity:
                parameters["max_tokens"] = getVerbosity(request.verbosity, "tokens")

            if request.control.reason and request.reason:
                reasoning_effort = getReason(request.reason, "tertiary")
                parameters["extra_body"] = {
                    "reasoning": { 
                        "effort": reasoning_effort 
                    }
                }
            
            if request.search:
                parameters["model"] = f"{request.model}:online"

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