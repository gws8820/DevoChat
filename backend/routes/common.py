import os
import re
import json
import uuid
from dotenv import load_dotenv
from pymongo import MongoClient
from fastapi import APIRouter
from pydantic import BaseModel
from bson import ObjectId
from datetime import datetime, timezone
from typing import Any, List, Dict, Optional
from .auth import User
from logging_util import logger

class ControlFlags(BaseModel):
    temperature: bool = True
    reason: bool = True
    verbosity: bool = True
    instructions: bool = True

class ChatRequest(BaseModel):
    conversation_id: str
    model: str
    reasoning: bool = False
    search: bool = False
    deep_research: bool = False
    dan: bool = False
    mcp: List[str] = []
    stream: bool = True
    control: ControlFlags = ControlFlags()
    temperature: float = 1.0
    reason: float = 0
    verbosity: float = 0
    memory: int = 4
    instructions: str = ""
    message: List[Dict[str, Any]]

class ImageGenerateRequest(BaseModel):
    conversation_id: str
    model: str
    message: List[Dict[str, Any]]

class AliasRequest(BaseModel):
    conversation_id: str
    text: str

class ApiSettings(BaseModel):
    api_key: str
    base_url: str
    headers: Optional[Dict[str, str]] = None

class RawChunk:
    def __init__(self, content: str):
        self.content = content
    
load_dotenv()
router = APIRouter()

mongo_client = MongoClient(os.getenv('MONGODB_URI'))
db = mongo_client.chat_db
user_collection = db.users
conversation_collection = db.conversations

MAX_VERBOSITY_TOKENS = 8192
MAX_REASON_TOKENS = 16384

default_prompt_path = os.path.join(os.path.dirname(__file__), '..', 'prompts', 'default_prompt.txt')
try:
    with open(default_prompt_path, 'r', encoding='utf-8') as f:
        DEFAULT_PROMPT = f.read()
except FileNotFoundError:
    DEFAULT_PROMPT = ""
    
dan_prompt_path = os.path.join(os.path.dirname(__file__), '..', 'prompts', 'dan_prompt.txt')
try:
    with open(dan_prompt_path, 'r', encoding='utf-8') as f:
        DAN_PROMPT = f.read()
except FileNotFoundError:
    DAN_PROMPT = ""

chat_alias_prompt_path = os.path.join(os.path.dirname(__file__), '..', 'prompts', 'chat_alias_prompt.txt')
try:
    with open(chat_alias_prompt_path, 'r', encoding='utf-8') as f:
        CHAT_ALIAS_PROMPT = f.read()
except FileNotFoundError:
    CHAT_ALIAS_PROMPT = ""
    
image_alias_prompt_path = os.path.join(os.path.dirname(__file__), '..', 'prompts', 'image_alias_prompt.txt')
try:
    with open(image_alias_prompt_path, 'r', encoding='utf-8') as f:
        IMAGE_ALIAS_PROMPT = f.read()
except FileNotFoundError:
    IMAGE_ALIAS_PROMPT = ""

generated_image_path = os.path.join(os.path.dirname(__file__), "..", "generated/images")
os.makedirs(generated_image_path, exist_ok=True)

def check_user_permissions(user: User, request: ChatRequest):
    billing_result = get_model_billing(request.model)
    if not billing_result:
        return "잘못된 모델입니다.", None, None
    else:
        in_billing, out_billing = billing_result
    
    if user.trial and user.trial_remaining <= 0:
        return "체험판이 종료되었습니다.\n\n자세한 정보는 admin@shilvister.net으로 문의해 주세요.", None, None
    if not user.admin and in_billing >= 10:
        return "해당 모델을 사용할 권한이 없습니다.\n\n자세한 정보는 admin@shilvister.net으로 문의해 주세요.", None, None
    if not user.admin and len(request.mcp) > 3:
        return "MCP 서버는 최대 3개까지 선택할 수 있습니다.", None, None
    if not request.message:
        return "메시지가 비어 있습니다. 내용을 입력해 주세요.", None, None
    return None, in_billing, out_billing


def check_image_user_permissions(user: User, request: ImageGenerateRequest):
    billing_result = get_image_model_billing(request.model)
    if not billing_result:
        return "잘못된 모델입니다.", None, None
    else:
        in_billing, out_billing = billing_result
    
    if user.trial and user.trial_remaining <= 0:
        return "체험판이 종료되었습니다.\n\n자세한 정보는 admin@shilvister.net으로 문의해 주세요.", None, None
    if not user.admin and (in_billing + out_billing) >= 0.1:
        return "해당 모델을 사용할 권한이 없습니다.\n\n자세한 정보는 admin@shilvister.net으로 문의해 주세요.", None, None
    if not request.message:
        return "프롬프트가 비어 있습니다. 내용을 입력해 주세요.", None, None
    return None, in_billing, out_billing
    
def get_conversation(user: User, conversation_id: str, memory):
    conversation = conversation_collection.find_one(
        {"user_id": user.user_id, "conversation_id": conversation_id},
        {"conversation": {"$slice": -memory }}
    )
    return conversation.get("conversation", [])

def getVerbosity(verbosity_value: float, format_type: str) -> Any:
    if verbosity_value == 0:
        return None
        
    if format_type == "tokens":
        return int(verbosity_value * MAX_VERBOSITY_TOKENS)
    
    elif format_type == "binary":
        return "low" if verbosity_value < 0.5 else "high"
    
    elif format_type == "tertiary":
        if verbosity_value < 0.33:
            return "low"
        elif verbosity_value < 0.66:
            return "medium"
        else:
            return "high"
    
    return None

def getReason(reason_value: float, format_type: str) -> Any:
    if reason_value == 0:
        return None
        
    if format_type == "tokens":
        return int(reason_value * MAX_REASON_TOKENS)
    
    elif format_type == "binary":
        return "low" if reason_value < 0.5 else "high"
    
    elif format_type == "tertiary":
        if reason_value < 0.33:
            return "low"
        elif reason_value < 0.66:
            return "medium"
        else:
            return "high"
    
    return None

def normalize_assistant_content(content):
    content = re.sub(r'<think>.*?</think>', '', content, flags=re.DOTALL)
    content = re.sub(r'<citations>.*?</citations>', '', content, flags=re.DOTALL)
    content = re.sub(r'<tool_use>.*?</tool_use>', '', content, flags=re.DOTALL)
    content = re.sub(r'<tool_result>.*?</tool_result>', '', content, flags=re.DOTALL)
    
    return content.strip()

def get_model_billing(model_name):
    try:
        models_path = os.path.join(os.path.dirname(__file__), '..', 'config', 'chat_models.json')
        with open(models_path, 'r', encoding='utf-8') as f:
            models_data = json.load(f)
        
        for model in models_data['models']:
            if model['model_name'] == model_name:
                return float(model['billing']['in_billing']), float(model['billing']['out_billing'])
        
        logger.warning(f"Model {model_name} not found in config/chat_models.json")
        return None
    except Exception as ex:
        logger.error(f"Error reading config/chat_models.json: {str(ex)}")
        return None

def get_image_model_billing(model_name):
    try:
        models_path = os.path.join(os.path.dirname(__file__), '..', 'config', 'image_models.json')
        with open(models_path, 'r', encoding='utf-8') as f:
            models_data = json.load(f)
        
        for model in models_data['models']:
            if model['model_name'] == model_name:
                return float(model['billing']['in_billing']), float(model['billing']['out_billing'])
        
        logger.warning(f"Image model {model_name} not found in config/image_models.json")
        return None
    except Exception as ex:
        logger.error(f"Error reading config/image_models.json: {str(ex)}")
        return None

def calculate_billing(user: User, model_name, token_usage, in_billing_rate: float, out_billing_rate: float):
    if token_usage:
        input_tokens = token_usage.get('input_tokens', 0)
        output_tokens = token_usage.get('output_tokens', 0)
        reasoning_tokens = token_usage.get('reasoning_tokens', 0)

        input_cost = input_tokens * (in_billing_rate / 1000000)
        output_cost = (output_tokens + reasoning_tokens) * (out_billing_rate / 1000000)
        total_cost = input_cost + output_cost
        
        billing_data = {
            "name": user.name,
            "user_id": user.user_id,
            "model": model_name,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "reasoning_tokens": reasoning_tokens,
            "total_cost": total_cost
        }
        logger.info(f"BILLING: {json.dumps(billing_data, ensure_ascii=False, indent=2)}")
    else:
        logger.error("BILLING_ERROR: No token usage provided")
        total_cost = 0
        
    return total_cost

def calculate_image_billing(user: User, model_name, in_billing_rate: float, out_billing_rate: float):
    total_cost = in_billing_rate + out_billing_rate
    
    billing_data = {
        "name": user.name,
        "user_id": user.user_id,
        "model": model_name,
        "total_cost": total_cost
    }
    logger.info(f"IMAGE_BILLING: {json.dumps(billing_data, ensure_ascii=False, indent=2)}")
        
    return total_cost

def save_conversation(user: User, user_message, response_text, token_usage, request: ChatRequest, in_billing: float, out_billing: float):
    response_data = {
        "name": user.name,
        "user_id": user.user_id,
        "conversation_id": request.conversation_id,
        "assistant_message": response_text
    }

    logger.info(f"ASSISTANT_RESPONSE: {json.dumps(response_data, ensure_ascii=False, indent=2)}")
    
    formatted_response = {"role": "assistant", "content": response_text or "\u200B"}
    billing = calculate_billing(user, request.model, token_usage, in_billing, out_billing)
    
    if user.trial:
        user_collection.update_one(
            {"_id": ObjectId(user.user_id)},
            {"$inc": {"trial_remaining": -1}}
        )
    else:
        user_collection.update_one(
            {"_id": ObjectId(user.user_id)},
            {"$inc": {"billing": billing}}
        )
        
    conversation_collection.update_one(
        {"user_id": user.user_id, "conversation_id": request.conversation_id},
        {
            "$push": {
                "conversation": {
                    "$each": [user_message, formatted_response]
                }
            },
            "$set": {
                "model": request.model,
                "reasoning": request.reasoning,
                "search": request.search,
                "deep_research": request.deep_research,
                "dan": request.dan,
                "mcp": request.mcp,
                "temperature": request.temperature,
                "reason": request.reason,
                "verbosity": request.verbosity,
                "memory": request.memory,
                "instructions": request.instructions,
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )
    
def save_image_conversation(user: User, request: ImageGenerateRequest, image_bytes, in_billing: float, out_billing: float) -> dict:
    file_name = f"{uuid.uuid4().hex}.png"
    file_path = os.path.join(generated_image_path, file_name)
    with open(file_path, "wb") as f:
        f.write(image_bytes)

    image_data = {
        "type": "image",
        "name": file_name,
        "content": f"/generated/images/{file_name}"
    }
    
    billing = calculate_image_billing(user, request.model, in_billing, out_billing)
    
    if user.trial:
        user_collection.update_one(
            {"_id": ObjectId(user.user_id)},
            {"$inc": {"trial_remaining": -2}}
        )
    else:
        user_collection.update_one(
            {"_id": ObjectId(user.user_id)},
            {"$inc": {"billing": billing}}
        )

    user_message = {"role": "user", "content": request.message}
    assistant_message = {"role": "assistant", "content": image_data}

    conversation_collection.update_one(
        {"user_id": user.user_id, "conversation_id": request.conversation_id},
        {
            "$push": {
                "conversation": {
                    "$each": [user_message, assistant_message]
                }
            },
            "$set": {
                "model": request.model,
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )

    return image_data

def save_alias(user: User, conversation_id: str, alias: str):
    conversation_collection.update_one(
        {"user_id": user.user_id, "conversation_id": conversation_id},
        {"$set": {"alias": alias}}
    )