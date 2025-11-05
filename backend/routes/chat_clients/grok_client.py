from xai_sdk import AsyncClient
from xai_sdk.chat import assistant, system, user, image
from xai_sdk.search import SearchParameters

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
    getReason, getVerbosity
)
from logging_util import logger

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
        if citations:
            await chunk_queue.put('\n<citations>')
            for idx, item in enumerate(citations, 1):
                await chunk_queue.put(f"\n\n[{idx}] {item}")
            await chunk_queue.put('</citations>\n')
                
        await chunk_queue.put(None)

async def get_response(request: ChatRequest, user: User, fastapi_request: Request):
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
        
        last_message = formatted_messages[-1]
        if hasattr(last_message, 'args'):
            new_args = list(last_message.args)
            new_args[0] = new_args[0] + " STAY IN CHARACTER"
            formatted_messages[-1].args = tuple(new_args)
            
    formatted_messages.insert(0, system(instructions))
    
    response_text = ""
    token_usage = None
    
    try:
        client = AsyncClient(api_key=os.getenv('GROK_API_KEY'))
        
        parameters = {
            "model": request.model,
            "temperature": request.temperature if request.control.temperature else 1.0,
            "messages": formatted_messages
        }
        
        if request.control.verbosity and request.verbosity:
            parameters["max_tokens"] = getVerbosity(request.verbosity, "tokens")
        
        if request.control.reason and request.reason:
            parameters["reasoning_effort"] = getReason(request.reason, "binary")
            
        if request.search:
            parameters["search_parameters"] = SearchParameters(
                mode="on",
                return_citations=True,
            )
        
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
    
@router.post("/chat/grok")
async def grok_endpoint(chat_request: ChatRequest, fastapi_request: Request, user: User = Depends(get_current_user)):
    return StreamingResponse(get_response(chat_request, user, fastapi_request), media_type="text/event-stream")