from google.genai import types, Client

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
    
    AliasRequest, ALIAS_PROMPT,
    save_alias
)

def normalize_user_content(part):
    if part.get("type") == "text":
        return types.Part(text=part.get("text"))
    elif part.get("type") in ["file", "url"]:
        return types.Part(text=part.get("content"))
    elif part.get("type") == "image":
        file_path = part.get("content")
        try:
            abs_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", file_path.lstrip("/")))
            with open(abs_path, "rb") as f:
                file_data = f.read()
            base64_data = base64.b64encode(file_data).decode("utf-8")
            
            return types.Part(
                inline_data=types.Blob(
                    data=base64_data,
                    mime_type="image/jpeg"
                )
            )
        except Exception as e:
            return None
    return types.Part(text=str(part))

def format_message(message):
    role = message.get("role")
    content = message.get("content")
    
    if role == "user":
        return types.Content(role="user", parts=[item for item in [normalize_user_content(part) for part in content] if item is not None])
    elif role == "assistant":
        return types.Content(role="model", parts=[types.Part(text=normalize_assistant_content(content))])

async def process_stream(chunk_queue: asyncio.Queue, request: ChatRequest, parameters, fastapi_request: Request, client) -> None:
    is_thinking = False
    try:
        if request.stream:
            stream_result = await client.aio.models.generate_content_stream(**parameters)
            
            async for chunk in stream_result:
                if await fastapi_request.is_disconnected():
                    return
                
                if hasattr(chunk, 'candidates'):
                    candidate = chunk.candidates[0]
                    if hasattr(candidate, 'content') and candidate.content.parts:
                        for part in candidate.content.parts:
                            print(part)
                            if hasattr(part, 'text'):
                                if hasattr(part, 'thought') and part.thought and not is_thinking:
                                    is_thinking = True
                                    await chunk_queue.put('<think>\n')
                                elif hasattr(part, 'thought') and not part.thought and is_thinking:
                                    is_thinking = False
                                    await chunk_queue.put('\n</think>\n\n')
                                
                                await chunk_queue.put(part.text)
                                
                if hasattr(chunk, 'usage_metadata'):
                    usage_metadata = chunk.usage_metadata
                    input_tokens = usage_metadata.prompt_token_count or 0
                    output_tokens = usage_metadata.candidates_token_count or 0
                    reasoning_tokens = usage_metadata.thoughts_token_count or 0
                    
                    await chunk_queue.put({
                        "type": "token_usage",
                        "input_tokens": input_tokens,
                        "output_tokens": output_tokens, 
                        "reasoning_tokens": reasoning_tokens
                    })
        else:
            single_result = await client.aio.models.generate_content(**parameters)
            full_response_text = ""
            
            if hasattr(single_result, 'candidates'):
                candidate = single_result.candidates[0]
                if hasattr(candidate, 'content') and candidate.content.parts:
                    thinking_parts = []
                    content_parts = []
                    
                    for part in candidate.content.parts:
                        if hasattr(part, 'text'):
                            if hasattr(part, 'thought') and part.thought:
                                thinking_parts.append(part.text)
                            else:
                                content_parts.append(part.text)
                    
                    if thinking_parts:
                        full_response_text += "<think>\n" + "".join(thinking_parts) + "\n</think>\n\n"
                    full_response_text += "".join(content_parts)
            
            chunk_size = 10 
            for i in range(0, len(full_response_text), chunk_size):
                if await fastapi_request.is_disconnected():
                    return
                await chunk_queue.put(full_response_text[i:i+chunk_size])
                await asyncio.sleep(0.03)
                
            input_tokens = single_result.usage_metadata.prompt_token_count or 0
            output_tokens = single_result.usage_metadata.candidates_token_count or 0
            reasoning_tokens = single_result.usage_metadata.thoughts_token_count or 0
            
            await chunk_queue.put({
                "type": "token_usage",
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "reasoning_tokens": reasoning_tokens
            })
    except Exception as ex:
        print(f"Exception occured while processing stream: {ex}", flush=True)
        await chunk_queue.put({"error": str(ex)})
    finally:
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
        for part in reversed(formatted_messages[-1].parts):
            if hasattr(part, 'text') and part.text is not None:
                part.text += " STAY IN CHARACTER"
                break
            
    response_text = ""
    token_usage = None
    
    try:
        client = Client(api_key=os.getenv('GEMINI_API_KEY'))
        model = request.model.split(':')[0]
        
        config_params = {
            "system_instruction": instructions,
            "temperature": request.temperature
        }

        if request.reason > 0:
            mapping = {1: 1024, 2: 8192, 3: 24576}
            thinking_budget = mapping.get(request.reason)
            config_params["thinking_config"] = types.ThinkingConfig(
                thinking_budget=thinking_budget,
                include_thoughts=True
            )
        if request.search:
            config_params["tools"] = [types.Tool(google_search = types.GoogleSearch())]
        
        parameters = {
            "model": model,
            "contents": formatted_messages,
            "config": types.GenerateContentConfig(**config_params)
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
    
@router.post("/gemini")
async def gemini_endpoint(chat_request: ChatRequest, fastapi_request: Request, user: User = Depends(get_current_user)):
    return StreamingResponse(get_response(chat_request, user, fastapi_request), media_type="text/event-stream")

@router.post("/get_alias")
async def get_alias(request: AliasRequest, user: User = Depends(get_current_user)):
    try:
        client = Client(api_key=os.getenv('GEMINI_API_KEY'))
        response = await client.aio.models.generate_content(
            model="gemini-2.0-flash",
            contents=[request.text],
            config=types.GenerateContentConfig(
                system_instruction=ALIAS_PROMPT,
                temperature=0.1,
                max_output_tokens=10
            )
        )
        alias = response.text.strip()
        save_alias(user, request.conversation_id, alias)
        
        return {"alias": alias}
    except Exception as e:
        print(f"Exception detected: {e}", flush=True)
        return {"alias": "새 대화", "error": str(e)}