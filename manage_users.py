import firebase_admin
from firebase_admin import credentials, auth, firestore
import json
from datetime import datetime

# Initialize Firebase Admin SDK
cred = credentials.Certificate("attendmax-a79f3-firebase-adminsdk-fbsvc-5b7357bc6d.json")
try:
    firebase_admin.initialize_app(cred)
except ValueError:
    # App already initialized
    pass

# Initialize Firestore
db = firestore.client()

# Department options
DEPARTMENTS = {
    "1": "AIDS",  # AI & Data Science
    "2": "CY",    # Cyber Security
    "3": "CSE",   # Computer Science
    "4": "AIML"   # AI & Machine Learning
}

# Year options
YEARS = {
    "1": "FY",  # First Year
    "2": "SY",  # Second Year
    "3": "TY",  # Third Year
    "4": "LY"   # Final Year
}

# Semester options by year
SEMESTERS = {
    "FY": ["SEM1", "SEM2"],
    "SY": ["SEM3", "SEM4"],
    "TY": ["SEM5", "SEM6"],
    "LY": ["SEM7", "SEM8"]
}

def create_user(email, password, display_name, role, department=None, year=None, semester=None):
    """
    Create a new user in Firebase Authentication with additional information for students
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
        
        # Store additional data for students
        if role == 'student' and department and year and semester:
            db.collection('students').document(user.uid).set({
                'department': department,
                'year': year,
                'semester': semester,
                'created_at': datetime.now()
            })
        
        print(f"Successfully created user: {email}")
        print(f"User ID: {user.uid}")
        print(f"Role: {role}")
        
        if role == 'student':
            print(f"Department: {department}")
            print(f"Year: {year}")
            print(f"Semester: {semester}")
        
        return user
    except Exception as e:
        print(f"Error creating user: {str(e)}")
        return None

def update_student(email, department=None, year=None, semester=None):
    """
    Update student information in Firestore
    """
    try:
        # Get user by email
        user = auth.get_user_by_email(email)
        
        # Check if user exists and has student role
        custom_claims = user.custom_claims or {}
        if custom_claims.get('role') != 'student':
            print(f"User {email} is not a student")
            return False
        
        # Update student information
        update_data = {}
        if department:
            update_data['department'] = department
        if year:
            update_data['year'] = year
        if semester:
            update_data['semester'] = semester
        
        if update_data:
            update_data['updated_at'] = datetime.now()
            db.collection('students').document(user.uid).set(update_data, merge=True)
            print(f"Successfully updated student information for {email}")
            return True
        else:
            print("No information to update")
            return False
    except Exception as e:
        print(f"Error updating student: {str(e)}")
        return False

def list_all_users():
    """
    List all users in Firebase Authentication with additional information for students
    """
    try:
        # Get all users
        users = []
        page = auth.list_users()
        for user in page.users:
            custom_claims = user.custom_claims or {}
            role = custom_claims.get('role', 'unknown')
            
            user_data = {
                'uid': user.uid,
                'email': user.email,
                'display_name': user.display_name,
                'role': role
            }
            
            # Get additional student data if available
            if role == 'student':
                student_doc = db.collection('students').document(user.uid).get()
                if student_doc.exists:
                    student_data = student_doc.to_dict()
                    user_data.update({
                        'department': student_data.get('department', ''),
                        'year': student_data.get('year', ''),
                        'semester': student_data.get('semester', '')
                    })
            
            users.append(user_data)
        
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
        
        # Delete student data from Firestore if exists
        db.collection('students').document(user.uid).delete()
        
        # Delete user from Firebase Auth
        auth.delete_user(user.uid)
        print(f"Successfully deleted user: {email}")
    except Exception as e:
        print(f"Error deleting user: {str(e)}")

def get_department_choice():
    """Get department choice from user"""
    print("\nAvailable Departments:")
    for key, value in DEPARTMENTS.items():
        print(f"{key}. {value}")
    
    while True:
        choice = input("Select department (1-4): ")
        if choice in DEPARTMENTS:
            return DEPARTMENTS[choice]
        print("Invalid choice. Please try again.")

def get_year_choice():
    """Get year choice from user"""
    print("\nAvailable Years:")
    for key, value in YEARS.items():
        print(f"{key}. {value}")
    
    while True:
        choice = input("Select year (1-4): ")
        if choice in YEARS:
            return YEARS[choice]
        print("Invalid choice. Please try again.")

def get_semester_choice(year):
    """Get semester choice based on year"""
    if year not in SEMESTERS:
        return None
    
    semesters = SEMESTERS[year]
    print("\nAvailable Semesters:")
    for i, sem in enumerate(semesters, 1):
        sem_num = sem.replace("SEM", "")
        print(f"{i}. Semester {sem_num}")
    
    while True:
        choice = input(f"Select semester (1-{len(semesters)}): ")
        try:
            idx = int(choice) - 1
            if 0 <= idx < len(semesters):
                return semesters[idx]
        except ValueError:
            pass
        print("Invalid choice. Please try again.")

if __name__ == "__main__":
    while True:
        print("\n1. Create Admin User")
        print("2. Create Student User")
        print("3. Update Student Information")
        print("4. List All Users")
        print("5. Delete User")
        print("6. Exit")
        
        choice = input("\nEnter your choice (1-6): ")
        
        if choice == "1":
            email = input("Enter admin email: ")
            password = input("Enter password (min 6 characters): ")
            name = input("Enter admin name: ")
            create_user(email, password, name, "admin")
        
        elif choice == "2":
            email = input("Enter student email: ")
            password = input("Enter password (min 6 characters): ")
            name = input("Enter student name: ")
            department = get_department_choice()
            year = get_year_choice()
            semester = get_semester_choice(year)
            create_user(email, password, name, "student", department, year, semester)
        
        elif choice == "3":
            email = input("Enter student email: ")
            try:
                user = auth.get_user_by_email(email)
                custom_claims = user.custom_claims or {}
                if custom_claims.get('role') != 'student':
                    print(f"User {email} is not a student")
                    continue
                
                print("\nUpdate Student Information")
                print("1. Update Department")
                print("2. Update Year and Semester")
                print("3. Update All")
                update_choice = input("Enter your choice (1-3): ")
                
                department = None
                year = None
                semester = None
                
                if update_choice in ["1", "3"]:
                    department = get_department_choice()
                
                if update_choice in ["2", "3"]:
                    year = get_year_choice()
                    semester = get_semester_choice(year)
                
                update_student(email, department, year, semester)
            except auth.UserNotFoundError:
                print(f"User {email} not found")
        
        elif choice == "4":
            list_all_users()
        
        elif choice == "5":
            email = input("Enter user email to delete: ")
            delete_user(email)
        
        elif choice == "6":
            print("Exiting...")
            break
        
        else:
            print("Invalid choice. Please try again.") 