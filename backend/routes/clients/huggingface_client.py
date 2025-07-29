from huggingface_hub import AsyncInferenceClient

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
    MARKDOWN_PROMPT, DAN_PROMPT,
    check_user_permissions,
    get_conversation, save_conversation,
    normalize_assistant_content
)

def normalize_user_content(part):
    if part.get("type") in ["file", "url"]:
        return {
            "type": "text",
            "text": part.get("content")
        }
    elif part.get("type") == "image":
        file_path = part.get("content")
        try:
            abs_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", file_path.lstrip("/")))
            with open(abs_path, "rb") as f:
                file_data = f.read()
            base64_data = "data:image/jpeg;base64," + base64.b64encode(file_data).decode("utf-8")
        except Exception as e:
            return None
        return {
            "type": "image_url",
            "image_url": {"url": base64_data}
        }
    return part

def format_message(message):
    role = message.get("role")
    content = message.get("content")

    if role == "user":
        return {"role": "user", "content": [item for item in [normalize_user_content(part) for part in content] if item is not None]}
    elif role == "assistant":
        return {"role": "assistant", "content": normalize_assistant_content(content)}
        
async def process_stream(chunk_queue: asyncio.Queue, request, parameters, fastapi_request: Request, client):
    try:
        if request.stream:
            stream_result = await client.chat.completions.create(**parameters)
            
            async for chunk in stream_result:
                if await fastapi_request.is_disconnected():
                    return
                if chunk.choices[0].delta.content:
                    await chunk_queue.put(chunk.choices[0].delta.content)
                if chunk.usage:
                    input_tokens = chunk.usage.prompt_tokens or 0
                    output_tokens = chunk.usage.completion_tokens or 0
                    
                    await chunk_queue.put({
                        "type": "token_usage",
                        "input_tokens": input_tokens,
                        "output_tokens": output_tokens
                    })
        else:
            single_result = await client.chat.completions.create(**parameters)
            full_response_text = single_result.choices[0].message.content

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
        print(f"Exception occured while processing stream: {ex}", flush=True)
        await chunk_queue.put({"error": str(ex)})
    finally:
        await client.close()
        await chunk_queue.put(None)

async def get_response(request: ChatRequest, user: User, fastapi_request: Request):
    error_message, in_billing, out_billing = check_user_permissions(user, request)
    if error_message:
        yield f"data: {json.dumps({'content': error_message})}\n\n"
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
            
    formatted_messages.insert(0, {
        "role": "system",
        "content": [{"type": "text", "text": instructions}]
    })

    response_text = ""
    token_usage = None
    
    try:
        async with AsyncInferenceClient(api_key=os.getenv('HUGGINGFACE_API_KEY'), provider="auto") as client:
            parameters = {
                "model": request.model.split(':')[0],
                "temperature": request.temperature,
                "messages": formatted_messages,
                "stream": request.stream,
                "max_tokens": 4096
            }
            
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
        print(f"Exception occured while getting response: {ex}", flush=True)
        yield f"data: {json.dumps({'error': str(ex)})}\n\n"
    finally:
        save_conversation(user, user_message, response_text, token_usage, request, in_billing, out_billing)

@router.post("/huggingface")
async def huggingface_endpoint(chat_request: ChatRequest, fastapi_request: Request, user: User = Depends(get_current_user)):
    return StreamingResponse(get_response(chat_request, user, fastapi_request), media_type="text/event-stream")