import firebase_admin
from firebase_admin import credentials, auth
import json

# Initialize Firebase Admin SDK
cred = credentials.Certificate("attendmax-a79f3-firebase-adminsdk-fbsvc-5b7357bc6d.json")
try:
    firebase_admin.initialize_app(cred)
except ValueError:
    # App already initialized
    pass

def create_user(email, password, display_name, role):
    """
    Create a new user in Firebase Authentication
    """
    try:
        # Create the user
        user = auth.create_user(
            email=email,
            password=password,
            display_name=display_name,
            email_verified=False
        )
        
        # Set custom claims to distinguish between admin and student
        custom_claims = {'role': role}
        auth.set_custom_user_claims(user.uid, custom_claims)
        
        print(f"Successfully created user: {email}")
        print(f"User ID: {user.uid}")
        print(f"Role: {role}")
        return user
    except Exception as e:
        print(f"Error creating user: {str(e)}")
        return None

def list_all_users():
    """
    List all users in Firebase Authentication
    """
    try:
        # Get all users
        users = []
        page = auth.list_users()
        for user in page.users:
            custom_claims = user.custom_claims or {}
            role = custom_claims.get('role', 'unknown')
            users.append({
                'uid': user.uid,
                'email': user.email,
                'display_name': user.display_name,
                'role': role
            })
        
        print("\nAll Users:")
        print(json.dumps(users, indent=2))
        return users
    except Exception as e:
        print(f"Error listing users: {str(e)}")
        return None

def delete_user(email):
    """
    Delete a user by email
    """
    try:
        user = auth.get_user_by_email(email)
        auth.delete_user(user.uid)
        print(f"Successfully deleted user: {email}")
    except Exception as e:
        print(f"Error deleting user: {str(e)}")

if __name__ == "__main__":
    while True:
        print("\n1. Create Admin User")
        print("2. Create Student User")
        print("3. List All Users")
        print("4. Delete User")
        print("5. Exit")
        
        choice = input("\nEnter your choice (1-5): ")
        
        if choice == "1":
            email = input("Enter admin email: ")
            password = input("Enter password (min 6 characters): ")
            name = input("Enter admin name: ")
            create_user(email, password, name, "admin")
        
        elif choice == "2":
            email = input("Enter student email: ")
            password = input("Enter password (min 6 characters): ")
            name = input("Enter student name: ")
            create_user(email, password, name, "student")
        
        elif choice == "3":
            list_all_users()
        
        elif choice == "4":
            email = input("Enter user email to delete: ")
            delete_user(email)
        
        elif choice == "5":
            print("Exiting...")
            break
        
        else:
            print("Invalid choice. Please try again.") 