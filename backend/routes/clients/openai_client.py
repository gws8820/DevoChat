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
    MARKDOWN_PROMPT, DAN_PROMPT,
    check_user_permissions,
    get_conversation, save_conversation,
    normalize_assistant_content,
    
    ApiSettings
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
            abs_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), file_path.lstrip("/"))
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
        
async def produce_tokens(token_queue: asyncio.Queue, request, parameters, fastapi_request: Request, client):
    citations = None
    try:
        if request.stream:
            stream_result = await client.chat.completions.create(**parameters)
            
            async for chunk in stream_result:
                if await fastapi_request.is_disconnected():
                    return
                if chunk.choices[0].delta.content:
                    await token_queue.put(chunk.choices[0].delta.content)
                if chunk.usage:
                    input_tokens = chunk.usage.prompt_tokens or 0
                    output_tokens = chunk.usage.completion_tokens or 0
                    
                    await token_queue.put({
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
                await token_queue.put(full_response_text[i:i+chunk_size])
                await asyncio.sleep(0.03)
                
            input_tokens = single_result.usage.prompt_tokens or 0 if single_result.usage else 0
            output_tokens = single_result.usage.completion_tokens or 0 if single_result.usage else 0
            
            await token_queue.put({
                "type": "token_usage",
                "input_tokens": input_tokens,
                "output_tokens": output_tokens
            })
    except Exception as ex:
        print(f"Produce tokens exception: {ex}")
        await token_queue.put({"error": str(ex)})
    finally:
        if citations:
            await token_queue.put("\n\n## 출처\n")
            for idx, item in enumerate(citations):
                await token_queue.put(f"- [{idx+1}] {item}\n")

        await client.close()
        await token_queue.put(None)

async def get_response(request: ChatRequest, settings: ApiSettings, user: User, fastapi_request: Request):
    permission_error = check_user_permissions(user, request)
    if permission_error:
        yield f"data: {json.dumps({'content': permission_error})}\n\n"
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

    reasoning_effort = None
    if request.reason:
        mapping = {1: "low", 2: "medium", 3: "high"}
        reasoning_effort = mapping.get(request.reason)

    response_text = ""
    token_usage = {"input_tokens": 0, "output_tokens": 0}
    
    try:
        async with AsyncOpenAI(api_key=settings.api_key, base_url=settings.base_url) as client:
            parameters = {
                "model": request.model.split(':')[0],
                "temperature": request.temperature,
                "reasoning_effort": reasoning_effort,
                "messages": formatted_messages,
                "stream": request.stream
            }
            
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
                else:
                    response_text += token
                    yield f"data: {json.dumps({'content': token})}\n\n"

            if not producer_task.done():
                producer_task.cancel()
    except Exception as ex:
        print(f"Exception detected: {ex}", flush=True)
        yield f"data: {json.dumps({'error': str(ex)})}\n\n"
    finally:
        save_conversation(user, user_message, response_text, token_usage, request)

@router.post("/perplexity")
async def perplexity_endpoint(chat_request: ChatRequest, fastapi_request: Request, user: User = Depends(get_current_user)):
    settings = ApiSettings(
        api_key=os.getenv('PERPLEXITY_API_KEY'),
        base_url="https://api.perplexity.ai"
    )
    return StreamingResponse(get_response(chat_request, settings, user, fastapi_request), media_type="text/event-stream")

@router.post("/adotx")
async def adotx_endpoint(chat_request: ChatRequest, fastapi_request: Request, user: User = Depends(get_current_user)):
    settings = ApiSettings(
        api_key=os.getenv('ADOTX_API_KEY'),
        base_url="https://guest-api.sktax.chat/v1"
    )
    return StreamingResponse(get_response(chat_request, settings, user, fastapi_request), media_type="text/event-stream")