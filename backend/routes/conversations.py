import os
import uuid
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from bson import ObjectId
from datetime import datetime, timezone
from .auth import User, get_current_user, check_admin
from db_util import Database

load_dotenv()
router = APIRouter()
db = Database.get_db()
conversations_collection = db.conversations

# Pydantic
class RenameRequest(BaseModel):
    alias: str

class StarRequest(BaseModel):
    starred: bool

@router.get("/conversations", response_model=dict)
async def get_conversations(current_user: User = Depends(get_current_user)):
    user_id = current_user.user_id
    cursor = conversations_collection.find(
        {"user_id": user_id},
        {"_id": 1, "user_id": 1, "conversation_id": 1, "alias": 1, "starred": 1, "starred_at": 1, "created_at": 1}
    ).sort([
        ("starred", -1),
        ("starred_at", -1),
        ("created_at", -1)
    ])
    conversations = []
    for doc in cursor:
        conversations.append({
            "_id": str(doc["_id"]),
            "user_id": doc["user_id"],
            "conversation_id": doc["conversation_id"],
            "alias": doc.get("alias", ""),
            "starred": doc["starred"],
            "starred_at": doc.get("starred_at").isoformat() if doc.get("starred_at") else None,
            "created_at": doc.get("created_at").isoformat() if doc.get("created_at") else None
        })
    return {"conversations": conversations}

@router.get("/conversations/{user_id}", response_model=dict)
async def get_user_conversations(
    user_id: str, 
    _ = Depends(check_admin)
):
    if not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=400, detail="Invalid User ID")
    
    user = db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    cursor = conversations_collection.find(
        {"user_id": user_id},
        {"_id": 1, "user_id": 1, "conversation_id": 1, "alias": 1, "model": 1, "created_at": 1}
    ).sort("created_at", -1)
    
    conversations = []
    for doc in cursor:
        conversations.append({
            "_id": str(doc["_id"]),
            "user_id": doc["user_id"],
            "alias": doc.get("alias", ""),
            "conversation_id": doc["conversation_id"],
            "model": doc["model"],
            "created_at": doc.get("created_at").isoformat() if doc.get("created_at") else None
        })
    
    return {"conversations": conversations}

@router.get("/conversation/{conversation_id}", response_model=dict)
async def get_conversation(conversation_id: str, current_user: User = Depends(get_current_user)):
    doc = conversations_collection.find_one({"conversation_id": conversation_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if doc["user_id"] != current_user.user_id and not current_user.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this conversation"
        )
    return {
        "conversation_id": doc["conversation_id"],
        "alias": doc.get("alias", ""),
        "model": doc.get("model", ""),
        "temperature": doc.get("temperature", 0.5),
        "reason": doc.get("reason", 0),
        "system_message": doc.get("system_message", ""),
        "inference": doc.get("inference", False),
        "search": doc.get("search", False),
        "deep_research": doc.get("deep_research", False),
        "dan": doc.get("dan", False),
        "mcp": doc.get("mcp", []),
        "messages": doc.get("conversation", [])
    }

@router.post("/new_conversation", response_model=dict)
async def create_new_conversation(current_user: User = Depends(get_current_user)):
    conversation_id = str(uuid.uuid4())
    user_id = current_user.user_id
    
    new_conversation = {
        "user_id": user_id,
        "conversation_id": conversation_id,
        "alias": None,
        "model": None,
        "temperature": None,
        "reason": None,
        "system_message": None,
        "inference": None,
        "search": None,
        "deep_research": None,
        "dan": None,
        "mcp": None,
        "conversation": [],
        "starred": False,
        "starred_at": None,
        "created_at": datetime.now(timezone.utc)
    }
    
    try:
        conversations_collection.insert_one(new_conversation)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to create conversation")
        
    return {
        "message": "New conversation created",
        "conversation_id": conversation_id,
        "created_at": new_conversation["created_at"].isoformat()
    }

@router.put("/conversation/{conversation_id}/rename", response_model=dict)
async def rename_conversation(
    conversation_id: str,
    request: RenameRequest,
    current_user: User = Depends(get_current_user)
):
    user_id = current_user.user_id
    result = conversations_collection.update_one(
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
    result = conversations_collection.delete_many({
        "user_id": user_id,
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Conversation not found or already deleted")
    return {"message": "Conversations deleted successfully"}

@router.delete("/conversation/{conversation_id}", response_model=dict)
async def delete_conversation(conversation_id: str, current_user: User = Depends(get_current_user)):
    user_id = current_user.user_id
    result = conversations_collection.delete_one({
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
    doc = conversations_collection.find_one({"user_id": user_id, "conversation_id": conversation_id})
    if doc is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    messages = doc.get("conversation", [])
    if startIndex < 0 or startIndex >= len(messages):
        raise HTTPException(status_code=400, detail="startIndex is out of range")
    
    new_messages = messages[:startIndex]
    conversations_collection.update_one(
        {"_id": doc["_id"]},
        {"$set": {"conversation": new_messages}}
    )
    
    return {
        "message": "Conversation truncated successfully.",
        "conversation_id": conversation_id
    }

@router.put("/conversation/{conversation_id}/star", response_model=dict)
async def toggle_star_conversation(
    conversation_id: str,
    request: StarRequest,
    current_user: User = Depends(get_current_user)
):
    user_id = current_user.user_id
    result = conversations_collection.update_one(
        {"user_id": user_id, "conversation_id": conversation_id},
        {
            "$set": {
                "starred": request.starred,
                "starred_at": datetime.now(timezone.utc) if request.starred else None
            }
        }
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {
        "message": "Conversation star status updated successfully"
    }