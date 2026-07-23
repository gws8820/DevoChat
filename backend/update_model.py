import os
import sys
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

def main():
    if len(sys.argv) != 3:
        print("usage: python update_model.py <old_model> <new_model>")
        sys.exit(1)

    old_model, new_model = sys.argv[1], sys.argv[2]

    uri = os.getenv("MONGODB_URI")
    if not uri:
        print("MONGODB_URI is not set in .env")
        sys.exit(1)

    client = MongoClient(uri, serverSelectionTimeoutMS=8000)
    db = client.devochat

    total_modified = 0
    for collection_name in ("conversations", "shared_conversations"):
        if collection_name not in db.list_collection_names():
            continue
        result = db[collection_name].update_many(
            {"model": old_model}, {"$set": {"model": new_model}}
        )
        print(f"{collection_name}: matched={result.matched_count} modified={result.modified_count}")
        total_modified += result.modified_count

    print(f"total modified: {total_modified}  ({old_model} -> {new_model})")


if __name__ == "__main__":
    main()
