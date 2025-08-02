import os
import re
import json
from dotenv import load_dotenv
from pymongo import MongoClient
from fastapi import APIRouter
from pydantic import BaseModel
from bson import ObjectId
from typing import Any, List, Dict, Optional
from logging_util import logger

class ChatRequest(BaseModel):
    conversation_id: str
    model: str
    in_billing: float
    out_billing: float
    temperature: float = 1.0
    reason: int = 0
    system_message: Optional[str] = None
    user_message: List[Dict[str, Any]]
    inference: bool = False
    search: bool = False
    deep_research: bool = False
    dan: bool = False
    mcp: List[str] = []
    stream: bool = True

class AliasRequest(BaseModel):
    conversation_id: str
    text: str

class ApiSettings(BaseModel):
    api_key: str
    base_url: str
    
load_dotenv()
router = APIRouter()

mongo_client = MongoClient(os.getenv('MONGODB_URI'))
db = mongo_client.chat_db
user_collection = db.users
conversation_collection = db.conversations

dan_prompt_path = os.path.join(os.path.dirname(__file__), '..', 'dan_prompt.txt')
try:
    with open(dan_prompt_path, 'r', encoding='utf-8') as f:
        DAN_PROMPT = f.read()
except FileNotFoundError:
    DAN_PROMPT = ""

markdown_prompt_path = os.path.join(os.path.dirname(__file__), '..', 'markdown_prompt.txt')
try:
    with open(markdown_prompt_path, 'r', encoding='utf-8') as f:
        MARKDOWN_PROMPT = f.read()
except FileNotFoundError:
    MARKDOWN_PROMPT = ""

alias_prompt_path = os.path.join(os.path.dirname(__file__), '..', 'alias_prompt.txt')
try:
    with open(alias_prompt_path, 'r', encoding='utf-8') as f:
        ALIAS_PROMPT = f.read()
except FileNotFoundError:
    ALIAS_PROMPT = ""

def check_user_permissions(user, request: ChatRequest):
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
    if not request.user_message:
        return "메시지 내용이 비어 있습니다. 내용을 입력해 주세요.", None, None
    return None, in_billing, out_billing

def get_conversation(user, conversation_id):
    conversation = conversation_collection.find_one(
        {"user_id": user.user_id, "conversation_id": conversation_id},
        {"conversation": {"$slice": -6}}
    )
    return conversation.get("conversation", []) 

def save_conversation(user, user_message, response_text, token_usage, request: ChatRequest, in_billing: float, out_billing: float):
    response_data = {
        "user_id": user.user_id,
        "conversation_id": request.conversation_id,
        "assistant_message": response_text
    }

    logger.info(f"ASSISTANT_RESPONSE: {json.dumps(response_data, ensure_ascii=False, indent=2)}")
    
    formatted_response = {"role": "assistant", "content": response_text or "\u200B"}
    billing = calculate_billing(request.model, token_usage, in_billing, out_billing)
    
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
                "temperature": request.temperature,
                "reason": request.reason,
                "system_message": request.system_message,
                "inference": request.inference,
                "search": request.search,
                "deep_research": request.deep_research,
                "dan": request.dan,
                "mcp": request.mcp
            }
        }
    )

def save_alias(user, conversation_id, alias):
    conversation_collection.update_one(
        {"user_id": user.user_id, "conversation_id": conversation_id},
        {"$set": {"alias": alias}}
    )

def get_model_billing(model_name):
    try:
        models_path = os.path.join(os.path.dirname(__file__), '..', 'models.json')
        with open(models_path, 'r', encoding='utf-8') as f:
            models_data = json.load(f)
        
        for model in models_data['models']:
            if model['model_name'] == model_name:
                return float(model['in_billing']), float(model['out_billing'])
        
        logger.warning(f"Model {model_name} not found in models.json")
        return None
    except Exception as ex:
        logger.error(f"Error reading models.json: {str(ex)}")
        return None
    
def calculate_billing(model_name, token_usage, in_billing_rate: float, out_billing_rate: float):
    if token_usage:
        input_tokens = token_usage.get('input_tokens', 0)
        output_tokens = token_usage.get('output_tokens', 0)
        reasoning_tokens = token_usage.get('reasoning_tokens', 0)

        input_cost = input_tokens * (in_billing_rate / 1000000)
        output_cost = (output_tokens + reasoning_tokens) * (out_billing_rate / 1000000)
        total_cost = input_cost + output_cost
        
        billing_data = {
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

def normalize_assistant_content(content):
    content = re.sub(r'<think>.*?</think>', '', content, flags=re.DOTALL)
    content = re.sub(r'<tool_use>.*?</tool_use>', '', content, flags=re.DOTALL)
    content = re.sub(r'<tool_result>.*?</tool_result>', '', content, flags=re.DOTALL)
    
    return content.strip()