import firebase_admin
from firebase_admin import credentials, firestore
import json
from datetime import datetime

def initialize_firebase():
    """Initialize Firebase Admin SDK"""
    cred = credentials.Certificate("attendmax-a79f3-firebase-adminsdk-fbsvc-5b7357bc6d.json")
    try:
        firebase_admin.initialize_app(cred)
    except ValueError:
        pass  # App already initialized
    return firestore.client()

def create_collections(db):
    """Create all required collections with sample data"""
    collections = [
        'users',
        'attendance',
        'faculty',
        'courses',
        'timetable',
        'exams',
        'results',
        'library_books',
        'fees',
        'notifications'
    ]
    
    for collection in collections:
        if not db.collection(collection).get():
            print(f"Creating collection: {collection}")
            # Add a dummy document to create the collection
            db.collection(collection).add({
                'setup': True,
                'timestamp': datetime.now()
            })

def create_indexes(db):
    """Create required composite indexes"""
    # Note: Some of these indexes need to be created manually in the Firebase Console
    print("\nRequired indexes to create in Firebase Console:")
    print("\n1. Collection: attendance")
    print("   Fields:")
    print("   - department (Ascending)")
    print("   - timestamp (Descending)")
    
    print("\n2. Collection: timetable")
    print("   Fields:")
    print("   - department (Ascending)")
    print("   - year (Ascending)")
    print("   - semester (Ascending)")
    
    print("\n3. Collection: results")
    print("   Fields:")
    print("   - department (Ascending)")
    print("   - exam_name (Ascending)")
    print("   - status (Ascending)")

def setup_security_rules():
    """Print recommended security rules"""
    rules = {
        "rules": {
            "users": {
                ".read": "auth != null",
                ".write": "auth != null && auth.token.admin == true"
            },
            "attendance": {
                ".read": "auth != null",
                ".write": "auth != null"
            },
            "faculty": {
                ".read": "auth != null",
                ".write": "auth != null && auth.token.admin == true"
            },
            "courses": {
                ".read": "auth != null",
                ".write": "auth != null && auth.token.admin == true"
            },
            "timetable": {
                ".read": "auth != null",
                ".write": "auth != null && auth.token.admin == true"
            },
            "exams": {
                ".read": "auth != null",
                ".write": "auth != null && auth.token.admin == true"
            },
            "results": {
                ".read": "auth != null",
                ".write": "auth != null && auth.token.admin == true"
            },
            "library_books": {
                ".read": "auth != null",
                ".write": "auth != null && auth.token.admin == true"
            },
            "fees": {
                ".read": "auth != null",
                ".write": "auth != null && auth.token.admin == true"
            },
            "notifications": {
                ".read": "auth != null",
                ".write": "auth != null && auth.token.admin == true"
            }
        }
    }
    
    print("\nRecommended Security Rules:")
    print(json.dumps(rules, indent=2))

def main():
    print("Setting up Firebase...")
    db = initialize_firebase()
    
    print("\nCreating collections...")
    create_collections(db)
    
    print("\nSetting up indexes...")
    create_indexes(db)
    
    print("\nSetting up security rules...")
    setup_security_rules()
    
    print("\nFirebase setup complete!")
    print("\nIMPORTANT:")
    print("1. Create the composite indexes in Firebase Console")
    print("2. Update the security rules in Firebase Console")
    print("3. Enable Authentication methods (Email/Password) in Firebase Console")
    print("4. Set up proper CORS rules for storage bucket if using file uploads")

if __name__ == "__main__":
    main() 