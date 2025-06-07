import os
import jwt
import bcrypt
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, Cookie, Depends, Query, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, constr
from typing import List, Annotated
from bson import ObjectId
from datetime import datetime, timezone, timedelta
from jwt.exceptions import ExpiredSignatureError, InvalidTokenError
from db_util import Database

load_dotenv()
router = APIRouter()
db = Database.get_db()
collection = db.users

# JWT
AUTH_KEY = os.getenv('AUTH_KEY')
ALGORITHM = 'HS256'

# Pydantic Model
class RegisterUser(BaseModel):
    name: Annotated[str, constr(strip_whitespace=True, min_length=1)]
    email: EmailStr
    password: Annotated[str, constr(min_length=8, max_length=20)]

class LoginUser(BaseModel):
    email: EmailStr
    password: Annotated[str, constr(strip_whitespace=True, min_length=1)]

class User(BaseModel):
    user_id: str
    name: str
    email: str
    billing: float
    admin: bool
    trial: bool
    trial_remaining: int = 0

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode(), hashed_password.encode())

@router.post("/register")
async def register(user: RegisterUser):
    if collection.find_one({"email": user.email}):
        raise HTTPException(status_code=400, detail="이미 존재하는 사용자입니다.")
    
    new_user = {
        "name": user.name,
        "email": user.email,
        "password": hash_password(user.password),
        "billing": 0.0,
        "admin": False,
        "trial": True,
        "trial_remaining": 10,
        "created_at": datetime.now(timezone.utc)
    }
    result = collection.insert_one(new_user)
    return {"message": "Registration Success!", "user_id": str(result.inserted_id)}

@router.post("/login")
async def login(user: LoginUser):
    db_user = collection.find_one({"email": user.email})
    if not db_user or not verify_password(user.password, db_user["password"]):
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호 오류입니다.")
    
    token = jwt.encode(
        {
            "user_id": str(db_user["_id"]),
            "name": db_user["name"],
            "email": db_user["email"],
            "exp": datetime.now(timezone.utc) + timedelta(days=7)
        },
        AUTH_KEY,
        algorithm=ALGORITHM
    )
    
    response = JSONResponse(content={
        "message": "Login Success.",
        "user_id": str(db_user["_id"]),
        "name": db_user["name"]
    })
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite='Lax',
        max_age=60 * 60 * 24 * 7
    )
    return response

@router.post("/logout")
async def logout():
    response = JSONResponse(content={"message": "Successfully Logged Out"})
    response.delete_cookie("access_token")
    return response

@router.get("/auth/status")
async def get_auth_status(access_token: str = Cookie(None)):
    if not access_token:
        return {"logged_in": False}
    
    try:
        payload = jwt.decode(access_token, AUTH_KEY, algorithms=[ALGORITHM])
        return {
            "logged_in": True,
            "user_id": payload["user_id"],
            "name": payload["name"],
            "email": payload["email"]
        }
    except (ExpiredSignatureError, InvalidTokenError):
        return {"logged_in": False, "error": "Invalid or expired token"}

@router.get("/auth/user")
async def get_current_user(access_token: str = Cookie(None)) -> User:
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )
    
    try:
        payload = jwt.decode(access_token, AUTH_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("user_id")
    except (ExpiredSignatureError, InvalidTokenError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )
    
    db_user = collection.find_one({"_id": ObjectId(user_id)})
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    
    return User(
        user_id=str(db_user["_id"]),
        name=db_user["name"],
        email=db_user["email"],
        billing=db_user["billing"],
        admin=db_user["admin"],
        trial=db_user["trial"],
        trial_remaining=db_user["trial_remaining"]
    )

async def check_admin(access_token: str = Cookie(None)):
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )
    
    try:
        payload = jwt.decode(access_token, AUTH_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("user_id")
    except (ExpiredSignatureError, InvalidTokenError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )
    
    db_user = collection.find_one({"_id": ObjectId(user_id)})
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    
    if not db_user.get("admin", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required"
        )
    
    return db_user

@router.get("/users", response_model=List[User])
async def get_all_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    _ = Depends(check_admin)
):
    users = []
    cursor = collection.find({}).skip(skip).limit(limit)
    
    for user in cursor:
        users.append(User(
            user_id=str(user["_id"]),
            name=user["name"],
            email=user["email"],
            billing=user["billing"],
            admin=user["admin"],
            trial=user["trial"],
            trial_remaining=user["trial_remaining"]
        ))
    
    return users

@router.patch("/users/{user_id}")
async def update_user_status(
    user_id: str,
    user_data: dict,
    _ = Depends(check_admin)
):
    try:
        if not ObjectId.is_valid(user_id):
            raise HTTPException(status_code=400, detail="Invalid User ID")
            
        user = collection.find_one({"_id": ObjectId(user_id)})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
            
        update_data = {
            "trial": user_data["trial"],
            "trial_remaining": 10 if user_data["trial"] else 0
        }
        
        collection.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": update_data}
        )
        
        updated_user = collection.find_one({"_id": ObjectId(user_id)})
        
        return User(
            user_id=str(updated_user["_id"]),
            name=updated_user["name"],
            email=updated_user["email"],
            billing=updated_user["billing"],
            admin=updated_user["admin"],
            trial=updated_user["trial"],
            trial_remaining=updated_user["trial_remaining"]
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error occured: {str(e)}")