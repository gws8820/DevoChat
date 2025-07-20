import os
import re
from dotenv import load_dotenv
from db_util import Database
from fastapi import APIRouter
from pydantic import BaseModel
from bson import ObjectId
from typing import Any, List, Dict, Optional

load_dotenv()
router = APIRouter()

db = Database.get_db()
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

def check_user_permissions(user, request: ChatRequest):
    if user.trial and user.trial_remaining <= 0:
        return "체험판이 종료되었습니다.\n\n자세한 정보는 admin@shilvister.net으로 문의해 주세요."
    if not user.admin and request.in_billing >= 10:
        return "해당 모델을 사용할 권한이 없습니다.\n\n자세한 정보는 admin@shilvister.net으로 문의해 주세요."
    if not request.user_message:
        return "메시지 내용이 비어 있습니다. 내용을 입력해 주세요."
    return None

def get_conversation(user, conversation_id):
    conversation = conversation_collection.find_one(
        {"user_id": user.user_id, "conversation_id": conversation_id},
        {"conversation": {"$slice": -6}}
    ).get("conversation", [])
    return conversation 

def save_conversation(user, user_message, response_text, token_usage, request: ChatRequest):
    formatted_response = {"role": "assistant", "content": response_text or "\u200B"}
    billing = calculate_billing(request.in_billing, request.out_billing, token_usage)
    
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
    
def calculate_billing(in_billing_rate, out_billing_rate, token_usage):
    input_tokens = token_usage.get('input_tokens', 0)
    output_tokens = token_usage.get('output_tokens', 0)
    reasoning_tokens = token_usage.get('reasoning_tokens', 0)

    input_cost = input_tokens * (in_billing_rate / 1000000)
    output_cost = (output_tokens + reasoning_tokens) * (out_billing_rate / 1000000)
    total_cost = input_cost + output_cost
    
    print(f"input_tokens: {input_tokens}, output_tokens: {output_tokens}, reasoning_tokens: {reasoning_tokens}, total_cost: {total_cost}", flush=True)
    
    return total_cost

def normalize_assistant_content(content):
    content = re.sub(r'<think>.*?</think>', '', content, flags=re.DOTALL)
    content = re.sub(r'<tool_use>.*?</tool_use>', '', content, flags=re.DOTALL)
    content = re.sub(r'<tool_result>.*?</tool_result>', '', content, flags=re.DOTALL)
    
    return content.strip()