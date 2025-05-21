import os
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

class Database:
    client: MongoClient = None
    
    @classmethod
    def get_client(cls) -> MongoClient:
        if cls.client is None:
            mongo_uri = os.getenv('MONGODB_URI')
            cls.client = MongoClient(mongo_uri)
        return cls.client
    
    @classmethod
    def get_db(cls, db_name: str = "chat_db"):
        return cls.get_client()[db_name]
    
    @classmethod
    def close_connection(cls):
        if cls.client:
            cls.client.close()
            cls.client = None