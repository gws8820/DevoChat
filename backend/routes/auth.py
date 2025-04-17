import os
import jwt
import bcrypt
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, Cookie, Depends, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, constr
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from datetime import datetime
from jwt.exceptions import ExpiredSignatureError, InvalidTokenError

load_dotenv()
router = APIRouter()

# Motor client
mongoclient = AsyncIOMotorClient(os.getenv('MONGODB_URI'))
db = mongoclient.chat_db
collection = db.users

# JWT
AUTH_KEY = os.getenv('AUTH_KEY')
ALGORITHM = 'HS256'

# Pydantic Model
class RegisterUser(BaseModel):
    name: constr(strip_whitespace=True, min_length=1)
    email: EmailStr
    password: constr(min_length=8, max_length=20)

class LoginUser(BaseModel):
    email: EmailStr
    password: constr(strip_whitespace=True, min_length=1)

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
    if await collection.find_one({"email": user.email}):
        raise HTTPException(status_code=400, detail="이미 존재하는 사용자입니다.")
    
    new_user = {
        "name": user.name,
        "email": user.email,
        "password": hash_password(user.password),
        "billing": 0.0,
        "admin": False,
        "trial": True,
        "trial_remaining": 10,
        "created_at": datetime.utcnow()
    }
    result = await collection.insert_one(new_user)
    return {"message": "Registration Success!", "user_id": str(result.inserted_id)}

@router.post("/login")
async def login(user: LoginUser):
    db_user = await collection.find_one({"email": user.email})
    if not db_user or not verify_password(user.password, db_user["password"]):
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호 오류입니다.")
    
    token = jwt.encode(
        {
            "user_id": str(db_user["_id"]),
            "name": db_user["name"],
            "email": db_user["email"]
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

# 현재 사용자 가져오기
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
    
    db_user = await collection.find_one({"_id": ObjectId(user_id)})
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
        trial=db_user.get("trial"),
        trial_remaining=db_user.get("trial_remaining", 0)
    )