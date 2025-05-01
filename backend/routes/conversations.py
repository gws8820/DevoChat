import os
import uuid
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from datetime import datetime
from .auth import User, get_current_user, check_admin
from .responses_client import get_alias

load_dotenv()
router = APIRouter()

# Motor client
mongo_client = AsyncIOMotorClient(os.getenv('MONGODB_URI'))
db = mongo_client.chat_db
conversations_collection = db.conversations

# Pydantic
class NewConversationRequest(BaseModel):
    user_message: str
    model: str
    temperature: float
    reason: int
    system_message: str

class RenameRequest(BaseModel):
    alias: str

@router.get("/conversations", response_model=dict)
async def get_conversations(current_user: User = Depends(get_current_user)):
    user_id = current_user.user_id
    cursor = conversations_collection.find(
        {"user_id": user_id},
        {"_id": 1, "user_id": 1, "conversation_id": 1, "alias": 1}
    )
    conversations = []
    async for doc in cursor:
        conversations.append({
            "_id": str(doc["_id"]),
            "user_id": doc["user_id"],
            "conversation_id": doc["conversation_id"],
            "alias": doc["alias"]
        })
    return {"conversations": conversations}

@router.get("/conversations/{user_id}", response_model=dict)
async def get_user_conversations(
    user_id: str, 
    admin_user = Depends(check_admin)
):
    if not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=400, detail="Invalid User ID")
    
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    cursor = conversations_collection.find(
        {"user_id": user_id},
        {"_id": 1, "user_id": 1, "conversation_id": 1, "alias": 1, "model": 1}
    ).sort("created_at", -1)
    
    conversations = []
    async for doc in cursor:
        conversations.append({
            "_id": str(doc["_id"]),
            "user_id": doc["user_id"],
            "conversation_id": doc["conversation_id"],
            "alias": doc["alias"],
            "model": doc["model"]
        })
    
    return {"conversations": conversations}

@router.get("/conversation/{conversation_id}", response_model=dict)
async def get_conversation(conversation_id: str, current_user: User = Depends(get_current_user)):
    doc = await conversations_collection.find_one({"conversation_id": conversation_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if doc["user_id"] != current_user.user_id and not current_user.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this conversation"
        )
    return {
        "conversation_id": doc["conversation_id"],
        "alias": doc["alias"],
        "model": doc["model"],
        "temperature": doc["temperature"],
        "reason": doc["reason"],
        "system_message": doc["system_message"],
        "messages": doc["conversation"]
    }

@router.post("/new_conversation", response_model=dict)
async def create_new_conversation(request_data: NewConversationRequest, current_user: User = Depends(get_current_user)):
    alias = "제목 없음"
    try:
        alias = await get_alias(request_data.user_message)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Alias generation failed: {str(e)}")
    conversation_id = str(uuid.uuid4())
    user_id = current_user.user_id
    new_conversation = {
        "user_id": user_id,
        "conversation_id": conversation_id,
        "alias": alias,
        "model": request_data.model,
        "temperature": request_data.temperature,
        "reason": request_data.reason,
        "system_message": request_data.system_message,
        "conversation": [],
        "created_at": datetime.utcnow()
    }
    await conversations_collection.insert_one(new_conversation)
    return {
        "message": "New conversation created",
        "alias": alias,
        "conversation_id": conversation_id
    }

@router.put("/conversation/{conversation_id}/rename", response_model=dict)
async def rename_conversation(
    conversation_id: str,
    request: RenameRequest,
    current_user: User = Depends(get_current_user)
):
    user_id = current_user.user_id
    result = await conversations_collection.update_one(
        {"user_id": user_id, "conversation_id": conversation_id},
        {"$set": {"alias": request.alias}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {
        "message": "Conversation renamed successfully",
        "conversation_id": conversation_id,
        "new_alias": request.alias
    }

@router.delete("/conversation/all", response_model=dict)
async def delete_all_conversation(current_user: User = Depends(get_current_user)):
    user_id = current_user.user_id
    result = await conversations_collection.delete_many({
        "user_id": user_id,
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Conversation not found or already deleted")
    return {"message": "Conversations deleted successfully"}

@router.delete("/conversation/{conversation_id}", response_model=dict)
async def delete_conversation(conversation_id: str, current_user: User = Depends(get_current_user)):
    user_id = current_user.user_id
    result = await conversations_collection.delete_one({
        "user_id": user_id,
        "conversation_id": conversation_id
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Conversation not found or already deleted")
    return {"message": "Conversation deleted successfully", "conversation_id": conversation_id}
    
@router.delete("/conversation/{conversation_id}/{startIndex}", response_model=dict)
async def delete_messages_from_index(
    conversation_id: str,
    startIndex: int,
    current_user: User = Depends(get_current_user)
):
    user_id = current_user.user_id
    doc = await conversations_collection.find_one({"user_id": user_id, "conversation_id": conversation_id})
    if doc is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    messages = doc.get("conversation", [])
    if startIndex < 0 or startIndex >= len(messages):
        raise HTTPException(status_code=400, detail="startIndex is out of range")
    
    new_messages = messages[:startIndex]
    await conversations_collection.update_one(
        {"_id": doc["_id"]},
        {"$set": {"conversation": new_messages}}
    )
    
    return {
        "message": "Conversation truncated successfully.",
        "conversation_id": conversation_id
    }